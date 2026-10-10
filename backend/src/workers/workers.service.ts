import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Availability, DocType, PricingModel, Prisma } from '@prisma/client';
import { z } from 'zod';
import { AuditService } from '../common/audit.service';
import { AuthUser } from '../common/auth.types';
import { haversineKm, latLng } from '../common/util';
import { FilesService } from '../files/files.service';
import { MatchingService } from '../matching/matching.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

export const WorkerProfilePatch = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  photoFileId: z.string().nullable().optional(),
  workPhotoIds: z.array(z.string()).max(20).optional(),
  experienceYears: z.number().int().min(0).max(60).nullable().optional(),
  bio: z.string().trim().max(600).nullable().optional(),
  languages: z.array(z.string().trim().min(2).max(30)).max(10).optional(),
  skills: z.array(z.string().trim().min(2).max(60)).max(30).optional(),
  certifications: z.array(z.string().trim().min(2).max(80)).max(20).optional(),
  area: z.string().trim().min(2).max(120).optional(),
  pincode: z.string().regex(/^\d{6}$/, 'Enter a 6-digit pincode').optional(),
  lat: latLng.lat.optional(),
  lng: latLng.lng.optional(),
  advanceBooking: z.boolean().optional(),
  minNoticeMin: z.number().int().min(0).max(10080).optional(),
  maxAdvanceDays: z.number().int().min(1).max(90).optional(),
  expectedSalary: z.string().trim().max(60).nullable().optional(),
  preferredLocation: z.string().trim().max(120).nullable().optional(),
  joining: z.string().trim().max(60).nullable().optional(),
  serviceIds: z.array(z.string()).max(20).optional(),
});
export type WorkerProfilePatchT = z.infer<typeof WorkerProfilePatch>;

export const RatesBody = z.object({
  rates: z
    .array(
      z.object({
        serviceId: z.string().nullable().optional(),
        label: z.string().trim().min(2).max(60),
        model: z.nativeEnum(PricingModel),
        amountPaise: z.number().int().min(0).max(100_000_000).nullable().optional(),
      }),
    )
    .max(40),
});

export const EmploymentBody = z.object({
  items: z
    .array(
      z.object({
        company: z.string().trim().min(2).max(120),
        title: z.string().trim().min(2).max(80),
        startDate: z.string().trim().max(20).nullable().optional(),
        endDate: z.string().trim().max(20).nullable().optional(),
        responsibilities: z.string().trim().max(800).nullable().optional(),
      }),
    )
    .max(20),
});

const SearchQuery = z.object({
  serviceId: z.string().min(1),
  lat: z.coerce.number().pipe(latLng.lat),
  lng: z.coerce.number().pipe(latLng.lng),
  radiusKm: z.coerce.number().int().min(1).max(100).optional(),
  sort: z.enum(['nearest', 'rating', 'price', 'jobs']).default('nearest'),
  availableNow: z.enum(['true', 'false']).default('false'),
});
export { SearchQuery };

