import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { LeadSource, LeadStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { AuditService } from '../common/audit.service';
import { AuthUser } from '../common/auth.types';
import { ClientIp, CurrentUser, RequirePerms, Roles } from '../common/decorators';
import { latLng } from '../common/util';
import { Z } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../sms/sms.service';
import { WorkersService } from '../workers/workers.service';

const ListQuery = z.object({
  status: z.nativeEnum(LeadStatus).optional(),
  source: z.nativeEnum(LeadSource).optional(),
  assignedToId: z.string().optional(),
  unassigned: z.enum(['true', 'false']).optional(),
  due: z.enum(['today']).optional(),
  q: z.string().trim().max(60).optional(),
});
const Assign = z.object({ leadIds: z.array(z.string()).min(1).max(200), assignedToId: z.string().nullable() });
const Outcome = z.object({ status: z.nativeEnum(LeadStatus), followUpAt: z.coerce.date().nullable().optional(), note: z.string().trim().max(800).optional() });
/** The only worker fields a telecaller may fill in on the worker's behalf. */
const TelecallerWorkerPatch = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  experienceYears: z.number().int().min(0).max(60).optional(),
  skills: z.array(z.string().trim().min(2).max(60)).max(30).optional(),
  languages: z.array(z.string().trim().min(2).max(30)).max(10).optional(),
  area: z.string().trim().min(2).max(120).optional(),
  pincode: z.string().regex(/^\d{6}$/).optional(),
  lat: latLng.lat.optional(),
  lng: latLng.lng.optional(),
  serviceIds: z.array(z.string()).max(20).optional(),
});

/**
 * Leads pipeline. Admins with leads.view/assign see everything.
 * Telecallers only ever see and change leads assigned to them (checked in every query, not just in the UI).
 */
