import { BadRequestException, Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { BookingType, DocType, PricingModel, Role } from '@prisma/client';
import { z } from 'zod';
import { CatalogService } from '../catalog/catalog.module';
import { AuditService } from '../common/audit.service';
import { AuthUser, PERMISSIONS } from '../common/auth.types';
import { ClientIp, CurrentUser, RequirePerms, Roles } from '../common/decorators';
import { latLng, phoneSchema } from '../common/util';
import { Z } from '../common/zod.pipe';
import { MatchingService } from '../matching/matching.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsSchema, SettingsService } from '../settings/settings.service';

const slug = z.string().trim().min(2).max(60).regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers and dashes');
const CategoryBody = z.object({ name: z.string().trim().min(2).max(60), nameHi: z.string().trim().max(60).nullable().optional(), slug, active: z.boolean().default(true), sortOrder: z.number().int().default(0) });
const SubBody = CategoryBody.extend({ categoryId: z.string() });
const ServiceBody = z.object({
  subCategoryId: z.string(),
  name: z.string().trim().min(2).max(80),
  nameHi: z.string().trim().max(80).nullable().optional(),
  slug,
  active: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  bookingTypes: z.array(z.nativeEnum(BookingType)).min(1),
  pricingModels: z.array(z.nativeEnum(PricingModel)).min(1),
  durationMin: z.number().int().min(15).max(10080).default(60),
  minNoticeMin: z.number().int().min(0).max(10080).default(120),
  maxAdvanceDays: z.number().int().min(1).max(180).default(15),
  freeCancelMin: z.number().int().min(0).max(10080).default(60),
  requiredDocs: z.array(z.nativeEnum(DocType)).default([]),
  needsWorkHistory: z.boolean().default(false),
});
const StaffBody = z.object({
  phone: phoneSchema,
  name: z.string().trim().min(2).max(80),
  role: z.enum(['ADMIN', 'SUBADMIN', 'TELECALLER']),
  staffRoleId: z.string().nullable().optional(),
});
const StaffRoleBody = z.object({ name: z.string().trim().min(2).max(60), permissions: z.array(z.enum(PERMISSIONS)) });
const MatchTest = z.object({
  serviceId: z.string(),
  ...latLng,
  radiusKm: z.number().int().min(1).max(100),
  bookingType: z.nativeEnum(BookingType).default('INSTANT'),
  scheduledAt: z.coerce.date().optional(),
});

@Roles('ADMIN', 'SUBADMIN')
@Controller('admin')
export class AdminConfigController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly settings: SettingsService,
    private readonly matching: MatchingService,
    private readonly audit: AuditService,
  ) {}

  // ─────────────── Categories ───────────────

  @Get('catalog')
  tree() {
    return this.catalog.tree(true);
  }

  @RequirePerms('categories.edit')
  @Post('categories')
  async addCategory(@CurrentUser() me: AuthUser, @Body(Z(CategoryBody)) b: z.infer<typeof CategoryBody>) {
    const c = await this.prisma.category.create({ data: b });
    await this.audit.log(me, { action: 'category.create', entityType: 'Category', entityId: c.id, after: b });
    return c;
  }

  @RequirePerms('categories.edit')
  @Patch('categories/:id')
  async editCategory(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body(Z(CategoryBody.partial())) b: Partial<z.infer<typeof CategoryBody>>) {
    const c = await this.prisma.category.update({ where: { id }, data: b });
    await this.audit.log(me, { action: 'category.update', entityType: 'Category', entityId: id, after: b });
    return c;
  }

  @RequirePerms('categories.edit')
  @Post('subcategories')
  async addSub(@CurrentUser() me: AuthUser, @Body(Z(SubBody)) b: z.infer<typeof SubBody>) {
    const s = await this.prisma.subCategory.create({ data: b });
    await this.audit.log(me, { action: 'subcategory.create', entityType: 'SubCategory', entityId: s.id, after: b });
    return s;
  }

  @RequirePerms('categories.edit')
  @Patch('subcategories/:id')
  async editSub(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body(Z(SubBody.partial())) b: Partial<z.infer<typeof SubBody>>) {
    const s = await this.prisma.subCategory.update({ where: { id }, data: b });
    await this.audit.log(me, { action: 'subcategory.update', entityType: 'SubCategory', entityId: id, after: b });
    return s;
  }

  @RequirePerms('categories.edit')
  @Post('services')
  async addService(@CurrentUser() me: AuthUser, @Body(Z(ServiceBody)) b: z.infer<typeof ServiceBody>) {
    const s = await this.prisma.service.create({ data: b });
    await this.audit.log(me, { action: 'service.create', entityType: 'Service', entityId: s.id, after: b });
    return s;
  }

  @RequirePerms('categories.edit')
  @Patch('services/:id')
  async editService(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body(Z(ServiceBody.partial())) b: Partial<z.infer<typeof ServiceBody>>) {
    const before = await this.prisma.service.findUniqueOrThrow({ where: { id } });
    const s = await this.prisma.service.update({ where: { id }, data: b });
    await this.audit.log(me, { action: 'service.update', entityType: 'Service', entityId: id, before, after: b });
    return s;
  }

  // ─────────────── Business settings ───────────────

  @Get('settings')
  getSettings() {
    return this.settings.get();
  }

  @RequirePerms('settings.edit')
  @Patch('settings')
  async updateSettings(@CurrentUser() me: AuthUser, @Body(Z(SettingsSchema.partial())) b: Partial<z.infer<typeof SettingsSchema>>, @ClientIp() ip: string) {
    if (!Object.keys(b).length) throw new BadRequestException('Nothing to change');
    const { before, after } = await this.settings.update(b, me.id);
    const changed = Object.keys(b);
    await this.audit.log(me, {
      action: 'settings.update', entityType: 'Settings', entityId: changed.join(','),
      before: Object.fromEntries(changed.map((k) => [k, (before as any)[k]])),
      after: Object.fromEntries(changed.map((k) => [k, (after as any)[k]])), ip,
    });
    return after;
  }

  @RequirePerms('bookings.view')
  @Post('matching/test')
  @HttpCode(200)
  async testMatching(@Body(Z(MatchTest)) b: z.infer<typeof MatchTest>) {
    const svc = await this.prisma.service.findUniqueOrThrow({ where: { id: b.serviceId } });
    const r = await this.matching.explain({ ...b, durationMin: svc.durationMin });
    const names = await this.prisma.user.findMany({ where: { id: { in: r.eligible.map((e) => e.workerId) } }, select: { id: true, name: true } });
    const offeredTo = await this.prisma.workerService.count({ where: { serviceId: b.serviceId, worker: { verificationStatus: 'VERIFIED' } } });
    return { ...r, eligible: r.eligible.map((e) => ({ ...e, name: names.find((n) => n.id === e.workerId)?.name })), verifiedOfferingService: offeredTo };
  }

  // ─────────────── Staff & roles ───────────────

  @RequirePerms('staff.manage')
  @Get('staff')
  async staff() {
    const [users, roles] = await Promise.all([
      this.prisma.user.findMany({
        where: { roles: { hasSome: ['ADMIN', 'SUBADMIN', 'TELECALLER'] } },
        select: { id: true, name: true, phone: true, roles: true, status: true, totpEnabled: true, lastLoginAt: true, staffRole: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.staffRole.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { users: true } } } }),
    ]);
    return { users, roles, permissions: PERMISSIONS };
  }

  @RequirePerms('staff.manage')
  @Post('staff')
  async addStaff(@CurrentUser() me: AuthUser, @Body(Z(StaffBody)) b: z.infer<typeof StaffBody>, @ClientIp() ip: string) {
    if (b.role === 'SUBADMIN' && !b.staffRoleId) throw new BadRequestException('Choose a permission role for the sub-admin');
    if (b.role === 'ADMIN' && me.role !== 'ADMIN') throw new BadRequestException('Only an admin can add another admin');
    const existing = await this.prisma.user.findUnique({ where: { phone: b.phone } });
    const roles = [...new Set([...(existing?.roles ?? []), b.role as Role])];
    const u = existing
      ? await this.prisma.user.update({ where: { id: existing.id }, data: { roles, staffRoleId: b.staffRoleId ?? existing.staffRoleId, name: existing.name ?? b.name } })
      : await this.prisma.user.create({ data: { phone: b.phone, name: b.name, roles, staffRoleId: b.staffRoleId ?? null } });
    await this.audit.log(me, { action: 'staff.add', entityType: 'User', entityId: u.id, after: { role: b.role, staffRoleId: b.staffRoleId }, ip });
    return { id: u.id };
  }

  @RequirePerms('staff.manage')
  @Post('staff/:id/remove')
  @HttpCode(200)
  async removeStaff(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body(Z(z.object({ role: z.enum(['ADMIN', 'SUBADMIN', 'TELECALLER']) }))) b: { role: Role }, @ClientIp() ip: string) {
    if (id === me.id) throw new BadRequestException('You cannot remove your own access');
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id } });
    if (b.role === 'ADMIN' && me.role !== 'ADMIN') throw new BadRequestException('Only an admin can remove an admin');
    await this.prisma.user.update({ where: { id }, data: { roles: u.roles.filter((r) => r !== b.role) } });
    await this.prisma.session.updateMany({ where: { userId: id, activeRole: b.role, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.audit.log(me, { action: 'staff.remove', entityType: 'User', entityId: id, before: { roles: u.roles }, after: { removed: b.role }, ip });
    return { ok: true };
  }

  @RequirePerms('staff.manage')
  @Post('staff-roles')
  async addRole(@CurrentUser() me: AuthUser, @Body(Z(StaffRoleBody)) b: z.infer<typeof StaffRoleBody>, @ClientIp() ip: string) {
    const r = await this.prisma.staffRole.create({ data: b });
    await this.audit.log(me, { action: 'staff_role.create', entityType: 'StaffRole', entityId: r.id, after: b, ip });
    return r;
  }

  @RequirePerms('staff.manage')
  @Patch('staff-roles/:id')
  async editRole(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body(Z(StaffRoleBody.partial())) b: Partial<z.infer<typeof StaffRoleBody>>, @ClientIp() ip: string) {
    const before = await this.prisma.staffRole.findUniqueOrThrow({ where: { id } });
    const r = await this.prisma.staffRole.update({ where: { id }, data: b });
    await this.audit.log(me, { action: 'staff_role.update', entityType: 'StaffRole', entityId: id, before, after: b, ip });
    return r;
  }
}
