import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { BookingType, Prisma, ServiceRequest } from '@prisma/client';
import { z } from 'zod';
import { AuthUser } from '../common/auth.types';
import { addMinutes, haversineKm, latLng } from '../common/util';
import { FilesService } from '../files/files.service';
import { MatchingService } from '../matching/matching.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { SettingsService } from '../settings/settings.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

export const CreateRequest = z
  .object({
    serviceId: z.string().min(1),
    bookingType: z.nativeEnum(BookingType),
    description: z.string().trim().min(3, 'Describe the work in a few words').max(1000),
    mediaFileIds: z.array(z.string()).max(6).default([]),
    quantity: z.number().int().min(1).max(50).default(1),
    scheduledAt: z.coerce.date().optional(),
    addressId: z.string().optional(),
    location: z.object({ ...latLng, addressText: z.string().trim().min(3).max(300) }).optional(),
    targetWorkerId: z.string().optional(),
  })
  .refine((v) => v.addressId || v.location, { message: 'Choose where the work is', path: ['location'] })
  .refine((v) => v.bookingType !== 'SCHEDULED' || v.scheduledAt, { message: 'Pick a date and time', path: ['scheduledAt'] });

export const QuoteBody = z.object({
  servicePaise: z.number().int().min(100).max(100_000_000),
  materialPaise: z.number().int().min(0).max(100_000_000).default(0),
  taxPaise: z.number().int().min(0).max(100_000_000).default(0),
  note: z.string().trim().max(600).optional(),
});

const OPEN: ServiceRequest['status'][] = ['SEARCHING', 'SENT', 'QUOTING', 'NO_WORKER'];
const fmtWhen = (r: { bookingType: BookingType; scheduledAt: Date | null }) =>
  r.bookingType === 'SCHEDULED' && r.scheduledAt
    ? r.scheduledAt.toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })
    : r.bookingType === 'QUOTE'
      ? 'Quote request'
      : 'As soon as possible';

@Injectable()
export class RequestsService {
  private log = new Logger('Requests');

  constructor(
    private readonly prisma: PrismaService,
    private readonly matching: MatchingService,
    private readonly settings: SettingsService,
    private readonly subs: SubscriptionsService,
    private readonly files: FilesService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
  ) {}

  private history(requestId: string, from: string | null, to: string, actorId: string | null, note?: string, db: Prisma.TransactionClient | PrismaService = this.prisma) {
    return db.statusHistory.create({ data: { requestId, from, to, actorId, note } });
  }

  // ─────────────── Client side ───────────────

  async create(me: AuthUser, input: z.infer<typeof CreateRequest>) {
    if (!(await this.subs.hasClientAccess(me.id))) {
      throw new ForbiddenException({ message: 'Unlock 30-day access for ₹9 to send requests', code: 'ACCESS_REQUIRED' });
    }
    const s = await this.settings.get();
    const service = await this.prisma.service.findFirst({ where: { id: input.serviceId, active: true } });
    if (!service) throw new BadRequestException('This service is not available');
    if (!service.bookingTypes.includes(input.bookingType)) throw new BadRequestException('This booking type is not offered for this service');

    if (input.bookingType === 'SCHEDULED') {
      const at = input.scheduledAt!.getTime();
      if (at < Date.now() + service.minNoticeMin * 60000) throw new BadRequestException(`Book at least ${Math.round(service.minNoticeMin / 60)} hour(s) ahead for this service`);
      if (at > Date.now() + service.maxAdvanceDays * 86400000) throw new BadRequestException(`You can book up to ${service.maxAdvanceDays} days ahead`);
    }

    const dayAgo = new Date(Date.now() - 86400000);
    const [open, today] = await Promise.all([
      this.prisma.serviceRequest.count({ where: { clientId: me.id, status: { in: ['SEARCHING', 'SENT', 'QUOTING'] } } }),
      this.prisma.serviceRequest.count({ where: { clientId: me.id, createdAt: { gte: dayAgo } } }),
    ]);
    if (open >= s.maxOpenRequestsPerClient) throw new HttpException(`You already have ${open} open requests. Wait for them or cancel one.`, HttpStatus.TOO_MANY_REQUESTS);
    if (today >= s.maxRequestsPerClientPerDay) throw new HttpException('Daily request limit reached. Please try again tomorrow.', HttpStatus.TOO_MANY_REQUESTS);

    await this.files.ownedBy(me.id, input.mediaFileIds, ['REQUEST_MEDIA']);

    let loc: { lat: number; lng: number; addressText: string };
    if (input.addressId) {
      const a = await this.prisma.address.findFirst({ where: { id: input.addressId, userId: me.id } });
      if (!a) throw new BadRequestException('Address not found');
      loc = { lat: a.lat, lng: a.lng, addressText: [a.line, a.area, a.pincode].filter(Boolean).join(', ') };
    } else {
      loc = input.location!;
    }

    if (input.targetWorkerId) {
      const eligible = await this.matching.findEligible({
        serviceId: service.id, lat: loc.lat, lng: loc.lng, radiusKm: Math.max(...s.radiusStepsKm),
        bookingType: input.bookingType, scheduledAt: input.scheduledAt, durationMin: service.durationMin, onlyWorkerIds: [input.targetWorkerId], limit: 1,
      });
      if (!eligible.length) throw new BadRequestException('This worker is not available for this job right now. Try another worker or send to all nearby.');
    }

    const req = await this.prisma.serviceRequest.create({
      data: {
        clientId: me.id,
        serviceId: service.id,
        bookingType: input.bookingType,
        description: input.description,
        mediaFileIds: input.mediaFileIds,
        quantity: input.quantity,
        scheduledAt: input.bookingType === 'SCHEDULED' ? input.scheduledAt : null,
        lat: loc.lat,
        lng: loc.lng,
        addressText: loc.addressText,
        targetWorkerId: input.targetWorkerId ?? null,
        radiusKm: s.defaultRadiusKm,
        status: 'SEARCHING',
      },
    });
    await this.history(req.id, null, 'SEARCHING', me.id, 'Request created');
    await this.dispatch(req.id);
    return this.getForClient(me, req.id);
  }

