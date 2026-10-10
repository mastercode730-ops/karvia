import { Body, Controller, Delete, Get, HttpCode, Injectable, Module, NotFoundException, OnModuleInit, Param, Post, Query } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { FavouriteKind } from '@prisma/client';
import { z } from 'zod';
import { BookingsService, CancelBody, ChargeBody, ReviewBody } from '../bookings/bookings.service';
import { AuthUser } from '../common/auth.types';
import { CurrentUser, Roles } from '../common/decorators';
import { Z } from '../common/zod.pipe';
import { env } from '../config/env';
import { FilesService } from '../files/files.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRequest, QuoteBody, RequestsService } from '../requests/requests.service';
import { WorkersModule } from '../workers/workers.module';
import { ComplaintsController, ComplaintsService } from '../complaints/complaints.service';

const Scope = z.object({ scope: z.enum(['open', 'all']).default('all') });
const Tab = z.object({ tab: z.enum(['all', 'upcoming', 'active', 'completed', 'cancelled', 'disputed']).default('all') });
const Answer = z.object({ approve: z.boolean() });
const FavKind = z.object({ kind: z.nativeEnum(FavouriteKind).default('FAVOURITE') });

@Roles('CLIENT')
@Controller('requests')
class ClientRequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Post()
  create(@CurrentUser() me: AuthUser, @Body(Z(CreateRequest)) b: z.infer<typeof CreateRequest>) {
    return this.requests.create(me, b);
  }

  @Get()
  list(@CurrentUser() me: AuthUser, @Query(Z(Scope)) q: z.infer<typeof Scope>) {
    return this.requests.listForClient(me, q.scope);
  }

  @Get(':id')
  get(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.requests.getForClient(me, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body(Z(CancelBody)) b: z.infer<typeof CancelBody>) {
    return this.requests.cancelByClient(me, id, b.reason);
  }

  @Post(':id/retry')
  @HttpCode(200)
  retry(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.requests.retry(me, id);
  }

  @Post('quotes/:quoteId/accept')
  @HttpCode(200)
  acceptQuote(@CurrentUser() me: AuthUser, @Param('quoteId') id: string) {
    return this.requests.acceptQuote(me, id);
  }

  @Post('quotes/:quoteId/reject')
  @HttpCode(200)
  rejectQuote(@CurrentUser() me: AuthUser, @Param('quoteId') id: string) {
    return this.requests.rejectQuote(me, id);
  }
}

@Roles('WORKER')
@Controller('worker/offers')
class WorkerOffersController {
  constructor(private readonly requests: RequestsService) {}

  @Get()
  list(@CurrentUser() me: AuthUser) {
    return this.requests.offersForWorker(me);
  }

  @Get(':requestId/media')
  media(@CurrentUser() me: AuthUser, @Param('requestId') id: string) {
    return this.requests.mediaForWorker(me, id);
  }

  @Post(':requestId/accept')
  @HttpCode(200)
  accept(@CurrentUser() me: AuthUser, @Param('requestId') id: string) {
    return this.requests.accept(me, id);
  }

  @Post(':requestId/reject')
  @HttpCode(200)
  reject(@CurrentUser() me: AuthUser, @Param('requestId') id: string) {
    return this.requests.reject(me, id);
  }

  @Post(':requestId/quote')
  quote(@CurrentUser() me: AuthUser, @Param('requestId') id: string, @Body(Z(QuoteBody)) b: z.infer<typeof QuoteBody>) {
    return this.requests.submitQuote(me, id, b);
  }

  @Post('quotes/:quoteId/withdraw')
  @HttpCode(200)
  withdraw(@CurrentUser() me: AuthUser, @Param('quoteId') id: string) {
    return this.requests.withdrawQuote(me, id);
  }
}

