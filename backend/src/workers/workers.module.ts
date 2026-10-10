import { Body, Controller, Delete, Get, HttpCode, Module, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { Availability, DocType } from '@prisma/client';
import { z } from 'zod';
import { AuthUser } from '../common/auth.types';
import { CurrentUser, Roles } from '../common/decorators';
import { latLng } from '../common/util';
import { Z } from '../common/zod.pipe';
import { MatchingService } from '../matching/matching.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmploymentBody, RatesBody, SearchQuery, WorkerProfilePatch, WorkersService } from './workers.service';

const AvailabilityBody = z.object({ availability: z.nativeEnum(Availability) });
const DocBody = z.object({ type: z.nativeEnum(DocType), fileId: z.string().min(1) });
const BlockedBody = z.object({ dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(120) });
const FromQuery = z.object({ lat: z.coerce.number().pipe(latLng.lat).optional(), lng: z.coerce.number().pipe(latLng.lng).optional() });

/** The worker's own registration and profile. Every save is kept, even when incomplete. */
@Roles('WORKER')
@Controller('worker/me')
class WorkerSelfController {
  constructor(
    private readonly workers: WorkersService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  get(@CurrentUser() me: AuthUser) {
    return this.workers.getOwn(me.id);
  }

  @Patch()
  update(@CurrentUser() me: AuthUser, @Body(Z(WorkerProfilePatch)) b: z.infer<typeof WorkerProfilePatch>) {
    return this.workers.update(me.id, b, me);
  }

  @Put('rates')
  rates(@CurrentUser() me: AuthUser, @Body(Z(RatesBody)) b: z.infer<typeof RatesBody>) {
    return this.workers.setRates(me.id, b, me);
  }

  @Put('employment')
  employment(@CurrentUser() me: AuthUser, @Body(Z(EmploymentBody)) b: z.infer<typeof EmploymentBody>) {
    return this.workers.setEmployment(me.id, b);
  }

  @Put('blocked-dates')
  blocked(@CurrentUser() me: AuthUser, @Body(Z(BlockedBody)) b: z.infer<typeof BlockedBody>) {
    return this.workers.setBlockedDates(me.id, b.dates);
  }

  @Post('availability')
  @HttpCode(200)
  availability(@CurrentUser() me: AuthUser, @Body(Z(AvailabilityBody)) b: z.infer<typeof AvailabilityBody>) {
    return this.workers.setAvailability(me.id, b.availability);
  }

  @Post('documents')
  addDoc(@CurrentUser() me: AuthUser, @Body(Z(DocBody)) b: z.infer<typeof DocBody>) {
    return this.workers.addDocument(me.id, b.type, b.fileId);
  }

  @Delete('documents/:id')
  @HttpCode(200)
  removeDoc(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.workers.removeDocument(me.id, id);
  }

  @Post('submit')
  @HttpCode(200)
  submit(@CurrentUser() me: AuthUser) {
    return this.workers.submit(me.id);
  }

  @Get('reviews')
  async reviews(@CurrentUser() me: AuthUser) {
    const [items, w] = await Promise.all([
      this.prisma.review.findMany({ where: { targetId: me.id, hidden: false }, orderBy: { createdAt: 'desc' }, take: 50 }),
      this.prisma.workerProfile.findUniqueOrThrow({ where: { userId: me.id } }),
    ]);
    const dist = [5, 4, 3, 2, 1].map((s) => ({ stars: s, count: items.filter((r) => r.stars === s).length }));
    return { ratingAvg: Math.round(w.ratingAvg * 10) / 10, ratingCount: w.ratingCount, jobsDone: w.jobsDone, warnings: w.warnings, distribution: dist, items };
  }
}

/** Client-facing discovery. Everything here requires the active ₹9 access (enforced in the service). */
@Roles('CLIENT', 'ADMIN', 'SUBADMIN')
@Controller('workers')
class WorkersPublicController {
  constructor(private readonly workers: WorkersService) {}

  @Get('search')
  search(@CurrentUser() me: AuthUser, @Query(Z(SearchQuery)) q: z.infer<typeof SearchQuery>) {
    return this.workers.search(me, q);
  }

  @Get(':id')
  profile(@CurrentUser() me: AuthUser, @Param('id') id: string, @Query(Z(FromQuery)) q: z.infer<typeof FromQuery>) {
    return this.workers.publicProfile(me, id, q.lat != null && q.lng != null ? { lat: q.lat, lng: q.lng } : undefined);
  }
}

@Module({
  controllers: [WorkerSelfController, WorkersPublicController],
  providers: [WorkersService, MatchingService],
  exports: [WorkersService, MatchingService],
})
export class WorkersModule {}