  /** Sends the request to the next set of eligible workers, widening the radius step by step if nobody is found. */
  async dispatch(requestId: string) {
    const req = await this.prisma.serviceRequest.findUniqueOrThrow({ where: { id: requestId }, include: { service: true, offers: { select: { workerId: true } } } });
    if (req.status !== 'SEARCHING') return;
    const s = await this.settings.get();
    const offered = req.offers.map((o) => o.workerId);
    const steps = [...new Set([req.radiusKm, ...s.radiusStepsKm.filter((r) => r > req.radiusKm)])];

    for (const radiusKm of req.targetWorkerId ? [Math.max(...s.radiusStepsKm)] : steps) {
      const rows = await this.matching.findEligible({
        serviceId: req.serviceId, lat: req.lat, lng: req.lng, radiusKm,
        bookingType: req.bookingType, scheduledAt: req.scheduledAt, durationMin: req.service.durationMin,
        excludeWorkerIds: offered, onlyWorkerIds: req.targetWorkerId ? [req.targetWorkerId] : undefined,
      });
      if (!rows.length) continue;

      const isQuote = req.bookingType === 'QUOTE';
      const expiresAt = isQuote ? addMinutes(new Date(), s.quoteRequestHours * 60) : new Date(Date.now() + s.acceptTimeoutSec * 1000);
      const round = req.round + 1;
      const sent = await this.prisma.$transaction(async (tx) => {
        const claim = await tx.serviceRequest.updateMany({
          where: { id: req.id, status: 'SEARCHING' },
          data: { status: isQuote ? 'QUOTING' : 'SENT', radiusKm, round, roundExpiresAt: expiresAt },
        });
        if (!claim.count) return false;
        await tx.requestOffer.createMany({
          data: rows.map((r) => ({ requestId: req.id, workerId: r.workerId, round, distanceKm: r.distanceKm, expiresAt })),
          skipDuplicates: true,
        });
        await this.history(req.id, 'SEARCHING', isQuote ? 'QUOTING' : 'SENT', null, `Sent to ${rows.length} worker(s) within ${radiusKm} KM`, tx);
        return true;
      });
      if (!sent) return;

      const payload = { requestId: req.id, service: req.service.name, when: fmtWhen(req), bookingType: req.bookingType, expiresAt };
      for (const r of rows) this.realtime.emitToUser(r.workerId, 'offer:new', { ...payload, distanceKm: r.distanceKm });
      await this.notifications.notifyMany(rows.map((r) => r.workerId), {
        type: 'NEW_REQUEST',
        title: `New request · ${req.service.name}`,
        body: `${fmtWhen(req)}. ${isQuote ? 'Send your quote.' : `Accept within ${s.acceptTimeoutSec} seconds.`}`,
        link: '/worker/jobs',
      });
      this.realtime.emitToUser(req.clientId, 'request:update', { id: req.id, status: isQuote ? 'QUOTING' : 'SENT', notified: rows.length, radiusKm });
      return;
    }

    const none = await this.prisma.serviceRequest.updateMany({ where: { id: req.id, status: 'SEARCHING' }, data: { status: 'NO_WORKER', roundExpiresAt: null } });
    if (none.count) {
      await this.history(req.id, 'SEARCHING', 'NO_WORKER', null, 'No eligible worker found');
      this.realtime.emitToUser(req.clientId, 'request:update', { id: req.id, status: 'NO_WORKER' });
      await this.notifications.notify({
        userId: req.clientId,
        type: 'NO_WORKER',
        title: 'No worker accepted yet',
        body: 'Aapki search jaari hai. Try a wider area, another time, or pick a worker yourself.',
        link: `/client/requests/${req.id}`,
      });
    }
  }

