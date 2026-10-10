import { BadRequestException, Body, Controller, Get, HttpCode, NotFoundException, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { DocStatus, Prisma, VerificationStatus } from '@prisma/client';
import { z } from 'zod';
import { AuditService } from '../common/audit.service';
import { AuthUser } from '../common/auth.types';
import { ClientIp, CurrentUser, RequirePerms, Roles } from '../common/decorators';
import { maskPhone } from '../common/util';
import { Z } from '../common/zod.pipe';
import { FilesService } from '../files/files.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { RatesBody, WorkerProfilePatch, WorkersService } from '../workers/workers.service';

const ListQuery = z.object({
  status: z.nativeEnum(VerificationStatus).optional(),
  q: z.string().trim().max(60).optional(),
  serviceId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
});
const Reason = z.object({ reason: z.string().trim().min(3).max(300) });
const Extend = z.object({ kind: z.enum(['WORKER_TRIAL', 'WORKER_PLAN']), days: z.number().int().min(1).max(365), reason: z.string().trim().min(3).max(300) });
const DocReview = z.object({ status: z.nativeEnum(DocStatus), reason: z.string().trim().max(300).optional() });

@Roles('ADMIN', 'SUBADMIN')
@Controller('admin/workers')
export class AdminWorkersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workers: WorkersService,
    private readonly files: FilesService,
    private readonly subs: SubscriptionsService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  @RequirePerms('workers.view')
  @Get()
  async list(@Query(Z(ListQuery)) q: z.infer<typeof ListQuery>) {
    const where: Prisma.WorkerProfileWhereInput = {
      ...(q.status ? { verificationStatus: q.status } : {}),
      ...(q.serviceId ? { services: { some: { serviceId: q.serviceId } } } : {}),
      ...(q.q ? { OR: [{ user: { name: { contains: q.q, mode: 'insensitive' } } }, { user: { phone: { contains: q.q } } }, { area: { contains: q.q, mode: 'insensitive' } }] } : {}),
    };
    const [total, rows, counts] = await Promise.all([
      this.prisma.workerProfile.count({ where }),
      this.prisma.workerProfile.findMany({
        where,
        orderBy: [{ submittedAt: 'asc' }, { createdAt: 'desc' }],
        skip: (q.page - 1) * 25,
        take: 25,
        include: { user: true, services: { include: { service: true } } },
      }),
      this.prisma.workerProfile.groupBy({ by: ['verificationStatus'], _count: true }),
    ]);
    const docCounts = await this.prisma.document.groupBy({ by: ['workerId'], where: { workerId: { in: rows.map((r) => r.userId) } }, _count: true });
    const lead = await this.prisma.lead.findMany({ where: { workerId: { in: rows.map((r) => r.userId) } }, select: { workerId: true, source: true } });
    const items = await Promise.all(
      rows.map(async (w) => ({
        id: w.userId, name: w.user.name, phone: maskPhone(w.user.phone), area: w.area,
        services: w.services.map((s) => s.service.name), status: w.verificationStatus, availability: w.availability,
        completion: (await this.workers.completion(w.userId)).percent,
        documents: docCounts.find((d) => d.workerId === w.userId)?._count ?? 0,
        submittedAt: w.submittedAt, createdAt: w.createdAt, source: lead.find((l) => l.workerId === w.userId)?.source ?? null,
        ratingAvg: Math.round(w.ratingAvg * 10) / 10, jobsDone: w.jobsDone, userStatus: w.user.status,
      })),
    );
    return { total, page: q.page, pageSize: 25, counts: Object.fromEntries(counts.map((c) => [c.verificationStatus, c._count])), items };
  }

  @RequirePerms('workers.view')
  @Get(':id')
  async detail(@Param('id') id: string) {
    const own = await this.workers.getOwn(id);
    const [activity, notes, complaints] = await Promise.all([
      this.prisma.auditLog.findMany({ where: { entityId: id }, orderBy: { createdAt: 'desc' }, take: 30 }),
      this.prisma.lead.findUnique({ where: { workerId: id }, include: { activities: { orderBy: { createdAt: 'desc' }, take: 20 } } }),
      this.prisma.complaint.count({ where: { againstId: id } }),
    ]);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id }, select: { status: true, statusReason: true, phone: true, createdAt: true } });
    return { ...own, phone: user.phone, userStatus: user.status, statusReason: user.statusReason, activity, lead: notes, complaintsAgainst: complaints };
  }

  /** Approval makes the worker bookable and starts the one free trial for this mobile number. */
  @RequirePerms('workers.verify')
  @Post(':id/approve')
  @HttpCode(200)
  async approve(@CurrentUser() me: AuthUser, @Param('id') id: string, @ClientIp() ip: string) {
    const s = await this.settings.get();
    const w = await this.prisma.workerProfile.findUnique({ where: { userId: id }, include: { user: true } });
    if (!w) throw new NotFoundException('Worker not found');
    if (w.verificationStatus === 'VERIFIED') throw new BadRequestException('Already verified');
    const c = await this.workers.completion(id);
    if (c.missing.length) throw new BadRequestException(`Profile incomplete: ${c.missing.join(', ')}`);

    let trialEnds: Date | null = null;
    await this.prisma.$transaction(async (tx) => {
      await tx.workerProfile.update({ where: { userId: id }, data: { verificationStatus: 'VERIFIED', verifiedAt: new Date(), rejectReason: null } });
      await tx.document.updateMany({ where: { workerId: id, status: 'PENDING' }, data: { status: 'VERIFIED', reviewedBy: me.id, reviewedAt: new Date() } });
      const priorTrials = await tx.subscription.count({ where: { userId: id, kind: 'WORKER_TRIAL' } });
      if (!w.trialUsed && priorTrials < s.trialsPerMobile && s.workerTrialDays > 0) {
        const sub = await this.subs.grant(id, 'WORKER_TRIAL', s.workerTrialDays, 'TRIAL', { note: 'Granted on approval' }, tx);
        await tx.workerProfile.update({ where: { userId: id }, data: { trialUsed: true } });
        trialEnds = sub.endsAt;
      }
      await tx.lead.updateMany({ where: { workerId: id }, data: { status: 'CONVERTED' } });
      await this.audit.log(me, { action: 'worker.approve', entityType: 'Worker', entityId: id, before: { status: w.verificationStatus }, after: { status: 'VERIFIED', trialEnds }, ip }, tx);
    });
    await this.notifications.notify({
      userId: id, type: 'WORKER_VERIFIED', title: 'You are verified',
      body: trialEnds ? `Your ${s.workerTrialDays}-day free trial has started. Switch to AVAILABLE to get requests.` : 'Take the ₹199 plan to start getting requests.',
      link: '/worker', sms: true,
    });
    return { ok: true, trialEnds };
  }

  @RequirePerms('workers.verify')
  @Post(':id/reject')
  @HttpCode(200)
  async reject(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body(Z(Reason)) b: z.infer<typeof Reason>, @ClientIp() ip: string) {
    const w = await this.prisma.workerProfile.findUniqueOrThrow({ where: { userId: id } });
    await this.prisma.workerProfile.update({ where: { userId: id }, data: { verificationStatus: 'REJECTED', rejectReason: b.reason, availability: 'BUSY' } });
    await this.audit.log(me, { action: 'worker.reject', entityType: 'Worker', entityId: id, before: { status: w.verificationStatus }, after: { status: 'REJECTED' }, reason: b.reason, ip });
    await this.notifications.notify({ userId: id, type: 'WORKER_REJECTED', title: 'Profile needs changes', body: b.reason, link: '/worker/documents', sms: true });
    return { ok: true };
  }

  @RequirePerms('workers.verify')
  @Post(':id/suspend')
  @HttpCode(200)
  async suspend(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body(Z(Reason)) b: z.infer<typeof Reason>, @ClientIp() ip: string) {
    const w = await this.prisma.workerProfile.findUniqueOrThrow({ where: { userId: id } });
    await this.prisma.workerProfile.update({ where: { userId: id }, data: { verificationStatus: 'SUSPENDED', availability: 'BUSY' } });
    await this.audit.log(me, { action: 'worker.suspend', entityType: 'Worker', entityId: id, before: { status: w.verificationStatus }, after: { status: 'SUSPENDED' }, reason: b.reason, ip });
    await this.notifications.notify({ userId: id, type: 'WORKER_SUSPENDED', title: 'Profile suspended', body: `You will not receive requests. Reason: ${b.reason}`, link: '/worker', sms: true });
    return { ok: true };
  }

  @RequirePerms('workers.verify')
  @Post(':id/block')
  @HttpCode(200)
  async block(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body(Z(Reason)) b: z.infer<typeof Reason>, @ClientIp() ip: string) {
    await this.prisma.$transaction([
      this.prisma.workerProfile.update({ where: { userId: id }, data: { verificationStatus: 'SUSPENDED', availability: 'BUSY' } }),
      this.prisma.user.update({ where: { id }, data: { status: 'BLOCKED', statusReason: b.reason } }),
      this.prisma.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await this.audit.log(me, { action: 'worker.block', entityType: 'Worker', entityId: id, after: { status: 'BLOCKED' }, reason: b.reason, ip });
    return { ok: true };
  }

  @RequirePerms('workers.verify')
  @Post(':id/reactivate')
  @HttpCode(200)
  async reactivate(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body(Z(Reason)) b: z.infer<typeof Reason>, @ClientIp() ip: string) {
    const w = await this.prisma.workerProfile.findUniqueOrThrow({ where: { userId: id } });
    await this.prisma.$transaction([
      this.prisma.workerProfile.update({ where: { userId: id }, data: { verificationStatus: w.verifiedAt ? 'VERIFIED' : 'PENDING' } }),
      this.prisma.user.update({ where: { id }, data: { status: 'ACTIVE', statusReason: null } }),
    ]);
    await this.audit.log(me, { action: 'worker.reactivate', entityType: 'Worker', entityId: id, before: { status: w.verificationStatus }, reason: b.reason, ip });
    await this.notifications.notify({ userId: id, type: 'WORKER_REACTIVATED', title: 'Profile reactivated', body: 'You can switch to AVAILABLE again.', link: '/worker' });
    return { ok: true };
  }

  @RequirePerms('workers.edit')
  @Patch(':id/profile')
  edit(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body(Z(WorkerProfilePatch)) b: z.infer<typeof WorkerProfilePatch>) {
    return this.workers.update(id, b, me);
  }

  @RequirePerms('workers.edit')
  @Put(':id/rates')
  rates(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body(Z(RatesBody)) b: z.infer<typeof RatesBody>) {
    return this.workers.setRates(id, b, me);
  }

  @RequirePerms('subscriptions.edit')
  @Post(':id/subscription/extend')
  @HttpCode(200)
  async extend(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body(Z(Extend)) b: z.infer<typeof Extend>, @ClientIp() ip: string) {
    const sub = await this.subs.grant(id, b.kind, b.days, 'ADMIN', { note: b.reason });
    await this.audit.log(me, { action: b.kind === 'WORKER_TRIAL' ? 'trial.extend' : 'plan.extend', entityType: 'Worker', entityId: id, after: { days: b.days, endsAt: sub.endsAt }, reason: b.reason, ip });
    await this.notifications.notify({ userId: id, type: 'PLAN_EXTENDED', title: 'Extended by Karvia', body: `Your ${b.kind === 'WORKER_TRIAL' ? 'trial' : 'plan'} now runs till ${sub.endsAt.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}.`, link: '/worker/plan' });
    return sub;
  }

  @RequirePerms('workers.verify')
  @Post('documents/:docId/review')
  @HttpCode(200)
  async reviewDoc(@CurrentUser() me: AuthUser, @Param('docId') docId: string, @Body(Z(DocReview)) b: z.infer<typeof DocReview>, @ClientIp() ip: string) {
    if (b.status === 'REJECTED' && !b.reason) throw new BadRequestException('Give a reason so the worker can fix it');
    const d = await this.prisma.document.update({ where: { id: docId }, data: { status: b.status, rejectReason: b.reason ?? null, reviewedBy: me.id, reviewedAt: new Date() } });
    await this.audit.log(me, { action: 'document.review', entityType: 'Document', entityId: docId, after: { status: b.status }, reason: b.reason, ip });
    if (b.status === 'REJECTED') {
      await this.notifications.notify({ userId: d.workerId, type: 'DOCUMENT_REJECTED', title: 'Document needs re-upload', body: b.reason!, link: '/worker/documents', sms: true });
    }
    return d;
  }

  @RequirePerms('documents.view')
  @Get('documents/:docId/url')
  async docUrl(@CurrentUser() me: AuthUser, @Param('docId') docId: string) {
    const d = await this.prisma.document.findUnique({ where: { id: docId } });
    if (!d) throw new NotFoundException('Document not found');
    return this.files.signedUrl(me, d.fileId); // audited inside
  }
}