@Roles('ADMIN', 'SUBADMIN', 'TELECALLER')
@Controller('leads')
export class LeadsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workers: WorkersService,
    private readonly audit: AuditService,
    private readonly sms: SmsService,
  ) {}

  private scope(me: AuthUser): Prisma.LeadWhereInput {
    if (me.role === 'TELECALLER') return { assignedToId: me.id };
    if (!me.permissions.includes('leads.view')) throw new ForbiddenException('You do not have permission for leads');
    return {};
  }

  private async own(me: AuthUser, id: string) {
    const lead = await this.prisma.lead.findFirst({ where: { id, ...this.scope(me) } });
    if (!lead) throw new NotFoundException('Lead not found');
    if (me.role !== 'TELECALLER' && !me.permissions.includes('leads.edit')) throw new ForbiddenException('You cannot change leads');
    return lead;
  }

  @Get()
  async list(@CurrentUser() me: AuthUser, @Query(Z(ListQuery)) q: z.infer<typeof ListQuery>) {
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    const where: Prisma.LeadWhereInput = {
      ...this.scope(me),
      ...(q.status ? { status: q.status } : {}),
      ...(q.source ? { source: q.source } : {}),
      ...(q.assignedToId && me.role !== 'TELECALLER' ? { assignedToId: q.assignedToId } : {}),
      ...(q.unassigned === 'true' && me.role !== 'TELECALLER' ? { assignedToId: null } : {}),
      ...(q.due === 'today' ? { followUpAt: { lte: endOfDay } } : {}),
      ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { phone: { contains: q.q } }, { area: { contains: q.q, mode: 'insensitive' } }] } : {}),
    };
    const [items, counts] = await Promise.all([
      this.prisma.lead.findMany({ where, orderBy: [{ followUpAt: { sort: 'asc', nulls: 'last' } }, { updatedAt: 'desc' }], take: 300 }),
      this.prisma.lead.groupBy({ by: ['status'], where: this.scope(me), _count: true }),
    ]);
    const staff = await this.prisma.user.findMany({ where: { id: { in: items.map((l) => l.assignedToId).filter(Boolean) as string[] } }, select: { id: true, name: true } });
    const done = await Promise.all(items.map(async (l) => (l.workerId ? (await this.workers.completion(l.workerId).catch(() => null))?.percent ?? null : null)));
    return {
      counts: Object.fromEntries(counts.map((c) => [c.status, c._count])),
      items: items.map((l, i) => ({ ...l, completion: done[i], assignedToName: staff.find((s) => s.id === l.assignedToId)?.name ?? null })),
    };
  }

  @Get('telecallers')
  async telecallers(@CurrentUser() me: AuthUser) {
    this.scope(me);
    return this.prisma.user.findMany({ where: { roles: { has: 'TELECALLER' }, status: 'ACTIVE' }, select: { id: true, name: true } });
  }

  @Get(':id')
  async detail(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    const lead = await this.prisma.lead.findFirst({ where: { id, ...this.scope(me) }, include: { activities: { orderBy: { createdAt: 'desc' }, take: 50 } } });
    if (!lead) throw new NotFoundException('Lead not found');
    const worker = lead.workerId ? await this.workers.getOwn(lead.workerId) : null;
    // Telecallers never see identity documents, only whether they are uploaded.
    const safeWorker = worker
      ? { ...worker, documents: worker.documents.map((d) => ({ id: d.id, type: d.type, status: d.status, rejectReason: d.rejectReason })) }
      : null;
    return { ...lead, worker: safeWorker };
  }

  @RequirePerms('leads.assign')
  @Post('assign')
  @HttpCode(200)
  async assign(@CurrentUser() me: AuthUser, @Body(Z(Assign)) b: z.infer<typeof Assign>, @ClientIp() ip: string) {
    if (me.role === 'TELECALLER') throw new ForbiddenException();
    if (b.assignedToId) {
      const t = await this.prisma.user.findUnique({ where: { id: b.assignedToId } });
      if (!t?.roles.includes('TELECALLER')) throw new BadRequestException('Assign leads to a telecaller');
    }
    await this.prisma.lead.updateMany({ where: { id: { in: b.leadIds } }, data: { assignedToId: b.assignedToId } });
    await this.prisma.leadActivity.createMany({ data: b.leadIds.map((leadId) => ({ leadId, actorId: me.id, kind: 'ASSIGNED', note: b.assignedToId ? `Assigned` : 'Unassigned' })) });
    await this.audit.log(me, { action: 'lead.assign', entityType: 'Lead', entityId: b.leadIds.join(',').slice(0, 190), after: { assignedToId: b.assignedToId, count: b.leadIds.length }, ip });
    return { ok: true, count: b.leadIds.length };
  }

  @Post(':id/outcome')
  @HttpCode(200)
  async outcome(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body(Z(Outcome)) b: z.infer<typeof Outcome>) {
    const lead = await this.own(me, id);
    if (me.role === 'TELECALLER' && b.status === 'CONVERTED') throw new ForbiddenException('Leads become converted automatically after verification');
    await this.prisma.lead.update({ where: { id }, data: { status: b.status, followUpAt: b.followUpAt === undefined ? lead.followUpAt : b.followUpAt } });
    await this.prisma.leadActivity.create({ data: { leadId: id, actorId: me.id, kind: 'OUTCOME', note: [b.status.replace(/_/g, ' ').toLowerCase(), b.note].filter(Boolean).join(' · ') } });
    return { ok: true };
  }

  @Post(':id/call')
  @HttpCode(200)
  async logCall(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body(Z(z.object({ answered: z.boolean(), note: z.string().trim().max(400).optional() }))) b: { answered: boolean; note?: string }) {
    const lead = await this.own(me, id);
    await this.prisma.leadActivity.create({ data: { leadId: id, actorId: me.id, kind: 'CALL', note: `${b.answered ? 'Answered' : 'No answer'}${b.note ? ` · ${b.note}` : ''}` } });
    if (lead.status === 'NEW') await this.prisma.lead.update({ where: { id }, data: { status: 'CONTACTED' } });
    return { ok: true, phone: lead.phone };
  }

  @Post(':id/send-link')
  @HttpCode(200)
  async sendLink(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    const lead = await this.own(me, id);
    await this.sms.send(lead.phone, 'Complete your Karvia worker profile: log in at karvia.services with this number to continue where you left off.');
    await this.prisma.leadActivity.create({ data: { leadId: id, actorId: me.id, kind: 'SMS', note: 'Sent profile completion link' } });
    return { ok: true };
  }

  @Patch(':id/worker')
  async editWorker(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body(Z(TelecallerWorkerPatch)) b: z.infer<typeof TelecallerWorkerPatch>) {
    const lead = await this.own(me, id);
    if (!lead.workerId) throw new BadRequestException('This lead has no worker profile yet');
    const r = await this.workers.update(lead.workerId, b, me);
    await this.prisma.leadActivity.create({ data: { leadId: id, actorId: me.id, kind: 'PROFILE_EDIT', note: `Updated ${Object.keys(b).join(', ')}` } });
    return r;
  }
}
