import { Global, Injectable, Module } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';

/** Every business rule the owner can change from the admin panel, with launch defaults from the requirement docs. */
export const SettingsSchema = z.object({
  clientAccessFeePaise: z.number().int().min(0).max(1_000_000),
  clientAccessDays: z.number().int().min(1).max(365),
  workerPlanPricePaise: z.number().int().min(0).max(10_000_000),
  workerPlanDays: z.number().int().min(1).max(365),
  workerTrialDays: z.number().int().min(0).max(60),
  workerGraceDays: z.number().int().min(0).max(30),
  trialsPerMobile: z.number().int().min(0).max(5),
  defaultRadiusKm: z.number().int().min(1).max(100),
  radiusStepsKm: z.array(z.number().int().min(1).max(500)).min(1).max(8),
  acceptTimeoutSec: z.number().int().min(15).max(600),
  maxWorkersNotified: z.number().int().min(1).max(100),
  quoteValidityMin: z.number().int().min(5).max(1440),
  quoteRequestHours: z.number().int().min(1).max(168),
  maxOpenRequestsPerClient: z.number().int().min(1).max(50),
  maxRequestsPerClientPerDay: z.number().int().min(1).max(200),
  maxOffersPerWorkerPerHour: z.number().int().min(1).max(500),
  lateCancelMin: z.number().int().min(0).max(1440),
  noShowsBeforeSuspend: z.number().int().min(1).max(20),
  clientTaxPercent: z.number().min(0).max(28).nullable(),
  workerTaxPercent: z.number().min(0).max(28).nullable(),
  contactMode: z.enum(['DIRECT', 'MASKED']),
  features: z.object({
    voiceRequest: z.boolean(),
    voiceRegistration: z.boolean(),
    referrals: z.boolean(),
    inAppChat: z.boolean(),
  }),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  clientAccessFeePaise: 900,
  clientAccessDays: 30,
  workerPlanPricePaise: 19900,
  workerPlanDays: 30,
  workerTrialDays: 5,
  workerGraceDays: 0,
  trialsPerMobile: 1,
  defaultRadiusKm: 5,
  radiusStepsKm: [5, 10, 15, 20],
  acceptTimeoutSec: 60,
  maxWorkersNotified: 15,
  quoteValidityMin: 30,
  quoteRequestHours: 24,
  maxOpenRequestsPerClient: 3,
  maxRequestsPerClientPerDay: 10,
  maxOffersPerWorkerPerHour: 20,
  lateCancelMin: 60,
  noShowsBeforeSuspend: 2,
  clientTaxPercent: null, // to be confirmed by the company's CA; nothing hard-coded
  workerTaxPercent: null,
  contactMode: 'DIRECT',
  features: { voiceRequest: true, voiceRegistration: true, referrals: false, inAppChat: false },
};

@Injectable()
export class SettingsService {
  private cache: { value: Settings; at: number } | null = null;
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<Settings> {
    if (this.cache && Date.now() - this.cache.at < 10_000) return this.cache.value;
    const rows = await this.prisma.setting.findMany();
    const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };
    for (const r of rows) if (r.key in merged) merged[r.key] = r.value;
    const value = SettingsSchema.parse(merged);
    this.cache = { value, at: Date.now() };
    return value;
  }

  /** Validates a partial update against the full schema before saving anything. */
  async update(patch: Partial<Settings>, actorId: string): Promise<{ before: Settings; after: Settings }> {
    const before = await this.get();
    const after = SettingsSchema.parse({ ...before, ...patch });
    await this.prisma.$transaction(
      Object.keys(patch).map((key) =>
        this.prisma.setting.upsert({
          where: { key },
          create: { key, value: (after as Record<string, any>)[key], updatedBy: actorId },
          update: { value: (after as Record<string, any>)[key], updatedBy: actorId },
        }),
      ),
    );
    this.cache = null;
    return { before, after };
  }

  invalidate() {
    this.cache = null;
  }
}

@Global()
@Module({ providers: [SettingsService], exports: [SettingsService] })
export class SettingsModule {}