@Roles('CLIENT', 'WORKER')
@Controller('bookings')
class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get()
  list(@CurrentUser() me: AuthUser, @Query(Z(Tab)) q: z.infer<typeof Tab>) {
    return this.bookings.list(me, q.tab);
  }

  @Get(':id')
  get(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.bookings.detail(me, id);
  }

  @Roles('CLIENT')
  @Post(':id/confirm')
  @HttpCode(200)
  confirm(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.bookings.confirm(me, id);
  }

  @Roles('WORKER')
  @Post(':id/start')
  @HttpCode(200)
  start(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.bookings.start(me, id);
  }

  @Roles('WORKER')
  @Post(':id/complete')
  @HttpCode(200)
  complete(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.bookings.complete(me, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body(Z(CancelBody)) b: z.infer<typeof CancelBody>) {
    return this.bookings.cancel(me, id, b.reason);
  }

  @Roles('WORKER')
  @Post(':id/charges')
  addCharge(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body(Z(ChargeBody)) b: z.infer<typeof ChargeBody>) {
    return this.bookings.addCharge(me, id, b);
  }

  @Roles('CLIENT')
  @Post(':id/charges/:chargeId/answer')
  @HttpCode(200)
  answer(@CurrentUser() me: AuthUser, @Param('id') id: string, @Param('chargeId') cid: string, @Body(Z(Answer)) b: z.infer<typeof Answer>) {
    return this.bookings.answerCharge(me, id, cid, b.approve);
  }

  @Post(':id/review')
  review(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body(Z(ReviewBody)) b: z.infer<typeof ReviewBody>) {
    return this.bookings.review(me, id, b);
  }
}

@Roles('CLIENT')
@Controller('favourites')
class FavouritesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: BookingsService,
    private readonly files: FilesService,
  ) {}

  @Get()
  async list(@CurrentUser() me: AuthUser) {
    const [favs, previous] = await Promise.all([this.prisma.favourite.findMany({ where: { clientId: me.id } }), this.bookings.previousWorkers(me)]);
    const ids = [...new Set([...favs.map((f) => f.workerId), ...previous.map((p) => p.workerId)])];
    const ws = await this.prisma.workerProfile.findMany({ where: { userId: { in: ids } }, include: { user: { select: { name: true, status: true } }, services: { include: { service: true } } } });
    const card = (id: string) => {
      const w = ws.find((x) => x.userId === id);
      if (!w) return null;
      const prev = previous.find((p) => p.workerId === id);
      return {
        id, name: w.user.name, photoUrl: w.photoFileId ? this.files.sign(w.photoFileId) : null,
        services: w.services.map((s) => s.service.name), ratingAvg: Math.round(w.ratingAvg * 10) / 10,
        availability: w.availability, available: w.verificationStatus === 'VERIFIED' && w.availability === 'AVAILABLE' && w.user.status !== 'SUSPENDED' && w.user.status !== 'BLOCKED',
        timesHired: prev?.times ?? 0, lastHiredAt: prev?.lastHiredAt ?? null,
      };
    };
    return {
      favourites: favs.filter((f) => f.kind === 'FAVOURITE').map((f) => card(f.workerId)).filter(Boolean),
      following: favs.filter((f) => f.kind === 'FOLLOW').map((f) => card(f.workerId)).filter(Boolean),
      previous: previous.map((p) => card(p.workerId)).filter(Boolean),
    };
  }

  @Post(':workerId')
  @HttpCode(200)
  async add(@CurrentUser() me: AuthUser, @Param('workerId') workerId: string, @Body(Z(FavKind)) b: z.infer<typeof FavKind>) {
    const w = await this.prisma.workerProfile.findUnique({ where: { userId: workerId } });
    if (!w || w.verificationStatus !== 'VERIFIED') throw new NotFoundException('Worker not found');
    await this.prisma.favourite.upsert({
      where: { clientId_workerId_kind: { clientId: me.id, workerId, kind: b.kind } },
      create: { clientId: me.id, workerId, kind: b.kind },
      update: {},
    });
    return { ok: true };
  }

  @Delete(':workerId')
  @HttpCode(200)
  async remove(@CurrentUser() me: AuthUser, @Param('workerId') workerId: string, @Query(Z(FavKind)) q: z.infer<typeof FavKind>) {
    await this.prisma.favourite.deleteMany({ where: { clientId: me.id, workerId, kind: q.kind } });
    return { ok: true };
  }
}

/** Runs the 60-second timers. Every step is idempotent, so running two API instances is safe. */
@Injectable()
export class MatchingScheduler implements OnModuleInit {
  private running = false;
  private enabled = true;
  constructor(private readonly requests: RequestsService) {}
  onModuleInit() {
    this.enabled = env().NODE_ENV !== 'test';
  }
  @Interval(5000)
  async run() {
    if (!this.enabled || this.running) return;
    this.running = true;
    try {
      await this.requests.tick();
    } finally {
      this.running = false;
    }
  }
}

@Module({
  imports: [WorkersModule],
  controllers: [ClientRequestsController, WorkerOffersController, BookingsController, FavouritesController, ComplaintsController],
  providers: [RequestsService, BookingsService, ComplaintsService, MatchingScheduler],
  exports: [RequestsService, BookingsService, ComplaintsService],
})
export class MarketplaceModule {}