  async retry(me: AuthUser, requestId: string) {
    const req = await this.prisma.serviceRequest.findFirst({ where: { id: requestId, clientId: me.id } });
    if (!req) throw new NotFoundException('Request not found');
    if (req.status !== 'NO_WORKER') throw new BadRequestException('Only requests without a worker can be searched again');
    if (!(await this.subs.hasClientAccess(me.id))) throw new ForbiddenException({ message: 'Your access has ended. Renew to continue.', code: 'ACCESS_REQUIRED' });
    const s = await this.settings.get();
    const nextRadius = s.radiusStepsKm.find((r) => r > req.radiusKm) ?? req.radiusKm;
    await this.prisma.serviceRequest.update({ where: { id: req.id }, data: { status: 'SEARCHING', radiusKm: nextRadius } });
    await this.history(req.id, 'NO_WORKER', 'SEARCHING', me.id, `Search again within ${nextRadius} KM`);
    await this.dispatch(req.id);
    return this.getForClient(me, req.id);
  }

  async cancelByClient(me: AuthUser, requestId: string, reason: string) {
    const req = await this.prisma.serviceRequest.findFirst({ where: { id: requestId, clientId: me.id } });
    if (!req) throw new NotFoundException('Request not found');
    if (!OPEN.includes(req.status)) throw new BadRequestException('This request can no longer be cancelled here. Cancel the booking instead.');
    const workers = await this.closeRequest(req.id, 'CANCELLED', me.id, reason);
    this.realtime.emitToUsers(workers, 'offer:closed', { requestId: req.id, reason: 'CANCELLED' });
    return { ok: true };
  }

