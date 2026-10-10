import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { addDays } from '../common/util';
import { env } from '../config/env';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Daily (09:00 IST) reminders before access / trial / plan ends, and telecaller leads for workers whose
 * trial is ending or plan has expired. Each reminder is sent at most once per day per user.
 */
@Injectable()
export class RemindersService {
  private log = new Logger('Reminders');
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron('0 30 3 * * *') // 03:30 UTC = 09:00 IST
  async daily() {
    if (env().NODE_ENV === 'test') return;
    await this.run().catch((e) => this.log.error(e.message));
  }

  private async sentToday(userId: string, type: string) {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    return (await this.prisma.notification.count({ where: { userId, type, createdAt: { gte: start } } })) > 0;
  }

  async run() {
    const now = new Date();
    const ending = await this.prisma.subscription.findMany({
      where: { endsAt: { gt: now, lte: addDays(now, 3) } },
      orderBy: { endsAt: 'desc' },
    });
    const latest = new Map<string, (typeof ending)[number]>();
    for (const s of ending) {
      const key = `${s.userId}:${s.kind === 'CLIENT_ACCESS' ? 'C' : 'W'}`;
      if (!latest.has(key)) latest.set(key, s);
    }
    let sent = 0;
    for (const s of latest.values()) {
      // Skip if a later period already follows this one.
      const next = await this.prisma.subscription.count({ where: { userId: s.userId, startsAt: { gte: s.endsAt } } });
      if (next) continue;
      const days = Math.ceil((s.endsAt.getTime() - now.getTime()) / 86400000);
      const type = s.kind === 'CLIENT_ACCESS' ? 'ACCESS_ENDING' : s.kind === 'WORKER_TRIAL' ? 'TRIAL_ENDING' : 'PLAN_ENDING';
      if (await this.sentToday(s.userId, type)) continue;
      if (s.kind === 'CLIENT_ACCESS' && days !== 3 && days !== 1) continue;
      if (s.kind !== 'CLIENT_ACCESS' && days > 2) continue;
      await this.notifications.notify({
        userId: s.userId,
        type,
        title: s.kind === 'CLIENT_ACCESS' ? 'Your access ends soon' : s.kind === 'WORKER_TRIAL' ? 'Your free trial ends soon' : 'Your plan ends soon',
        body: `${days} day${days === 1 ? '' : 's'} left. Renew anytime — nothing is charged automatically.`,
        link: s.kind === 'CLIENT_ACCESS' ? '/client/payments' : '/worker/plan',
        sms: true,
      });
      sent++;
      if (s.kind === 'WORKER_TRIAL') {
        await this.prisma.lead.updateMany({ where: { workerId: s.userId, status: 'CONVERTED' }, data: { status: 'PAYMENT_PENDING', source: 'TRIAL_ENDING' } });
      }
    }
    // Workers whose plan lapsed yesterday become leads again.
    const lapsed = await this.prisma.subscription.findMany({
      where: { kind: { in: ['WORKER_TRIAL', 'WORKER_PLAN'] }, endsAt: { gt: addDays(now, -1), lte: now } },
      select: { userId: true },
      distinct: ['userId'],
    });
    for (const l of lapsed) {
      const active = await this.prisma.subscription.count({ where: { userId: l.userId, kind: { in: ['WORKER_TRIAL', 'WORKER_PLAN'] }, endsAt: { gt: now } } });
      if (!active) await this.prisma.lead.updateMany({ where: { workerId: l.userId }, data: { status: 'PAYMENT_PENDING', source: 'EXPIRED_WORKER' } });
    }
    return { sent, lapsed: lapsed.length };
  }
}
