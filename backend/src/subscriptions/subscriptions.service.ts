import { Global, Injectable, Module } from '@nestjs/common';
import { Prisma, SubscriptionKind, SubscriptionSource } from '@prisma/client';
import { addDays } from '../common/util';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

type Db = PrismaService | Prisma.TransactionClient;

/** Client ₹9 access and worker trial / ₹199 plan. Nothing here ever renews or charges automatically. */
@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /** Latest end date among active subscriptions of these kinds, or null. Grace days apply to worker plans only. */
  async activeUntil(userId: string, kinds: SubscriptionKind[], db: Db = this.prisma): Promise<Date | null> {
    const s = await this.settings.get();
    const now = new Date();
    const graceMs = kinds.includes('CLIENT_ACCESS') ? 0 : s.workerGraceDays * 86400000;
    const sub = await db.subscription.findFirst({
      where: { userId, kind: { in: kinds }, startsAt: { lte: now }, endsAt: { gt: new Date(now.getTime() - graceMs) } },
      orderBy: { endsAt: 'desc' },
    });
    return sub?.endsAt ?? null;
  }

  async hasClientAccess(userId: string) {
    return !!(await this.activeUntil(userId, ['CLIENT_ACCESS']));
  }

  async hasWorkerPlan(userId: string) {
    return !!(await this.activeUntil(userId, ['WORKER_TRIAL', 'WORKER_PLAN']));
  }

  /** Adds a period that starts when the current one ends (early renewal never loses days). */
  async grant(
    userId: string,
    kind: SubscriptionKind,
    days: number,
    source: SubscriptionSource,
    opts: { paymentId?: string; note?: string } = {},
    db: Db = this.prisma,
  ) {
    const kinds: SubscriptionKind[] = kind === 'CLIENT_ACCESS' ? ['CLIENT_ACCESS'] : ['WORKER_TRIAL', 'WORKER_PLAN'];
    const current = await db.subscription.findFirst({
      where: { userId, kind: { in: kinds }, endsAt: { gt: new Date() } },
      orderBy: { endsAt: 'desc' },
    });
    const startsAt = current ? current.endsAt : new Date();
    return db.subscription.create({
      data: { userId, kind, source, startsAt, endsAt: addDays(startsAt, days), paymentId: opts.paymentId, note: opts.note },
    });
  }

  async summary(userId: string) {
    const now = new Date();
    const subs = await this.prisma.subscription.findMany({ where: { userId }, orderBy: { startsAt: 'desc' }, take: 50 });
    const pick = (kinds: SubscriptionKind[]) => {
      const active = subs.filter((s) => kinds.includes(s.kind) && s.startsAt <= now && s.endsAt > now);
      if (!active.length) return null;
      const endsAt = new Date(Math.max(...subs.filter((s) => kinds.includes(s.kind) && s.endsAt > now).map((s) => s.endsAt.getTime())));
      const current = active[0];
      return { kind: current.kind, source: current.source, startsAt: current.startsAt, endsAt, daysLeft: Math.ceil((endsAt.getTime() - now.getTime()) / 86400000) };
    };
    return { clientAccess: pick(['CLIENT_ACCESS']), workerPlan: pick(['WORKER_TRIAL', 'WORKER_PLAN']), history: subs };
  }
}

@Global()
@Module({ providers: [SubscriptionsService], exports: [SubscriptionsService] })
export class SubscriptionsModule {}
