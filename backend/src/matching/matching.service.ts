import { Injectable } from '@nestjs/common';
import { BookingType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

export interface MatchQuery {
  serviceId: string;
  lat: number;
  lng: number;
  radiusKm: number;
  bookingType?: BookingType;
  scheduledAt?: Date | null;
  durationMin?: number;
  excludeWorkerIds?: string[];
  onlyWorkerIds?: string[];
  limit?: number;
  /** Search screen shows BUSY workers too (greyed); dispatch never does. */
  includeBusy?: boolean;
}

export interface MatchRow {
  workerId: string;
  distanceKm: number;
}

/**
 * The golden matching rule. A worker gets a request only if ALL are true:
 * verified, active trial/plan, AVAILABLE, offers the service, within radius of the JOB location,
 * free at that date/time, advance-booking rules met, account not suspended, and under the hourly offer cap.
 * Exact worker coordinates never leave this service; callers receive distance only.
 */
@Injectable()
export class MatchingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async findEligible(q: MatchQuery): Promise<MatchRow[]> {
    const s = await this.settings.get();
    const graceMs = s.workerGraceDays * 86400000;
    const latDelta = q.radiusKm / 111;
    const lngDelta = q.radiusKm / (111 * Math.max(Math.cos((q.lat * Math.PI) / 180), 0.2));
    const limit = q.limit ?? s.maxWorkersNotified;
    const exclude = q.excludeWorkerIds?.length ? q.excludeWorkerIds : ['-'];

    const distance = Prisma.sql`(2 * 6371 * asin(sqrt(
      power(sin(radians((wp.lat - ${q.lat}) / 2)), 2) +
      cos(radians(${q.lat})) * cos(radians(wp.lat)) * power(sin(radians((wp.lng - ${q.lng}) / 2)), 2)
    )))`;

    const conditions: Prisma.Sql[] = [
      Prisma.sql`wp."verificationStatus" = 'VERIFIED'`,
      Prisma.sql`u.status IN ('ACTIVE', 'WARNED')`,
      Prisma.sql`wp.lat IS NOT NULL AND wp.lng IS NOT NULL`,
      Prisma.sql`wp.lat BETWEEN ${q.lat - latDelta} AND ${q.lat + latDelta}`,
      Prisma.sql`wp.lng BETWEEN ${q.lng - lngDelta} AND ${q.lng + lngDelta}`,
      Prisma.sql`wp."userId" NOT IN (${Prisma.join(exclude)})`,
      Prisma.sql`EXISTS (SELECT 1 FROM "Subscription" sub WHERE sub."userId" = wp."userId"
        AND sub.kind IN ('WORKER_TRIAL', 'WORKER_PLAN') AND sub."startsAt" <= now()
        AND sub."endsAt" > ${new Date(Date.now() - graceMs)})`,
      // No job currently running.
      Prisma.sql`NOT EXISTS (SELECT 1 FROM "Booking" b WHERE b."workerId" = wp."userId" AND b.status = 'IN_PROGRESS')`,
    ];
    if (!q.includeBusy) {
      conditions.push(Prisma.sql`wp.availability = 'AVAILABLE'`);
      conditions.push(Prisma.sql`(SELECT count(*) FROM "RequestOffer" ro WHERE ro."workerId" = wp."userId"
        AND ro."createdAt" > now() - interval '1 hour') < ${s.maxOffersPerWorkerPerHour}`);
    }
    if (q.onlyWorkerIds?.length) conditions.push(Prisma.sql`wp."userId" IN (${Prisma.join(q.onlyWorkerIds)})`);

    if (q.bookingType === 'SCHEDULED' && q.scheduledAt) {
      const at = q.scheduledAt;
      const dur = q.durationMin ?? 60;
      conditions.push(Prisma.sql`wp."advanceBooking" = true`);
      conditions.push(Prisma.sql`${at} >= now() + (wp."minNoticeMin" * interval '1 minute')`);
      conditions.push(Prisma.sql`${at} <= now() + (wp."maxAdvanceDays" * interval '1 day')`);
      conditions.push(Prisma.sql`NOT EXISTS (SELECT 1 FROM "BlockedDate" bd WHERE bd."workerId" = wp."userId"
        AND bd.date = (${at}::timestamptz AT TIME ZONE 'Asia/Kolkata')::date)`);
      conditions.push(Prisma.sql`NOT EXISTS (SELECT 1 FROM "Booking" b WHERE b."workerId" = wp."userId"
        AND b.status IN ('ACCEPTED', 'CONFIRMED', 'IN_PROGRESS') AND b."scheduledAt" IS NOT NULL
        AND b."scheduledAt" > ${new Date(at.getTime() - dur * 60000)} AND b."scheduledAt" < ${new Date(at.getTime() + dur * 60000)})`);
    }

    const rows = await this.prisma.$queryRaw<{ workerId: string; distanceKm: number }[]>`
      SELECT wp."userId" AS "workerId", ${distance} AS "distanceKm"
      FROM "WorkerProfile" wp
      JOIN "WorkerService" ws ON ws."workerId" = wp."userId" AND ws."serviceId" = ${q.serviceId}
      JOIN "User" u ON u.id = wp."userId"
      WHERE ${Prisma.join(conditions, ' AND ')}
        AND ${distance} <= ${q.radiusKm}
      ORDER BY "distanceKm" ASC
      LIMIT ${limit}`;
    return rows.map((r) => ({ workerId: r.workerId, distanceKm: Math.round(Number(r.distanceKm) * 10) / 10 }));
  }

  /** Explains why each worker of a service is (not) eligible. Used by the admin "test the rules" tool. */
  async explain(q: MatchQuery) {
    const eligible = await this.findEligible({ ...q, limit: 100 });
    return { eligibleCount: eligible.length, eligible };
  }
}
