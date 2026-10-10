import { BadRequestException, Body, Controller, Get, Injectable, NotFoundException, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { AuthUser } from '../common/auth.types';
import { CurrentUser, Roles } from '../common/decorators';
import { Z } from '../common/zod.pipe';
import { FilesService } from '../files/files.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

export const COMPLAINT_REASONS = [
  'WORKER_DID_NOT_ARRIVE',
  'ACCEPTED_BUT_CANCELLED',
  'PAYMENT_DISPUTE',
  'OVERCHARGING',
  'MISLEADING_PRICE',
  'POOR_SERVICE',
  'FAKE_PROFILE',
  'FAKE_DOCUMENTS',
  'MISCONDUCT',
  'FRAUD',
  'UNSAFE',
  'ILLEGAL_SERVICE',
  'CLIENT_DID_NOT_PAY',
  'OTHER',
] as const;

const HIGH = new Set(['MISCONDUCT', 'FRAUD', 'UNSAFE', 'ILLEGAL_SERVICE', 'WORKER_DID_NOT_ARRIVE']);

export const CreateComplaint = z.object({
  bookingId: z.string().optional(),
  againstId: z.string().optional(),
  reason: z.enum(COMPLAINT_REASONS),
  amountPaise: z.number().int().min(0).max(100_000_000).optional(),
  paidVia: z.enum(['UPI', 'CASH', 'CARD', 'BANK', 'OTHER']).optional(),
  description: z.string().trim().min(10, 'Tell us a little more (at least 10 characters)').max(2000),
  evidenceFileIds: z.array(z.string()).max(8).default([]),
});

@Injectable()
export class ComplaintsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(me: AuthUser, b: z.infer<typeof CreateComplaint>) {
    await this.files.ownedBy(me.id, b.evidenceFileIds, ['EVIDENCE']);
    let againstId = b.againstId ?? null;
    if (b.bookingId) {
      const booking = await this.prisma.booking.findUnique({ where: { id: b.bookingId } });
      if (!booking || (booking.clientId !== me.id && booking.workerId !== me.id)) throw new NotFoundException('Booking not found');
      againstId = booking.clientId === me.id ? booking.workerId : booking.clientId;
      if (['ACCEPTED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED'].includes(booking.status)) {
        await this.prisma.booking.update({ where: { id: booking.id }, data: { status: 'DISPUTED' } });
        await this.prisma.statusHistory.create({ data: { bookingId: booking.id, from: booking.status, to: 'DISPUTED', actorId: me.id, note: `Complaint: ${b.reason}` } });
      }
    } else if (!againstId && b.reason !== 'OTHER') {
      throw new BadRequestException('Choose the booking this is about');
    }
    const c = await this.prisma.complaint.create({
      data: {
        reporterId: me.id, reporterRole: me.role, againstId, bookingId: b.bookingId ?? null, reason: b.reason,
        amountPaise: b.amountPaise, paidVia: b.paidVia, description: b.description, evidenceFileIds: b.evidenceFileIds,
        priority: HIGH.has(b.reason) ? 'HIGH' : 'MEDIUM',
      },
    });
    await this.notifications.notify({ userId: me.id, type: 'COMPLAINT_CREATED', title: `Report #C-${c.number} received`, body: 'Our team will review it and update you here.', link: me.role === 'WORKER' ? '/worker/reviews' : '/client/report' });
    return c;
  }

  mine(me: AuthUser) {
    return this.prisma.complaint.findMany({ where: { reporterId: me.id }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, number: true, reason: true, status: true, resolution: true, createdAt: true, bookingId: true } });
  }
}

@Roles('CLIENT', 'WORKER')
@Controller('complaints')
export class ComplaintsController {
  constructor(private readonly complaints: ComplaintsService) {}

  @Post()
  create(@CurrentUser() me: AuthUser, @Body(Z(CreateComplaint)) b: z.infer<typeof CreateComplaint>) {
    return this.complaints.create(me, b);
  }

  @Get()
  mine(@CurrentUser() me: AuthUser) {
    return this.complaints.mine(me);
  }

  @Get('reasons')
  reasons() {
    return COMPLAINT_REASONS;
  }

  @Get(':id')
  async one(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    const all = await this.complaints.mine(me);
    const c = all.find((x) => x.id === id);
    if (!c) throw new NotFoundException('Report not found');
    return c;
  }
}