  /** Ends a request and closes all its pending offers. Returns the workers who had an offer. */
  private async closeRequest(requestId: string, status: 'CANCELLED' | 'EXPIRED', actorId: string | null, note?: string) {
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.serviceRequest.update({ where: { id: requestId }, data: { status, cancelReason: note, roundExpiresAt: null } });
      const pending = await tx.requestOffer.findMany({ where: { requestId, response: 'PENDING' }, select: { workerId: true } });
      await tx.requestOffer.updateMany({ where: { requestId, response: 'PENDING' }, data: { response: 'CLOSED', respondedAt: new Date() } });
      await tx.quote.updateMany({ where: { requestId, status: 'ACTIVE' }, data: { status: 'REJECTED' } });
      await this.history(requestId, r.status, status, actorId, note, tx);
      return pending.map((p) => p.workerId);
    });
  }

  async listForClient(me: AuthUser, scope: 'open' | 'all') {
    const items = await this.prisma.serviceRequest.findMany({
      where: { clientId: me.id, ...(scope === 'open' ? { status: { in: OPEN } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { service: true, _count: { select: { offers: true, quotes: { where: { status: 'ACTIVE' } } } } },
    });
    return items.map((r) => ({
      id: r.id, code: `KRV-${r.number}`, service: r.service.name, bookingType: r.bookingType, status: r.status,
      scheduledAt: r.scheduledAt, createdAt: r.createdAt, roundExpiresAt: r.roundExpiresAt, radiusKm: r.radiusKm,
      notified: r._count.offers, quotes: r._count.quotes,
    }));
  }

  async getForClient(me: AuthUser, requestId: string) {
    const r = await this.prisma.serviceRequest.findFirst({
      where: { id: requestId, clientId: me.id },
      include: {
        service: true,
        history: { orderBy: { createdAt: 'asc' } },
        offers: { select: { response: true, round: true } },
        quotes: { where: { status: { in: ['ACTIVE', 'ACCEPTED'] } }, orderBy: { createdAt: 'desc' } },
        bookings: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    if (!r) throw new NotFoundException('Request not found');
    const workerIds = [...new Set([...r.quotes.map((q) => q.workerId), ...(r.acceptedWorkerId ? [r.acceptedWorkerId] : [])])];
    const workers = await this.workerCards(workerIds, r.lat, r.lng);
    const now = Date.now();
    return {
      id: r.id, code: `KRV-${r.number}`, status: r.status, bookingType: r.bookingType,
      service: { id: r.service.id, name: r.service.name }, description: r.description, quantity: r.quantity,
      scheduledAt: r.scheduledAt, addressText: r.addressText, radiusKm: r.radiusKm, roundExpiresAt: r.roundExpiresAt,
      createdAt: r.createdAt, cancelReason: r.cancelReason,
      notified: r.offers.length,
      declined: r.offers.filter((o) => o.response === 'REJECTED').length,
      acceptedWorker: r.acceptedWorkerId ? workers.get(r.acceptedWorkerId) ?? null : null,
      bookingId: r.bookings[0]?.id ?? null,
      quotes: r.quotes.map((q) => ({
        id: q.id, version: q.version, status: q.status, servicePaise: q.servicePaise, materialPaise: q.materialPaise,
        taxPaise: q.taxPaise, totalPaise: q.servicePaise + q.materialPaise + q.taxPaise, note: q.note,
        expiresAt: q.expiresAt, expired: q.status === 'ACTIVE' && q.expiresAt.getTime() < now, worker: workers.get(q.workerId) ?? null,
      })),
      history: r.history.map((h) => ({ from: h.from, to: h.to, note: h.note, at: h.createdAt })),
    };
  }

  private async workerCards(ids: string[], lat: number, lng: number) {
    if (!ids.length) return new Map<string, any>();
    const ws = await this.prisma.workerProfile.findMany({ where: { userId: { in: ids } }, include: { user: { select: { name: true } } } });
    return new Map(
      ws.map((w) => [
        w.userId,
        {
          id: w.userId, name: w.user.name, photoUrl: w.photoFileId ? this.files.sign(w.photoFileId) : null,
          ratingAvg: Math.round(w.ratingAvg * 10) / 10, ratingCount: w.ratingCount, jobsDone: w.jobsDone, experienceYears: w.experienceYears,
          distanceKm: w.lat != null && w.lng != null ? Math.round(haversineKm(lat, lng, w.lat, w.lng) * 10) / 10 : null,
        },
      ]),
    );
  }

  // ─────────────── Worker side ───────────────

  async offersForWorker(me: AuthUser) {
    const offers = await this.prisma.requestOffer.findMany({
      where: { workerId: me.id, OR: [{ response: 'PENDING' }, { respondedAt: { gte: new Date(Date.now() - 6 * 3600000) } }] },
      orderBy: { createdAt: 'desc' },
      take: 40,
      include: { request: { include: { service: true, quotes: { where: { workerId: me.id }, orderBy: { version: 'desc' }, take: 1 } } } },
    });
    const now = Date.now();
    return offers.map((o) => {
      const r = o.request;
      const live = o.response === 'PENDING' && o.expiresAt.getTime() > now && ['SENT', 'QUOTING'].includes(r.status);
      return {
        offerId: o.id, requestId: r.id, code: `KRV-${r.number}`, service: r.service.name, bookingType: r.bookingType,
        description: r.description, quantity: r.quantity, when: fmtWhen(r), scheduledAt: r.scheduledAt,
        distanceKm: o.distanceKm, area: r.addressText.split(',').slice(-2).join(',').trim(),
        mediaCount: r.mediaFileIds.length, expiresAt: o.expiresAt,
        state: live ? 'OPEN' : r.status === 'ACCEPTED' && r.acceptedWorkerId !== me.id ? 'TAKEN' : o.response,
        myQuote: r.quotes[0] ? { id: r.quotes[0].id, version: r.quotes[0].version, status: r.quotes[0].status, totalPaise: r.quotes[0].servicePaise + r.quotes[0].materialPaise + r.quotes[0].taxPaise } : null,
      };
    });
  }

  async mediaForWorker(me: AuthUser, requestId: string) {
    const offer = await this.prisma.requestOffer.findUnique({ where: { requestId_workerId: { requestId, workerId: me.id } }, include: { request: true } });
    if (!offer) throw new NotFoundException('Request not found');
    return offer.request.mediaFileIds.map((id) => ({ id, url: this.files.sign(id) }));
  }

  /** First valid acceptance wins: a single conditional update decides the winner, so two taps can never both succeed. */
  async accept(me: AuthUser, requestId: string) {
    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const offer = await tx.requestOffer.findUnique({ where: { requestId_workerId: { requestId, workerId: me.id } } });
      if (!offer) throw new NotFoundException('Request not found');
      if (offer.response !== 'PENDING') throw new ConflictException('You already responded to this request');
      if (offer.expiresAt < now) throw new GoneException('The time to accept this request has passed');

      const req = await tx.serviceRequest.findUniqueOrThrow({ where: { id: requestId }, include: { service: true } });
      if (req.bookingType === 'QUOTE') throw new BadRequestException('Send a quote for this request instead');

      const won = await tx.serviceRequest.updateMany({
        where: { id: requestId, status: 'SENT', acceptedWorkerId: null },
        data: { status: 'ACCEPTED', acceptedWorkerId: me.id, roundExpiresAt: null },
      });
      if (!won.count) throw new ConflictException({ message: 'Request already assigned', code: 'ALREADY_ASSIGNED' });

      await tx.requestOffer.update({ where: { id: offer.id }, data: { response: 'ACCEPTED', respondedAt: now } });
      const losers = await tx.requestOffer.findMany({ where: { requestId, response: 'PENDING' }, select: { workerId: true } });
      await tx.requestOffer.updateMany({ where: { requestId, response: 'PENDING' }, data: { response: 'CLOSED', respondedAt: now } });

      const rates = await tx.workerRate.findMany({ where: { workerId: me.id, OR: [{ serviceId: req.serviceId }, { serviceId: null }] }, orderBy: { sortOrder: 'asc' } });
      const booking = await tx.booking.create({
        data: {
          requestId, clientId: req.clientId, workerId: me.id, serviceId: req.serviceId, bookingType: req.bookingType,
          scheduledAt: req.scheduledAt, status: 'ACCEPTED',
          agreedPrice: { kind: 'RATE_CARD', items: rates.map((r) => ({ label: r.label, model: r.model, amountPaise: r.amountPaise })) },
        },
      });
      await this.history(requestId, 'SENT', 'ACCEPTED', me.id, 'Worker accepted', tx);
      await tx.statusHistory.create({ data: { bookingId: booking.id, from: null, to: 'ACCEPTED', actorId: me.id, note: 'Worker accepted' } });
      return { req, booking, losers: losers.map((l) => l.workerId) };
    });

    this.realtime.emitToUsers(result.losers, 'offer:closed', { requestId, reason: 'ALREADY_ASSIGNED' });
    this.realtime.emitToUser(result.req.clientId, 'request:update', { id: requestId, status: 'ACCEPTED', bookingId: result.booking.id });
    const worker = await this.prisma.user.findUnique({ where: { id: me.id }, select: { name: true } });
    await this.notifications.notify({
      userId: result.req.clientId,
      type: 'WORKER_ACCEPTED',
      title: 'Worker found',
      body: `${worker?.name ?? 'A worker'} accepted your ${result.req.service.name} request. Confirm the booking.`,
      link: `/client/bookings/${result.booking.id}`,
      sms: true,
    });
    return { bookingId: result.booking.id };
  }

  async reject(me: AuthUser, requestId: string) {
    const offer = await this.prisma.requestOffer.findUnique({ where: { requestId_workerId: { requestId, workerId: me.id } } });
    if (!offer) throw new NotFoundException('Request not found');
    if (offer.response !== 'PENDING') return { ok: true };
    await this.prisma.requestOffer.update({ where: { id: offer.id }, data: { response: 'REJECTED', respondedAt: new Date() } });
    // Everyone in this round said no: move on right away instead of waiting for the timer.
    const req = await this.prisma.serviceRequest.findUniqueOrThrow({ where: { id: requestId } });
    const stillPending = await this.prisma.requestOffer.count({ where: { requestId, round: offer.round, response: 'PENDING' } });
    if (req.status === 'SENT' && !stillPending) await this.advanceRound(requestId, 'All notified workers declined');
    return { ok: true };
  }

  async submitQuote(me: AuthUser, requestId: string, b: z.infer<typeof QuoteBody>) {
    const s = await this.settings.get();
    const offer = await this.prisma.requestOffer.findUnique({ where: { requestId_workerId: { requestId, workerId: me.id } }, include: { request: { include: { service: true } } } });
    if (!offer) throw new NotFoundException('Request not found');
    if (offer.request.status !== 'QUOTING' || offer.expiresAt < new Date()) throw new GoneException('This request is no longer taking quotes');
    const quote = await this.prisma.$transaction(async (tx) => {
      const prev = await tx.quote.findFirst({ where: { requestId, workerId: me.id }, orderBy: { version: 'desc' } });
      if (prev?.status === 'ACCEPTED') throw new ConflictException('Your quote was already accepted');
      if (prev?.status === 'ACTIVE') await tx.quote.update({ where: { id: prev.id }, data: { status: 'SUPERSEDED' } });
      return tx.quote.create({
        data: { requestId, workerId: me.id, version: (prev?.version ?? 0) + 1, ...b, expiresAt: addMinutes(new Date(), s.quoteValidityMin) },
      });
    });
    this.realtime.emitToUser(offer.request.clientId, 'request:update', { id: requestId, status: 'QUOTING', newQuote: true });
    await this.notifications.notify({
      userId: offer.request.clientId,
      type: 'QUOTE_RECEIVED',
      title: 'New quote received',
      body: `A quote of ₹${(quote.servicePaise + quote.materialPaise + quote.taxPaise) / 100} for ${offer.request.service.name}. Valid for ${s.quoteValidityMin} minutes.`,
      link: `/client/requests/${requestId}`,
    });
    return quote;
  }

  async withdrawQuote(me: AuthUser, quoteId: string) {
    const r = await this.prisma.quote.updateMany({ where: { id: quoteId, workerId: me.id, status: 'ACTIVE' }, data: { status: 'WITHDRAWN' } });
    if (!r.count) throw new BadRequestException('Only an active quote can be withdrawn');
    return { ok: true };
  }

  async acceptQuote(me: AuthUser, quoteId: string) {
    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const q = await tx.quote.findUnique({ where: { id: quoteId }, include: { request: { include: { service: true } } } });
      if (!q || q.request.clientId !== me.id) throw new NotFoundException('Quote not found');
      if (q.status !== 'ACTIVE') throw new BadRequestException('This quote is no longer available');
      if (q.expiresAt < now) throw new GoneException('This quote has expired. Ask the worker for a new one.');
      const won = await tx.serviceRequest.updateMany({
        where: { id: q.requestId, status: 'QUOTING', acceptedWorkerId: null },
        data: { status: 'ACCEPTED', acceptedWorkerId: q.workerId, roundExpiresAt: null },
      });
      if (!won.count) throw new ConflictException('A quote was already accepted for this request');
      await tx.quote.update({ where: { id: q.id }, data: { status: 'ACCEPTED' } });
      const others = await tx.quote.findMany({ where: { requestId: q.requestId, status: 'ACTIVE' }, select: { workerId: true } });
      await tx.quote.updateMany({ where: { requestId: q.requestId, status: 'ACTIVE' }, data: { status: 'REJECTED' } });
      await tx.requestOffer.updateMany({ where: { requestId: q.requestId, workerId: q.workerId }, data: { response: 'ACCEPTED', respondedAt: now } });
      await tx.requestOffer.updateMany({ where: { requestId: q.requestId, response: 'PENDING' }, data: { response: 'CLOSED', respondedAt: now } });
      // The client chose this quote, so the booking is confirmed straight away with the quoted amounts locked in.
      const booking = await tx.booking.create({
        data: {
          requestId: q.requestId, clientId: me.id, workerId: q.workerId, serviceId: q.request.serviceId, bookingType: 'QUOTE',
          scheduledAt: q.request.scheduledAt, status: 'CONFIRMED', confirmedAt: now,
          agreedPrice: { kind: 'QUOTE', quoteId: q.id, version: q.version, servicePaise: q.servicePaise, materialPaise: q.materialPaise, taxPaise: q.taxPaise, totalPaise: q.servicePaise + q.materialPaise + q.taxPaise, note: q.note },
        },
      });
      await this.history(q.requestId, 'QUOTING', 'ACCEPTED', me.id, `Quote v${q.version} accepted`, tx);
      await tx.statusHistory.create({ data: { bookingId: booking.id, to: 'CONFIRMED', actorId: me.id, note: 'Quote accepted by client' } });
      return { q, booking, others: others.map((o) => o.workerId) };
    });
    await this.notifications.notify({
      userId: result.q.workerId, type: 'QUOTE_ACCEPTED', title: 'Your quote was accepted',
      body: `${result.q.request.service.name}: booking confirmed. Contact details are now open.`, link: `/worker/jobs/${result.booking.id}`, sms: true,
    });
    await this.notifications.notifyMany(result.others, { type: 'QUOTE_NOT_SELECTED', title: 'Quote not selected', body: `The client chose another quote for ${result.q.request.service.name}.`, link: '/worker/jobs' });
    return { bookingId: result.booking.id };
  }

  async rejectQuote(me: AuthUser, quoteId: string) {
    const q = await this.prisma.quote.findUnique({ where: { id: quoteId }, include: { request: true } });
    if (!q || q.request.clientId !== me.id) throw new NotFoundException('Quote not found');
    if (q.status === 'ACTIVE') await this.prisma.quote.update({ where: { id: q.id }, data: { status: 'REJECTED' } });
    return { ok: true };
  }

  // ─────────────── Timers ───────────────

  /** Closes the current round and tries the next radius step. Safe to call from several places at once. */
  async advanceRound(requestId: string, note: string) {
    const claimed = await this.prisma.serviceRequest.updateMany({ where: { id: requestId, status: 'SENT' }, data: { status: 'SEARCHING', roundExpiresAt: null } });
    if (!claimed.count) return;
    const expired = await this.prisma.requestOffer.findMany({ where: { requestId, response: 'PENDING' }, select: { workerId: true } });
    await this.prisma.requestOffer.updateMany({ where: { requestId, response: 'PENDING' }, data: { response: 'EXPIRED', respondedAt: new Date() } });
    this.realtime.emitToUsers(expired.map((e) => e.workerId), 'offer:closed', { requestId, reason: 'EXPIRED' });
    await this.history(requestId, 'SENT', 'SEARCHING', null, note);

    const req = await this.prisma.serviceRequest.findUniqueOrThrow({ where: { id: requestId } });
    const s = await this.settings.get();
    const next = s.radiusStepsKm.find((r) => r > req.radiusKm);
    if (next && !req.targetWorkerId) {
      await this.prisma.serviceRequest.update({ where: { id: requestId }, data: { radiusKm: next } });
      this.realtime.emitToUser(req.clientId, 'request:update', { id: requestId, status: 'SEARCHING', radiusKm: next });
    }
    await this.dispatch(requestId);
    const after = await this.prisma.serviceRequest.findUniqueOrThrow({ where: { id: requestId } });
    if (after.status === 'SEARCHING') {
      // Nothing more to try right now.
      await this.prisma.serviceRequest.updateMany({ where: { id: requestId, status: 'SEARCHING' }, data: { status: 'NO_WORKER' } });
      this.realtime.emitToUser(req.clientId, 'request:update', { id: requestId, status: 'NO_WORKER' });
    }
  }

  async tick() {
    const now = new Date();
    const due = await this.prisma.serviceRequest.findMany({ where: { status: 'SENT', roundExpiresAt: { lt: now } }, select: { id: true }, take: 50 });
    for (const r of due) {
      await this.advanceRound(r.id, 'No worker accepted in time').catch((e) => this.log.error(`advanceRound ${r.id}: ${e.message}`));
    }
    const quoting = await this.prisma.serviceRequest.findMany({ where: { status: 'QUOTING', roundExpiresAt: { lt: now } }, select: { id: true, clientId: true }, take: 50 });
    for (const r of quoting) {
      const workers = await this.closeRequest(r.id, 'EXPIRED', null, 'Quote window ended');
      this.realtime.emitToUsers(workers, 'offer:closed', { requestId: r.id, reason: 'EXPIRED' });
      await this.notifications.notify({ userId: r.clientId, type: 'REQUEST_EXPIRED', title: 'Request expired', body: 'No quote was accepted in time. You can send a new request.', link: `/client/requests/${r.id}` });
    }
    return { advanced: due.length, expiredQuotes: quoting.length };
  }
}
