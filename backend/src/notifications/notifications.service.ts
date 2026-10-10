import { Controller, Get, Global, HttpCode, Injectable, Module, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/decorators';
import { Z } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { SmsService } from '../sms/sms.service';

export interface NotifyInput {
  userId: string;
  type: string;
  title: string;
  body: string;
  link?: string;
  sms?: boolean;
  category?: 'TRANSACTIONAL' | 'MARKETING';
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly sms: SmsService,
  ) {}

  /** In-app notification is always stored; SMS only for important transactional events. */
  async notify(n: NotifyInput) {
    const row = await this.prisma.notification.create({
      data: { userId: n.userId, type: n.type, title: n.title, body: n.body, link: n.link, category: n.category ?? 'TRANSACTIONAL' },
    });
    this.realtime.emitToUser(n.userId, 'notification', row);
    if (n.sms) {
      const user = await this.prisma.user.findUnique({ where: { id: n.userId }, select: { phone: true, marketingConsent: true } });
      if (user && (n.category !== 'MARKETING' || user.marketingConsent)) {
        this.sms.send(user.phone, `Karvia: ${n.title}. ${n.body}`).catch(() => undefined);
      }
    }
    return row;
  }

  notifyMany(userIds: string[], n: Omit<NotifyInput, 'userId'>) {
    return Promise.all(userIds.map((userId) => this.notify({ ...n, userId })));
  }
}

const ListQuery = z.object({ unread: z.enum(['true', 'false']).optional(), cursor: z.string().optional() });

@Controller('notifications')
class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@CurrentUser() me: AuthUser, @Query(Z(ListQuery)) q: z.infer<typeof ListQuery>) {
    const items = await this.prisma.notification.findMany({
      where: { userId: me.id, ...(q.unread === 'true' ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 30,
      ...(q.cursor ? { skip: 1, cursor: { id: q.cursor } } : {}),
    });
    const unread = await this.prisma.notification.count({ where: { userId: me.id, readAt: null } });
    return { items, unread, nextCursor: items.length === 30 ? items[items.length - 1].id : null };
  }

  @Post(':id/read')
  @HttpCode(200)
  async read(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    await this.prisma.notification.updateMany({ where: { id, userId: me.id, readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  }

  @Post('read-all')
  @HttpCode(200)
  async readAll(@CurrentUser() me: AuthUser) {
    await this.prisma.notification.updateMany({ where: { userId: me.id, readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  }
}

@Global()
@Module({ controllers: [NotificationsController], providers: [NotificationsService], exports: [NotificationsService] })
export class NotificationsModule {}
