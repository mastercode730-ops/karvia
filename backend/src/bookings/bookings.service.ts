import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Booking, BookingStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { AuditService } from '../common/audit.service';
import { AuthUser, STAFF_ROLES } from '../common/auth.types';
import { FilesService } from '../files/files.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { RequestsService } from '../requests/requests.service';
import { SettingsService } from '../settings/settings.service';

export const ChargeBody = z.object({
  label: z.string().trim().min(2).max(80),
  kind: z.enum(['MATERIAL', 'EXTRA']),
  amountPaise: z.number().int().min(100).max(100_000_000),
});
export const ReviewBody = z.object({ stars: z.number().int().min(1).max(5), text: z.string().trim().max(800).optional() });
export const CancelBody = z.object({ reason: z.string().trim().min(3).max(300) });

const TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  ACCEPTED: ['CONFIRMED', 'CANCELLED', 'DISPUTED'],
  CONFIRMED: ['IN_PROGRESS', 'CANCELLED', 'DISPUTED'],
  IN_PROGRESS: ['COMPLETED', 'DISPUTED'],
  COMPLETED: ['DISPUTED'],
  CANCELLED: [],
  DISPUTED: ['COMPLETED', 'CANCELLED'],
};

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requests: RequestsService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
    private readonly settings: SettingsService,
    private readonly files: FilesService,
    private readonly audit: AuditService,
  ) {}

  private async load(id: string) {
    const b = await this.prisma.booking.findUnique({ where: { id }, include: { request: { include: { service: true } }, charges: true, reviews: true, history: { orderBy: { createdAt: 'asc' } } } });
    if (!b) throw new NotFoundException('Booking not found');
    return b;
  }

  private assertParty(me: AuthUser, b: Booking) {
    if (STAFF_ROLES.includes(me.role)) {
      if (!me.permissions.includes('bookings.view')) throw new ForbiddenException();
      return;
    }
    if ((me.role === 'CLIENT' && b.clientId === me.id) || (me.role === 'WORKER' && b.workerId === me.id)) return;
    throw new NotFoundException('Booking not found');
  }

  /** One guarded status change with history; refuses illegal jumps like COMPLETED before IN_PROGRESS. */
  private async move(b: Booking, to: BookingStatus, actorId: string, note?: string, extra: Prisma.BookingUpdateInput = {}) {
    if (!TRANSITIONS[b.status].includes(to)) throw new BadRequestException(`A ${b.status.toLowerCase().replace('_', ' ')} booking cannot become ${to.toLowerCase().replace('_', ' ')}`);
    const r = await this.prisma.booking.updateMany({ where: { id: b.id, status: b.status }, data: { status: to, ...(extra as any) } });
    if (!r.count) throw new BadRequestException('This booking was just updated. Refresh and try again.');
    await this.prisma.statusHistory.create({ data: { bookingId: b.id, from: b.status, to, actorId, note } });
    this.realtime.emitToUsers([b.clientId, b.workerId], 'booking:update', { id: b.id, status: to });
  }

  async list(me: AuthUser, tab: string) {
    const party = me.role === 'CLIENT' ? { clientId: me.id } : { workerId: me.id };
    const statusByTab: Record<string, BookingStatus[]> = {
      upcoming: ['ACCEPTED', 'CONFIRMED'],
      active: ['IN_PROGRESS'],
      completed: ['COMPLETED'],
      cancelled: ['CANCELLED'],
      disputed: ['DISPUTED'],
    };
    const where = { ...party, ...(statusByTab[tab] ? { status: { in: statusByTab[tab] } } : {}) };
    const [items, counts] = await Promise.all([
      this.prisma.booking.findMany({ where, orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'desc' }], take: 100, include: { request: { include: { service: true } } } }),
      this.prisma.booking.groupBy({ by: ['status'], where: party, _count: true }),
    ]);
    const otherIds = [...new Set(items.map((b) => (me.role === 'CLIENT' ? b.workerId : b.clientId)))];
    const users = await this.prisma.user.findMany({ where: { id: { in: otherIds } }, select: { id: true, name: true } });
    const names = new Map(users.map((u) => [u.id, u.name]));
    return {
      counts: Object.fromEntries(counts.map((c) => [c.status, c._count])),
      items: items.map((b) => ({
        id: b.id, code: `KRV-${b.number}`, service: b.request.service.name, bookingType: b.bookingType, status: b.status,
        scheduledAt: b.scheduledAt, createdAt: b.createdAt, otherParty: names.get(me.role === 'CLIENT' ? b.workerId : b.clientId) ?? null,
        priceSummary: this.priceSummary(b.agreedPrice as any),
      })),
    };
  }

  priceSummary(p: any): string {
    if (!p) return '';
    if (p.kind === 'QUOTE') return `₹${(p.totalPaise / 100).toLocaleString('en-IN')} (quote)`;
    const first = (p.items ?? []).find((i: any) => i.amountPaise != null);
    return first ? `₹${(first.amountPaise / 100).toLocaleString('en-IN')} ${first.label.toLowerCase()}` : 'Quote';
  }

  async detail(me: AuthUser, id: string) {
    const b = await this.load(id);
    this.assertParty(me, b);
    const s = await this.settings.get();
    const [client, worker] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: b.clientId }, select: { id: true, name: true, phone: true } }),
      this.prisma.user.findUniqueOrThrow({ where: { id: b.workerId }, select: { id: true, name: true, phone: true, worker: true } }),
    ]);
    // Contact unlocks once the worker has accepted; until then nobody sees the other's number or full address.
    const contactOpen = ['ACCEPTED', 'CONFIRMED', 'IN_PROGRESS'].includes(b.status) && s.contactMode === 'DIRECT';
    const isClient = me.role === 'CLIENT';
    const isStaff = STAFF_ROLES.includes(me.role);
    const myReview = b.reviews.find((r) => r.authorId === me.id);
    return {
      id: b.id, code: `KRV-${b.number}`, requestId: b.requestId, status: b.status, bookingType: b.bookingType,
      service: { id: b.request.service.id, name: b.request.service.name },
      description: b.request.description, quantity: b.request.quantity, scheduledAt: b.scheduledAt,
      addressText: isClient || isStaff || b.status !== 'CANCELLED' ? b.request.addressText : null,
      agreedPrice: b.agreedPrice, priceSummary: this.priceSummary(b.agreedPrice as any),
      charges: b.charges.map((c) => ({ id: c.id, label: c.label, kind: c.kind, amountPaise: c.amountPaise, approvedAt: c.approvedAt, rejectedAt: c.rejectedAt })),
      client: { id: client.id, name: client.name, phone: !isClient && (contactOpen || isStaff) ? client.phone : null },
      worker: {
        id: worker.id, name: worker.name, phone: isClient && contactOpen ? worker.phone : isStaff ? worker.phone : null,
        photoUrl: worker.worker?.photoFileId ? this.files.sign(worker.worker.photoFileId) : null,
        ratingAvg: worker.worker ? Math.round(worker.worker.ratingAvg * 10) / 10 : 0, jobsDone: worker.worker?.jobsDone ?? 0,
      },
      contactOpen,
      cancelledBy: b.cancelledBy, cancelReason: b.cancelReason, lateCancel: b.lateCancel,
      confirmedAt: b.confirmedAt, startedAt: b.startedAt, completedAt: b.completedAt, createdAt: b.createdAt,
      canReview: b.status === 'COMPLETED' && !myReview && (me.role === 'CLIENT' || me.role === 'WORKER'),
      myReview: myReview ? { stars: myReview.stars, text: myReview.text } : null,
      history: b.history.map((h) => ({ from: h.from, to: h.to, note: h.note, at: h.createdAt })),
    };
  }

  async confirm(me: AuthUser, id: string) {
    const b = await this.load(id);
    if (b.clientId !== me.id) throw new NotFoundException('Booking not found');
    await this.move(b, 'CONFIRMED', me.id, 'Confirmed by client', { confirmedAt: new Date() });
    await this.notifications.notify({ userId: b.workerId, type: 'BOOKING_CONFIRMED', title: 'Booking confirmed', body: `${b.request.service.name} is confirmed. Contact details are open.`, link: `/worker/jobs/${b.id}`, sms: true });
    return this.detail(me, id);
  }

  async start(me: AuthUser, id: string) {
    const b = await this.load(id);
    if (b.workerId !== me.id) throw new NotFoundException('Booking not found');
    await this.move(b, 'IN_PROGRESS', me.id, 'Job started', { startedAt: new Date() });
    await this.notifications.notify({ userId: b.clientId, type: 'JOB_STARTED', title: 'Job started', body: `${b.request.service.name} has started.`, link: `/client/bookings/${b.id}` });
    return this.detail(me, id);
  }

  async complete(me: AuthUser, id: string) {
    const b = await this.load(id);
    if (b.workerId !== me.id) throw new NotFoundException('Booking not found');
    const pending = b.charges.filter((c) => !c.approvedAt && !c.rejectedAt).length;
    if (pending) throw new BadRequestException('The client has not answered your extra charge yet');
    await this.move(b, 'COMPLETED', me.id, 'Job completed', { completedAt: new Date() });
    await this.prisma.workerProfile.update({ where: { userId: b.workerId }, data: { jobsDone: { increment: 1 } } });
    await this.notifications.notify({ userId: b.clientId, type: 'JOB_COMPLETED', title: 'Job completed', body: `Rate your ${b.request.service.name} experience.`, link: `/client/bookings/${b.id}` });
    return this.detail(me, id);
  }

  /** Client cancel ends the request. Worker cancel re-opens the request and sends it to the next eligible workers. */
  async cancel(me: AuthUser, id: string, reason: string) {
    const b = await this.load(id);
    const isClient = me.role === 'CLIENT' && b.clientId === me.id;
    const isWorker = me.role === 'WORKER' && b.workerId === me.id;
    const isStaff = STAFF_ROLES.includes(me.role) && me.permissions.includes('bookings.edit');
    if (!isClient && !isWorker && !isStaff) throw new NotFoundException('Booking not found');
    const s = await this.settings.get();
    const late = !!b.scheduledAt && b.scheduledAt.getTime() - Date.now() < s.lateCancelMin * 60000;
    const by = isClient ? 'CLIENT' : isWorker ? 'WORKER' : 'ADMIN';
    await this.move(b, 'CANCELLED', me.id, `Cancelled by ${by.toLowerCase()}: ${reason}`, { cancelledBy: by, cancelReason: reason, lateCancel: late });
    if (isStaff) await this.audit.log(me, { action: 'booking.admin_cancel', entityType: 'Booking', entityId: b.id, reason });

    if (isWorker && b.bookingType !== 'QUOTE') {
      if (late) await this.prisma.workerProfile.update({ where: { userId: b.workerId }, data: { warnings: { increment: 1 } } });
      await this.prisma.serviceRequest.update({ where: { id: b.requestId }, data: { status: 'SEARCHING', acceptedWorkerId: null } });
      await this.prisma.statusHistory.create({ data: { requestId: b.requestId, from: 'ACCEPTED', to: 'SEARCHING', actorId: me.id, note: 'Worker cancelled; finding another worker' } });
      await this.notifications.notify({ userId: b.clientId, type: 'WORKER_CANCELLED', title: 'Worker cancelled', body: `We are finding another worker for ${b.request.service.name}.`, link: `/client/requests/${b.requestId}`, sms: true });
      await this.requests.dispatch(b.requestId);
    } else {
      await this.prisma.serviceRequest.update({ where: { id: b.requestId }, data: { status: 'CANCELLED', cancelReason: reason } });
      const notifyWorker = !isWorker;
      const notifyClient = !isClient;
      const title = isStaff ? 'Booking cancelled by Karvia' : 'Booking cancelled';
      const body = `${b.request.service.name} was cancelled. Reason: ${reason}`;
      if (notifyWorker) await this.notifications.notify({ userId: b.workerId, type: 'BOOKING_CANCELLED', title, body, link: `/worker/jobs/${b.id}`, sms: true });
      if (notifyClient) await this.notifications.notify({ userId: b.clientId, type: 'BOOKING_CANCELLED', title, body, link: `/client/bookings/${b.id}`, sms: true });
    }
    return { ok: true, lateCancel: late };
  }

  async addCharge(me: AuthUser, id: string, c: z.infer<typeof ChargeBody>) {
    const b = await this.load(id);
    if (b.workerId !== me.id) throw new NotFoundException('Booking not found');
    if (!['CONFIRMED', 'IN_PROGRESS'].includes(b.status)) throw new BadRequestException('Extra charges can be added only during the job');
    const charge = await this.prisma.bookingCharge.create({ data: { bookingId: b.id, ...c } });
    await this.notifications.notify({ userId: b.clientId, type: 'CHARGE_ADDED', title: 'Extra charge needs your approval', body: `${c.label}: ₹${c.amountPaise / 100}`, link: `/client/bookings/${b.id}` });
    this.realtime.emitToUser(b.clientId, 'booking:update', { id: b.id, charge: charge.id });
    return charge;
  }

  async answerCharge(me: AuthUser, id: string, chargeId: string, approve: boolean) {
    const b = await this.load(id);
    if (b.clientId !== me.id) throw new NotFoundException('Booking not found');
    const r = await this.prisma.bookingCharge.updateMany({
      where: { id: chargeId, bookingId: b.id, approvedAt: null, rejectedAt: null },
      data: approve ? { approvedAt: new Date() } : { rejectedAt: new Date() },
    });
    if (!r.count) throw new BadRequestException('This charge was already answered');
    this.realtime.emitToUser(b.workerId, 'booking:update', { id: b.id, charge: chargeId, approved: approve });
    return this.detail(me, id);
  }

  /** Reviews only from a completed booking, once per side. */
  async review(me: AuthUser, id: string, body: z.infer<typeof ReviewBody>) {
    const b = await this.load(id);
    const isClient = me.role === 'CLIENT' && b.clientId === me.id;
    const isWorker = me.role === 'WORKER' && b.workerId === me.id;
    if (!isClient && !isWorker) throw new NotFoundException('Booking not found');
    if (b.status !== 'COMPLETED') throw new BadRequestException('You can review after the job is completed');
    const direction = isClient ? 'CLIENT_TO_WORKER' : 'WORKER_TO_CLIENT';
    const targetId = isClient ? b.workerId : b.clientId;
    const review = await this.prisma.review.create({ data: { bookingId: b.id, authorId: me.id, targetId, direction, ...body } });
    if (isClient) {
      const agg = await this.prisma.review.aggregate({ where: { targetId, direction: 'CLIENT_TO_WORKER', hidden: false }, _avg: { stars: true }, _count: true });
      await this.prisma.workerProfile.update({ where: { userId: targetId }, data: { ratingAvg: agg._avg.stars ?? 0, ratingCount: agg._count } });
    }
    return review;
  }

  /** Clients' "My workers": favourites, following and everyone they have booked before. */
  async previousWorkers(me: AuthUser) {
    const rows = await this.prisma.booking.groupBy({ by: ['workerId'], where: { clientId: me.id, status: 'COMPLETED' }, _count: true, _max: { completedAt: true } });
    return rows.map((r) => ({ workerId: r.workerId, times: r._count, lastHiredAt: r._max.completedAt }));
  }
}
