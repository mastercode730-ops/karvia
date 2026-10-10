import { BadRequestException, Body, Controller, Get, HttpCode, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { BookingStatus, ComplaintStatus, PaymentPurpose, PaymentStatus, Prisma, RequestStatus, UserStatus } from '@prisma/client';
import { z } from 'zod';
import { BookingsService } from '../bookings/bookings.service';
import { AuditService } from '../common/audit.service';
import { AuthUser } from '../common/auth.types';
import { ClientIp, CurrentUser, RequirePerms, Roles } from '../common/decorators';
import { addDays, maskPhone } from '../common/util';
import { Z } from '../common/zod.pipe';
import { FilesService } from '../files/files.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { RequestsService } from '../requests/requests.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

const Page = z.object({ page: z.coerce.number().int().min(1).default(1), q: z.string().trim().max(60).optional() });
const Reason = z.object({ reason: z.string().trim().min(3).max(300) });
const UserStatusBody = z.object({ status: z.nativeEnum(UserStatus), reason: z.string().trim().min(3).max(300) });

@Roles('ADMIN', 'SUBADMIN')
@Controller('admin')
export class AdminOpsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly subs: SubscriptionsService,
    private readonly requests: RequestsService,
    private readonly bookings: BookingsService,
    private readonly payments: PaymentsService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
    private readonly files: FilesService,
  ) {}

  // ─────────────── Dashboard ───────────────

  @Get('dashboard')
  async dashboard(@CurrentUser() me: AuthUser) {
    const now = new Date();
    const weekAgo = addDays(now, -7);
    const soon = addDays(now, 3);
    const [
      newClients, newWorkers, workerStatus, availableNow, trialWorkers, paidWorkers, activeClients, expiringClients,
      reqByStatus, bookingsByStatus, openComplaints, unassignedLeads, pendingPayments, revenue,
    ] = await Promise.all([
      this.prisma.user.count({ where: { roles: { has: 'CLIENT' }, createdAt: { gte: weekAgo } } }),
      this.prisma.user.count({ where: { roles: { has: 'WORKER' }, createdAt: { gte: weekAgo } } }),
      this.prisma.workerProfile.groupBy({ by: ['verificationStatus'], _count: true }),
      this.prisma.workerProfile.count({ where: { availability: 'AVAILABLE', verificationStatus: 'VERIFIED' } }),
      this.prisma.subscription.findMany({ where: { kind: 'WORKER_TRIAL', startsAt: { lte: now }, endsAt: { gt: now } }, distinct: ['userId'], select: { userId: true } }),
      this.prisma.subscription.findMany({ where: { kind: 'WORKER_PLAN', startsAt: { lte: now }, endsAt: { gt: now } }, distinct: ['userId'], select: { userId: true } }),
      this.prisma.subscription.findMany({ where: { kind: 'CLIENT_ACCESS', startsAt: { lte: now }, endsAt: { gt: now } }, distinct: ['userId'], select: { userId: true } }),
      this.prisma.subscription.findMany({ where: { kind: 'CLIENT_ACCESS', endsAt: { gt: now, lte: soon } }, distinct: ['userId'], select: { userId: true } }),
      this.prisma.serviceRequest.groupBy({ by: ['status'], where: { createdAt: { gte: weekAgo } }, _count: true }),
      this.prisma.booking.groupBy({ by: ['status'], where: { createdAt: { gte: weekAgo } }, _count: true }),
      this.prisma.complaint.count({ where: { status: { not: 'RESOLVED' } } }),
      this.prisma.lead.count({ where: { assignedToId: null, status: { notIn: ['CONVERTED', 'NOT_INTERESTED'] } } }),
      this.prisma.payment.count({ where: { status: { in: ['CREATED', 'PENDING'] }, createdAt: { gte: addDays(now, -1) } } }),
      me.permissions.includes('payments.view')
        ? this.prisma.payment.groupBy({ by: ['purpose'], where: { status: 'SUCCESS', createdAt: { gte: weekAgo } }, _sum: { totalPaise: true }, _count: true })
        : Promise.resolve([]),
    ]);
    const ws = Object.fromEntries(workerStatus.map((w) => [w.verificationStatus, w._count]));
    return {
      needsAction: {
        pendingVerification: (ws.PENDING ?? 0) + (ws.UNDER_REVIEW ?? 0),
        noWorkerFound: reqByStatus.find((r) => r.status === 'NO_WORKER')?._count ?? 0,
        openComplaints, unassignedLeads, paymentIssues: pendingPayments,
      },
      workers: { newThisWeek: newWorkers, verified: ws.VERIFIED ?? 0, incomplete: ws.INCOMPLETE ?? 0, rejected: ws.REJECTED ?? 0, suspended: ws.SUSPENDED ?? 0, onTrial: trialWorkers.length, paid: paidWorkers.length, availableNow },
      clients: { newThisWeek: newClients, activeAccess: activeClients.length, expiringIn3Days: expiringClients.length },
      requests: Object.fromEntries(reqByStatus.map((r) => [r.status, r._count])),
      bookings: Object.fromEntries(bookingsByStatus.map((b) => [b.status, b._count])),
      revenue: (revenue as any[]).map((r) => ({ purpose: r.purpose, totalPaise: r._sum.totalPaise ?? 0, count: r._count })),
    };
  }

  // ─────────────── Clients ───────────────

  @RequirePerms('clients.view')
  @Get('clients')
  async clients(@Query(Z(Page.extend({ status: z.nativeEnum(UserStatus).optional() }))) q: any) {
    const where: Prisma.UserWhereInput = {
      roles: { has: 'CLIENT' },
      ...(q.status ? { status: q.status } : {}),
      ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { phone: { contains: q.q } }] } : {}),
    };
    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * 25, take: 25, include: { client: true } }),
    ]);
    const ids = users.map((u) => u.id);
    const [reqs, cancels, complaints] = await Promise.all([
      this.prisma.serviceRequest.groupBy({ by: ['clientId'], where: { clientId: { in: ids } }, _count: true }),
      this.prisma.booking.groupBy({ by: ['clientId'], where: { clientId: { in: ids }, status: 'CANCELLED', cancelledBy: 'CLIENT' }, _count: true }),
      this.prisma.complaint.groupBy({ by: ['againstId'], where: { againstId: { in: ids } }, _count: true }),
    ]);
    const items = await Promise.all(
      users.map(async (u) => {
        const until = await this.subs.activeUntil(u.id, ['CLIENT_ACCESS']);
        const ever = until ? true : (await this.prisma.subscription.count({ where: { userId: u.id, kind: 'CLIENT_ACCESS' } })) > 0;
        return {
          id: u.id, name: u.name, phone: maskPhone(u.phone), area: u.client?.area ?? null, joinedAt: u.createdAt, status: u.status,
          access: until ? { state: 'ACTIVE', daysLeft: Math.ceil((until.getTime() - Date.now()) / 86400000) } : { state: ever ? 'EXPIRED' : 'NEVER_PAID' },
          requests: reqs.find((r) => r.clientId === u.id)?._count ?? 0,
          cancellations: cancels.find((r) => r.clientId === u.id)?._count ?? 0,
          complaintsAgainst: complaints.find((r) => r.againstId === u.id)?._count ?? 0,
        };
      }),
    );
    return { total, page: q.page, pageSize: 25, items };
  }

  @RequirePerms('clients.view')
  @Get('clients/:id')
  async client(@Param('id') id: string) {
    const u = await this.prisma.user.findUnique({ where: { id }, include: { client: true, addresses: true } });
    if (!u || !u.roles.includes('CLIENT')) throw new NotFoundException('Client not found');
    const [summary, requests, payments, complaints] = await Promise.all([
      this.subs.summary(id),
      this.prisma.serviceRequest.findMany({ where: { clientId: id }, orderBy: { createdAt: 'desc' }, take: 20, include: { service: true } }),
      this.prisma.payment.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 20 }),
      this.prisma.complaint.findMany({ where: { OR: [{ reporterId: id }, { againstId: id }] }, orderBy: { createdAt: 'desc' }, take: 20 }),
    ]);
    return {
      id: u.id, name: u.name, phone: u.phone, email: u.email, status: u.status, statusReason: u.statusReason, joinedAt: u.createdAt,
      area: u.client?.area, addresses: u.addresses, access: summary.clientAccess,
      requests: requests.map((r) => ({ id: r.id, code: `KRV-${r.number}`, service: r.service.name, status: r.status, createdAt: r.createdAt })),
      payments, complaints,
    };
  }

  /** Suspend / block / warn / reactivate any client or worker account. Blocking ends all sessions at once. */
  @RequirePerms('clients.edit')
  @Post('users/:id/status')
  @HttpCode(200)
  async userStatus(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body(Z(UserStatusBody)) b: z.infer<typeof UserStatusBody>, @ClientIp() ip: string) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id } });
    if (u.roles.some((r) => ['ADMIN', 'SUBADMIN', 'TELECALLER'].includes(r))) throw new BadRequestException('Manage staff accounts from Roles & staff');
    await this.prisma.user.update({ where: { id }, data: { status: b.status, statusReason: b.reason } });
    if (b.status === 'SUSPENDED' || b.status === 'BLOCKED') {
      await this.prisma.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    await this.audit.log(me, { action: `user.${b.status.toLowerCase()}`, entityType: 'User', entityId: id, before: { status: u.status }, after: { status: b.status }, reason: b.reason, ip });
    return { ok: true };
  }

  // ─────────────── Requests & bookings ───────────────

  @RequirePerms('bookings.view')
  @Get('requests')
  async requestsList(@Query(Z(Page.extend({ status: z.nativeEnum(RequestStatus).optional() }))) q: any) {
    const where: Prisma.ServiceRequestWhereInput = { ...(q.status ? { status: q.status } : {}) };
    const [total, rows, counts] = await Promise.all([
      this.prisma.serviceRequest.count({ where }),
      this.prisma.serviceRequest.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * 25, take: 25, include: { service: true, _count: { select: { offers: true } } } }),
      this.prisma.serviceRequest.groupBy({ by: ['status'], _count: true }),
    ]);
    const names = await this.names([...rows.map((r) => r.clientId), ...rows.map((r) => r.acceptedWorkerId).filter(Boolean) as string[]]);
    return {
      total, page: q.page, pageSize: 25, counts: Object.fromEntries(counts.map((c) => [c.status, c._count])),
      items: rows.map((r) => ({
        id: r.id, code: `KRV-${r.number}`, service: r.service.name, client: names.get(r.clientId), worker: r.acceptedWorkerId ? names.get(r.acceptedWorkerId) : null,
        bookingType: r.bookingType, notified: r._count.offers, status: r.status, radiusKm: r.radiusKm, createdAt: r.createdAt, area: r.addressText.split(',').slice(-2).join(',').trim(),
      })),
    };
  }

  @RequirePerms('bookings.view')
  @Get('requests/:id')
  async requestDetail(@Param('id') id: string) {
    const r = await this.prisma.serviceRequest.findUnique({
      where: { id },
      include: { service: true, offers: { orderBy: { createdAt: 'asc' } }, quotes: true, bookings: true, history: { orderBy: { createdAt: 'asc' } } },
    });
    if (!r) throw new NotFoundException('Request not found');
    const names = await this.names([r.clientId, ...r.offers.map((o) => o.workerId)]);
    return {
      ...r, code: `KRV-${r.number}`, clientName: names.get(r.clientId),
      offers: r.offers.map((o) => ({ ...o, workerName: names.get(o.workerId) })),
    };
  }

  /** Dispatcher manually gives a stuck request to a chosen (eligible) worker. */
  @RequirePerms('bookings.edit')
  @Post('requests/:id/assign')
  @HttpCode(200)
  async assign(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body(Z(z.object({ workerId: z.string(), reason: z.string().trim().min(3).max(300) }))) b: { workerId: string; reason: string }, @ClientIp() ip: string) {
    const r = await this.prisma.serviceRequest.findUniqueOrThrow({ where: { id } });
    if (!['NO_WORKER', 'SEARCHING', 'SENT'].includes(r.status)) throw new BadRequestException('This request is not waiting for a worker');
    await this.prisma.serviceRequest.update({ where: { id }, data: { status: 'SEARCHING', targetWorkerId: b.workerId, roundExpiresAt: null } });
    await this.prisma.requestOffer.deleteMany({ where: { requestId: id, workerId: b.workerId } });
    await this.requests.dispatch(id);
    const after = await this.prisma.serviceRequest.findUniqueOrThrow({ where: { id } });
    await this.audit.log(me, { action: 'request.manual_assign', entityType: 'Request', entityId: id, after: { workerId: b.workerId, status: after.status }, reason: b.reason, ip });
    if (after.status === 'NO_WORKER') throw new BadRequestException('That worker is not eligible right now (check verification, plan, AVAILABLE, service and time)');
    return { ok: true, status: after.status };
  }

  @RequirePerms('bookings.edit')
  @Post('requests/:id/reroute')
  @HttpCode(200)
  async reroute(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body(Z(z.object({ radiusKm: z.number().int().min(1).max(200) }))) b: { radiusKm: number }, @ClientIp() ip: string) {
    const r = await this.prisma.serviceRequest.findUniqueOrThrow({ where: { id } });
    if (!['NO_WORKER', 'SEARCHING'].includes(r.status)) throw new BadRequestException('Only requests without a worker can be re-routed');
    await this.prisma.serviceRequest.update({ where: { id }, data: { status: 'SEARCHING', radiusKm: b.radiusKm, targetWorkerId: null } });
    await this.requests.dispatch(id);
    await this.audit.log(me, { action: 'request.reroute', entityType: 'Request', entityId: id, after: { radiusKm: b.radiusKm }, ip });
    return this.prisma.serviceRequest.findUniqueOrThrow({ where: { id }, select: { status: true, radiusKm: true } });
  }

  @RequirePerms('bookings.view')
  @Get('bookings')
  async bookingsList(@Query(Z(Page.extend({ status: z.nativeEnum(BookingStatus).optional() }))) q: any) {
    const where: Prisma.BookingWhereInput = { ...(q.status ? { status: q.status } : {}) };
    const [total, rows] = await Promise.all([
      this.prisma.booking.count({ where }),
      this.prisma.booking.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * 25, take: 25, include: { request: { include: { service: true } } } }),
    ]);
    const names = await this.names([...rows.map((b) => b.clientId), ...rows.map((b) => b.workerId)]);
    return {
      total, page: q.page, pageSize: 25,
      items: rows.map((b) => ({ id: b.id, code: `KRV-${b.number}`, service: b.request.service.name, client: names.get(b.clientId), worker: names.get(b.workerId), status: b.status, scheduledAt: b.scheduledAt, price: this.bookings.priceSummary(b.agreedPrice), createdAt: b.createdAt })),
    };
  }

  @RequirePerms('bookings.view')
  @Get('bookings/:id')
  booking(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.bookings.detail(me, id);
  }

  @RequirePerms('bookings.edit')
  @Post('bookings/:id/cancel')
  @HttpCode(200)
  cancelBooking(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body(Z(Reason)) b: z.infer<typeof Reason>) {
    return this.bookings.cancel(me, id, b.reason);
  }

  // ─────────────── Payments ───────────────

  @RequirePerms('payments.view')
  @Get('payments')
  async paymentsList(@Query(Z(Page.extend({ status: z.nativeEnum(PaymentStatus).optional(), purpose: z.nativeEnum(PaymentPurpose).optional() }))) q: any) {
    const where: Prisma.PaymentWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.purpose ? { purpose: q.purpose } : {}),
      ...(q.q ? { OR: [{ providerOrderId: { contains: q.q } }, { providerPaymentId: { contains: q.q } }, { user: { phone: { contains: q.q } } }] } : {}),
    };
    const dayAgo = addDays(new Date(), -1);
    const [total, rows, today] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * 25, take: 25, include: { user: { select: { name: true, phone: true } } } }),
      this.prisma.payment.groupBy({ by: ['purpose', 'status'], where: { createdAt: { gte: dayAgo } }, _sum: { totalPaise: true }, _count: true }),
    ]);
    return {
      total, page: q.page, pageSize: 25, today,
      items: rows.map((p) => ({ ...p, user: { name: p.user.name, phone: maskPhone(p.user.phone) } })),
    };
  }

  @RequirePerms('payments.refund')
  @Post('payments/:id/refund')
  @HttpCode(200)
  refund(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body(Z(Reason)) b: z.infer<typeof Reason>, @ClientIp() ip: string) {
    return this.payments.refund(me, id, b.reason, ip);
  }

  // ─────────────── Complaints ───────────────

  @RequirePerms('complaints.view')
  @Get('complaints')
  async complaints(@Query(Z(Page.extend({ status: z.nativeEnum(ComplaintStatus).optional() }))) q: any) {
    const where: Prisma.ComplaintWhereInput = { ...(q.status ? { status: q.status } : {}) };
    const [total, rows, counts] = await Promise.all([
      this.prisma.complaint.count({ where }),
      this.prisma.complaint.findMany({ where, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], skip: (q.page - 1) * 25, take: 25 }),
      this.prisma.complaint.groupBy({ by: ['status'], _count: true }),
    ]);
    const names = await this.names([...rows.map((c) => c.reporterId), ...(rows.map((c) => c.againstId).filter(Boolean) as string[])]);
    return {
      total, page: q.page, pageSize: 25, counts: Object.fromEntries(counts.map((c) => [c.status, c._count])),
      items: rows.map((c) => ({ ...c, code: `C-${c.number}`, reporterName: names.get(c.reporterId), againstName: c.againstId ? names.get(c.againstId) : null })),
    };
  }

  @RequirePerms('complaints.view')
  @Get('complaints/:id')
  async complaint(@Param('id') id: string) {
    const c = await this.prisma.complaint.findUnique({ where: { id }, include: { notes: { orderBy: { createdAt: 'asc' } } } });
    if (!c) throw new NotFoundException('Complaint not found');
    const names = await this.names([c.reporterId, ...(c.againstId ? [c.againstId] : []), ...c.notes.map((n) => n.authorId)]);
    const against = c.againstId ? await this.prisma.user.findUnique({ where: { id: c.againstId }, include: { worker: true } }) : null;
    return {
      ...c, code: `C-${c.number}`, reporterName: names.get(c.reporterId),
      against: against ? { id: against.id, name: against.name, roles: against.roles, status: against.status, warnings: against.worker?.warnings ?? 0 } : null,
      evidence: c.evidenceFileIds.map((fid) => ({ id: fid, url: this.files.sign(fid) })),
      notes: c.notes.map((n) => ({ ...n, authorName: names.get(n.authorId) })),
    };
  }

  @RequirePerms('complaints.edit')
  @Post('complaints/:id/notes')
  async note(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body(Z(z.object({ text: z.string().trim().min(2).max(1000) }))) b: { text: string }) {
    return this.prisma.complaintNote.create({ data: { complaintId: id, authorId: me.id, text: b.text } });
  }

  /** Status change plus optional action against the reported account. */
  @RequirePerms('complaints.edit')
  @Post('complaints/:id/resolve')
  @HttpCode(200)
  async resolve(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Body(Z(z.object({ status: z.nativeEnum(ComplaintStatus), resolution: z.string().trim().max(600).optional(), action: z.enum(['NONE', 'WARN', 'SUSPEND', 'BLOCK', 'VERIFICATION_REVIEW']).default('NONE') }))) b: { status: ComplaintStatus; resolution?: string; action: string },
    @ClientIp() ip: string,
  ) {
    const c = await this.prisma.complaint.findUniqueOrThrow({ where: { id } });
    await this.prisma.complaint.update({ where: { id }, data: { status: b.status, resolution: b.resolution } });
    if (c.againstId && b.action !== 'NONE') {
      const target = await this.prisma.user.findUniqueOrThrow({ where: { id: c.againstId }, include: { worker: true } });
      if (b.action === 'WARN') {
        await this.prisma.user.update({ where: { id: target.id }, data: { status: target.status === 'ACTIVE' ? 'WARNED' : target.status } });
        if (target.worker) await this.prisma.workerProfile.update({ where: { userId: target.id }, data: { warnings: { increment: 1 } } });
        await this.notifications.notify({ userId: target.id, type: 'WARNING', title: 'Warning from Karvia', body: b.resolution ?? `About report #C-${c.number}`, link: '/', sms: true });
      }
      if (b.action === 'SUSPEND' && target.worker) await this.prisma.workerProfile.update({ where: { userId: target.id }, data: { verificationStatus: 'SUSPENDED', availability: 'BUSY' } });
      if (b.action === 'SUSPEND' && !target.worker) await this.prisma.user.update({ where: { id: target.id }, data: { status: 'SUSPENDED' } });
      if (b.action === 'BLOCK') {
        await this.prisma.user.update({ where: { id: target.id }, data: { status: 'BLOCKED', statusReason: `Report #C-${c.number}` } });
        await this.prisma.session.updateMany({ where: { userId: target.id, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      if (b.action === 'VERIFICATION_REVIEW' && target.worker) await this.prisma.workerProfile.update({ where: { userId: target.id }, data: { verificationStatus: 'UNDER_REVIEW', availability: 'BUSY' } });
    }
    await this.audit.log(me, { action: 'complaint.update', entityType: 'Complaint', entityId: id, before: { status: c.status }, after: { status: b.status, action: b.action }, reason: b.resolution, ip });
    if (b.status === 'RESOLVED') {
      await this.notifications.notify({ userId: c.reporterId, type: 'COMPLAINT_UPDATE', title: `Report #C-${c.number} resolved`, body: b.resolution ?? 'Our team has reviewed your report.', link: '/' });
    }
    return { ok: true };
  }

  // ─────────────── Reports & audit ───────────────

  @RequirePerms('reports.view')
  @Get('reports')
  async reports(@Query(Z(z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }))) q: { days: number }) {
    const since = addDays(new Date(), -q.days);
    const [byService, byStatus, cancellations, complaints, revenue] = await Promise.all([
      this.prisma.serviceRequest.groupBy({ by: ['serviceId'], where: { createdAt: { gte: since } }, _count: true }),
      this.prisma.serviceRequest.groupBy({ by: ['status'], where: { createdAt: { gte: since } }, _count: true }),
      this.prisma.booking.groupBy({ by: ['cancelledBy'], where: { status: 'CANCELLED', updatedAt: { gte: since } }, _count: true }),
      this.prisma.complaint.groupBy({ by: ['reason'], where: { createdAt: { gte: since } }, _count: true }),
      this.prisma.payment.groupBy({ by: ['purpose'], where: { status: 'SUCCESS', createdAt: { gte: since } }, _sum: { totalPaise: true }, _count: true }),
    ]);
    const services = await this.prisma.service.findMany({ where: { id: { in: byService.map((s) => s.serviceId) } }, select: { id: true, name: true } });
    const total = byStatus.reduce((a, b) => a + b._count, 0);
    const accepted = byStatus.find((s) => s.status === 'ACCEPTED')?._count ?? 0;
    return {
      days: q.days,
      requestsByService: byService.map((s) => ({ service: services.find((x) => x.id === s.serviceId)?.name, count: s._count })).sort((a, b) => b.count - a.count),
      requestsByStatus: byStatus.map((s) => ({ status: s.status, count: s._count })),
      conversion: total ? Math.round((accepted / total) * 1000) / 10 : 0,
      cancellations: cancellations.map((c) => ({ by: c.cancelledBy, count: c._count })),
      complaints: complaints.map((c) => ({ reason: c.reason, count: c._count })),
      revenue: revenue.map((r) => ({ purpose: r.purpose, totalPaise: r._sum.totalPaise ?? 0, count: r._count })),
    };
  }

  @RequirePerms('audit.view')
  @Get('audit')
  async auditList(@Query(Z(Page.extend({ action: z.string().max(60).optional(), entityId: z.string().max(60).optional() }))) q: any) {
    const where: Prisma.AuditLogWhereInput = {
      ...(q.action ? { action: { contains: q.action } } : {}),
      ...(q.entityId ? { entityId: q.entityId } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * 50, take: 50 }),
    ]);
    const names = await this.names(rows.map((r) => r.actorId).filter(Boolean) as string[]);
    return { total, page: q.page, pageSize: 50, items: rows.map((r) => ({ ...r, actorName: r.actorId ? names.get(r.actorId) : 'System' })) };
  }

  private async names(ids: string[]) {
    const users = await this.prisma.user.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, name: true, phone: true } });
    return new Map(users.map((u) => [u.id, u.name ?? maskPhone(u.phone)]));
  }
}