@Injectable()
export class WorkersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
    private readonly subs: SubscriptionsService,
    private readonly matching: MatchingService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  private async load(workerId: string) {
    const w = await this.prisma.workerProfile.findUnique({
      where: { userId: workerId },
      include: {
        user: { select: { id: true, name: true, phone: true, status: true, createdAt: true } },
        services: { include: { service: { include: { subCategory: { include: { category: true } } } } } },
        rates: { orderBy: { sortOrder: 'asc' } },
        employment: { orderBy: { createdAt: 'asc' } },
        blockedDays: { where: { date: { gte: new Date(Date.now() - 86400000) } }, orderBy: { date: 'asc' } },
      },
    });
    if (!w) throw new NotFoundException('Worker profile not found');
    return w;
  }

  private async requiredDocs(workerId: string): Promise<DocType[]> {
    const svcs = await this.prisma.workerService.findMany({ where: { workerId }, include: { service: true } });
    return [...new Set(svcs.flatMap((s) => s.service.requiredDocs))];
  }

  /** Which profile sections are done. The worker may save anything at any time; submission needs the required ones. */
  async completion(workerId: string) {
    const w = await this.load(workerId);
    const docs = await this.prisma.document.findMany({ where: { workerId } });
    const required = await this.requiredDocs(workerId);
    const uploaded = new Set(docs.filter((d) => d.status !== 'REJECTED').map((d) => d.type));
    const needsHistory = w.services.some((s) => s.service.needsWorkHistory);
    const quoteOnly = w.services.length > 0 && w.services.every((s) => s.service.pricingModels.every((m) => m === 'CUSTOM_QUOTE'));

    const checks = [
      { key: 'name', label: 'Name', done: !!w.user.name, required: true },
      { key: 'photo', label: 'Profile photo', done: !!w.photoFileId, required: true },
      { key: 'services', label: 'Category & services', done: w.services.length > 0, required: true },
      { key: 'location', label: 'Work area', done: w.lat != null && !!w.area, required: true },
      { key: 'experience', label: 'Experience', done: w.experienceYears != null, required: true },
      { key: 'skills', label: 'Skills', done: w.skills.length > 0, required: false },
      { key: 'pricing', label: 'Pricing', done: quoteOnly || w.rates.length > 0, required: true },
      { key: 'history', label: 'Work history', done: !needsHistory || w.employment.length > 0, required: needsHistory },
      { key: 'documents', label: 'Documents', done: required.every((t) => uploaded.has(t)), required: required.length > 0 },
    ];
    const pct = Math.round((checks.filter((c) => c.done).length / checks.length) * 100);
    return { percent: pct, checks, requiredDocs: required, missing: checks.filter((c) => c.required && !c.done).map((c) => c.label) };
  }

  async eligibility(workerId: string) {
    const w = await this.prisma.workerProfile.findUniqueOrThrow({ where: { userId: workerId }, include: { user: true } });
    const planUntil = await this.subs.activeUntil(workerId, ['WORKER_TRIAL', 'WORKER_PLAN']);
    const items = {
      verified: w.verificationStatus === 'VERIFIED',
      plan: !!planUntil,
      available: w.availability === 'AVAILABLE',
      hasServices: (await this.prisma.workerService.count({ where: { workerId } })) > 0,
      location: w.lat != null,
      accountActive: w.user.status === 'ACTIVE' || w.user.status === 'WARNED',
    };
    return { eligible: Object.values(items).every(Boolean), ...items, planUntil };
  }

  async getOwn(workerId: string) {
    const [w, completion, eligibility, documents, plan] = await Promise.all([
      this.load(workerId),
      this.completion(workerId),
      this.eligibility(workerId),
      this.prisma.document.findMany({ where: { workerId }, orderBy: { createdAt: 'desc' } }),
      this.subs.summary(workerId),
    ]);
    return {
      ...this.serialize(w, true),
      documents: documents.map((d) => ({ id: d.id, type: d.type, status: d.status, rejectReason: d.rejectReason, fileId: d.fileId, createdAt: d.createdAt })),
      completion,
      eligibility,
      plan: plan.workerPlan,
      trialUsed: w.trialUsed,
    };
  }

  /** Shared by the worker (autosave), admin and telecaller (restricted fields chosen by the caller). */
  async update(workerId: string, patch: WorkerProfilePatchT, actor: AuthUser) {
    const before = await this.load(workerId);
    const own = actor.id === workerId;
    if (patch.photoFileId) await this.files.ownedBy(own ? actor.id : workerId, [patch.photoFileId], ['PROFILE_PHOTO']);
    if (patch.workPhotoIds?.length) await this.files.ownedBy(own ? actor.id : workerId, patch.workPhotoIds, ['WORK_PHOTO']);
    if ((patch.lat == null) !== (patch.lng == null)) throw new BadRequestException('Send both latitude and longitude');

    if (patch.serviceIds) {
      const found = await this.prisma.service.findMany({ where: { id: { in: patch.serviceIds }, active: true } });
      if (found.length !== new Set(patch.serviceIds).size) throw new BadRequestException('One or more services are not available');
    }

    const { name, serviceIds, ...profile } = patch;
    // Verified workers changing who they are (name/photo/services) go back to review before clients see the change.
    const identityChanged =
      before.verificationStatus === 'VERIFIED' && own &&
      ((name && name !== before.user.name) || (patch.photoFileId !== undefined && patch.photoFileId !== before.photoFileId) ||
        (serviceIds && serviceIds.sort().join() !== before.services.map((s) => s.serviceId).sort().join()));

    await this.prisma.$transaction(async (tx) => {
      if (name) await tx.user.update({ where: { id: workerId }, data: { name } });
      await tx.workerProfile.update({
        where: { userId: workerId },
        data: { ...profile, ...(identityChanged ? { verificationStatus: 'PENDING', submittedAt: new Date() } : {}) },
      });
      if (serviceIds) {
        await tx.workerService.deleteMany({ where: { workerId } });
        if (serviceIds.length) await tx.workerService.createMany({ data: serviceIds.map((serviceId) => ({ workerId, serviceId })) });
      }
    });

    await this.syncLead(workerId);
    if (!own) {
      await this.audit.log(actor, { action: 'worker.profile_edit', entityType: 'Worker', entityId: workerId, after: patch as Prisma.InputJsonValue });
    }
    return this.getOwn(workerId);
  }

  async setRates(workerId: string, body: z.infer<typeof RatesBody>, actor: AuthUser) {
    const services = await this.prisma.workerService.findMany({ where: { workerId }, include: { service: true } });
    const allowed = new Map(services.map((s) => [s.serviceId, s.service.pricingModels]));
    const allModels = new Set(services.flatMap((s) => s.service.pricingModels));
    for (const r of body.rates) {
      if (r.serviceId && !allowed.has(r.serviceId)) throw new BadRequestException('Add the service before pricing it');
      const models = r.serviceId ? allowed.get(r.serviceId)! : [...allModels];
      if (!models.includes(r.model)) throw new BadRequestException(`"${r.model.replace(/_/g, ' ').toLowerCase()}" pricing is not allowed for this service`);
      if (r.model !== 'CUSTOM_QUOTE' && (r.amountPaise == null || r.amountPaise <= 0)) throw new BadRequestException(`Enter a price for "${r.label}"`);
    }
    await this.prisma.$transaction([
      this.prisma.workerRate.deleteMany({ where: { workerId } }),
      this.prisma.workerRate.createMany({
        data: body.rates.map((r, i) => ({
          workerId,
          serviceId: r.serviceId ?? null,
          label: r.label,
          model: r.model,
          amountPaise: r.model === 'CUSTOM_QUOTE' ? null : r.amountPaise ?? null,
          sortOrder: i,
        })),
      }),
    ]);
    if (actor.id !== workerId) await this.audit.log(actor, { action: 'worker.rates_edit', entityType: 'Worker', entityId: workerId, after: body as any });
    await this.syncLead(workerId);
    return this.prisma.workerRate.findMany({ where: { workerId }, orderBy: { sortOrder: 'asc' } });
  }

  async setEmployment(workerId: string, body: z.infer<typeof EmploymentBody>) {
    await this.prisma.$transaction([
      this.prisma.employmentHistory.deleteMany({ where: { workerId } }),
      this.prisma.employmentHistory.createMany({ data: body.items.map((i) => ({ ...i, workerId })) }),
    ]);
    await this.syncLead(workerId);
    return this.prisma.employmentHistory.findMany({ where: { workerId }, orderBy: { createdAt: 'asc' } });
  }

  async setBlockedDates(workerId: string, dates: string[]) {
    const parsed = [...new Set(dates)].map((d) => new Date(`${d}T00:00:00Z`));
    await this.prisma.$transaction([
      this.prisma.blockedDate.deleteMany({ where: { workerId } }),
      this.prisma.blockedDate.createMany({ data: parsed.map((date) => ({ workerId, date })) }),
    ]);
    return { dates };
  }

  async setAvailability(workerId: string, availability: Availability) {
    if (availability === 'AVAILABLE') {
      const w = await this.prisma.workerProfile.findUniqueOrThrow({ where: { userId: workerId } });
      if (w.verificationStatus !== 'VERIFIED') throw new BadRequestException('You can go AVAILABLE after Karvia verifies your profile');
      if (!(await this.subs.hasWorkerPlan(workerId))) throw new BadRequestException('Your trial or plan has ended. Renew to receive requests.');
    }
    await this.prisma.workerProfile.update({ where: { userId: workerId }, data: { availability } });
    return this.eligibility(workerId);
  }

  async addDocument(workerId: string, type: DocType, fileId: string) {
    await this.files.ownedBy(workerId, [fileId], ['DOCUMENT']);
    const doc = await this.prisma.document.create({ data: { workerId, type, fileId } });
    await this.syncLead(workerId);
    return doc;
  }

  async removeDocument(workerId: string, docId: string) {
    const d = await this.prisma.document.findFirst({ where: { id: docId, workerId } });
    if (!d) throw new NotFoundException('Document not found');
    if (d.status === 'VERIFIED') throw new BadRequestException('Verified documents cannot be removed');
    await this.prisma.document.delete({ where: { id: docId } });
    return { ok: true };
  }

  async submit(workerId: string) {
    const c = await this.completion(workerId);
    if (c.missing.length) throw new BadRequestException(`Complete these first: ${c.missing.join(', ')}`);
    const w = await this.prisma.workerProfile.findUniqueOrThrow({ where: { userId: workerId } });
    if (['PENDING', 'UNDER_REVIEW', 'VERIFIED'].includes(w.verificationStatus)) return { status: w.verificationStatus };
    if (w.verificationStatus === 'SUSPENDED') throw new ForbiddenException('Your profile is suspended. Contact Karvia support.');
    await this.prisma.workerProfile.update({ where: { userId: workerId }, data: { verificationStatus: 'PENDING', submittedAt: new Date(), rejectReason: null } });
    await this.prisma.lead.updateMany({ where: { workerId }, data: { status: 'READY_FOR_VERIFICATION' } });
    return { status: 'PENDING' };
  }

  /** Keeps the telecaller lead in step with the registration. */
  async syncLead(workerId: string) {
    const w = await this.prisma.workerProfile.findUnique({
      where: { userId: workerId },
      include: { user: true, services: { include: { service: { include: { subCategory: true } } } } },
    });
    if (!w) return;
    const category = w.services[0]?.service.subCategory.name ?? null;
    await this.prisma.lead.updateMany({ where: { workerId }, data: { name: w.user.name, category, area: w.area } });
  }

  serialize(w: Awaited<ReturnType<WorkersService['load']>>, includePrivate: boolean) {
    return {
      id: w.userId,
      name: w.user.name,
      ...(includePrivate ? { phone: w.user.phone, lat: w.lat, lng: w.lng, pincode: w.pincode } : {}),
      photoUrl: w.photoFileId ? this.files.sign(w.photoFileId) : null,
      photoFileId: includePrivate ? w.photoFileId : undefined,
      workPhotos: w.workPhotoIds.map((id) => ({ id, url: this.files.sign(id) })),
      experienceYears: w.experienceYears,
      bio: w.bio,
      languages: w.languages,
      skills: w.skills,
      certifications: w.certifications,
      area: w.area,
      advanceBooking: w.advanceBooking,
      minNoticeMin: w.minNoticeMin,
      maxAdvanceDays: w.maxAdvanceDays,
      availability: w.availability,
      verificationStatus: w.verificationStatus,
      verified: w.verificationStatus === 'VERIFIED',
      rejectReason: includePrivate ? w.rejectReason : undefined,
      expectedSalary: w.expectedSalary,
      preferredLocation: w.preferredLocation,
      joining: w.joining,
      ratingAvg: Math.round(w.ratingAvg * 10) / 10,
      ratingCount: w.ratingCount,
      jobsDone: w.jobsDone,
      memberSince: w.user.createdAt,
      services: w.services.map((s) => ({
        id: s.service.id,
        name: s.service.name,
        subCategory: s.service.subCategory.name,
        category: s.service.subCategory.category.name,
        pricingModels: s.service.pricingModels,
        bookingTypes: s.service.bookingTypes,
      })),
      rates: w.rates.map((r) => ({ id: r.id, serviceId: r.serviceId, label: r.label, model: r.model, amountPaise: r.amountPaise })),
      employment: w.employment,
      blockedDates: w.blockedDays.map((b) => b.date.toISOString().slice(0, 10)),
    };
  }

  private async assertClientAccess(viewer: AuthUser) {
    if (viewer.role !== 'CLIENT') return; // staff may always view
    if (!(await this.subs.hasClientAccess(viewer.id))) {
      throw new ForbiddenException({ message: 'Unlock 30-day access for ₹9 to see worker profiles', code: 'ACCESS_REQUIRED' });
    }
  }

  /** Public profile: only after the ₹9 access payment, only for verified workers, never phone or exact location. */
  async publicProfile(viewer: AuthUser, workerId: string, from?: { lat: number; lng: number }) {
    await this.assertClientAccess(viewer);
    const w = await this.load(workerId);
    if (viewer.role === 'CLIENT' && (w.verificationStatus !== 'VERIFIED' || !['ACTIVE', 'WARNED'].includes(w.user.status))) {
      throw new NotFoundException('This worker is not available');
    }
    const reviews = await this.prisma.review.findMany({
      where: { targetId: workerId, direction: 'CLIENT_TO_WORKER', hidden: false },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { booking: { select: { serviceId: true } } },
    });
    const authors = await this.prisma.user.findMany({ where: { id: { in: reviews.map((r) => r.authorId) } }, select: { id: true, name: true } });
    const names = new Map(authors.map((a) => [a.id, a.name]));
    const favourite =
      viewer.role === 'CLIENT'
        ? await this.prisma.favourite.findMany({ where: { clientId: viewer.id, workerId } })
        : [];
    return {
      ...this.serialize(w, false),
      distanceKm: from && w.lat != null && w.lng != null ? Math.round(haversineKm(from.lat, from.lng, w.lat, w.lng) * 10) / 10 : null,
      planActive: await this.subs.hasWorkerPlan(workerId),
      favourite: favourite.some((f) => f.kind === 'FAVOURITE'),
      following: favourite.some((f) => f.kind === 'FOLLOW'),
      reviews: reviews.map((r) => ({
        id: r.id,
        stars: r.stars,
        text: r.text,
        createdAt: r.createdAt,
        author: (names.get(r.authorId) ?? 'Client').split(' ').map((p, i) => (i === 0 ? p : `${p[0]}.`)).join(' '),
      })),
    };
  }

  async search(viewer: AuthUser, q: z.infer<typeof SearchQuery>) {
    await this.assertClientAccess(viewer);
    const s = await this.settings.get();
    const radiusKm = q.radiusKm ?? s.defaultRadiusKm;
    const rows = await this.matching.findEligible({
      serviceId: q.serviceId, lat: q.lat, lng: q.lng, radiusKm, limit: 60, includeBusy: q.availableNow !== 'true',
    });
    if (!rows.length) return { radiusKm, items: [], nextRadiusKm: s.radiusStepsKm.find((r) => r > radiusKm) ?? null };

    const profiles = await this.prisma.workerProfile.findMany({
      where: { userId: { in: rows.map((r) => r.workerId) } },
      include: { user: { select: { name: true } }, rates: true },
    });
    const byId = new Map(profiles.map((p) => [p.userId, p]));
    let items = rows.map((r) => {
      const p = byId.get(r.workerId)!;
      const rates = p.rates.filter((x) => !x.serviceId || x.serviceId === q.serviceId);
      const priced = rates.filter((x) => x.amountPaise != null).sort((a, b) => a.amountPaise! - b.amountPaise!);
      return {
        id: p.userId,
        name: p.user.name,
        photoUrl: p.photoFileId ? this.files.sign(p.photoFileId) : null,
        experienceYears: p.experienceYears,
        skills: p.skills.slice(0, 5),
        languages: p.languages,
        ratingAvg: Math.round(p.ratingAvg * 10) / 10,
        ratingCount: p.ratingCount,
        jobsDone: p.jobsDone,
        availability: p.availability,
        distanceKm: r.distanceKm,
        startingPrice: priced[0] ? { amountPaise: priced[0].amountPaise, model: priced[0].model, label: priced[0].label } : null,
        quoteOnly: rates.length > 0 && rates.every((x) => x.model === 'CUSTOM_QUOTE'),
      };
    });
    if (q.sort === 'rating') items = items.sort((a, b) => b.ratingAvg - a.ratingAvg);
    if (q.sort === 'jobs') items = items.sort((a, b) => b.jobsDone - a.jobsDone);
    if (q.sort === 'price') items = items.sort((a, b) => (a.startingPrice?.amountPaise ?? 1e12) - (b.startingPrice?.amountPaise ?? 1e12));
    return { radiusKm, items, nextRadiusKm: null };
  }
}
