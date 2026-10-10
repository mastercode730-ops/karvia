import { Controller, Get, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { AuditModule } from './common/audit.service';
import { AuthGuard } from './common/auth.guard';
import { Public } from './common/decorators';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { FilesModule } from './files/files.controller';
import { GeoModule } from './geo/geo.module';
import { MarketplaceModule } from './marketplace/marketplace.module';
import { NotificationsModule } from './notifications/notifications.service';
import { PaymentsModule } from './payments/payments.module';
import { PrismaModule } from './prisma/prisma.service';
import { RealtimeModule } from './realtime/realtime.gateway';
import { SettingsModule } from './settings/settings.service';
import { SmsModule } from './sms/sms.service';
import { RemindersService } from './subscriptions/reminders.service';
import { SubscriptionsModule } from './subscriptions/subscriptions.service';
import { UsersModule } from './users/users.module';
import { WorkersModule } from './workers/workers.module';

@Controller('health')
class HealthController {
  @Public()
  @Get()
  health() {
    return { ok: true, service: 'karvia-api', time: new Date().toISOString() };
  }
}

@Module({
  imports: [
    ScheduleModule.forRoot(),
    // Per-IP rate limits. Automated tests run from one IP, so they skip this (the OTP limits still apply).
    ThrottlerModule.forRoot({ throttlers: [{ name: 'default', ttl: 60_000, limit: 120 }], skipIf: () => process.env.NODE_ENV === 'test' }),
    PrismaModule,
    AuditModule,
    SettingsModule,
    SmsModule,
    RealtimeModule,
    NotificationsModule,
    SubscriptionsModule,
    FilesModule,
    AuthModule,
    UsersModule,
    CatalogModule,
    WorkersModule,
    PaymentsModule,
    MarketplaceModule,
    AdminModule,
    GeoModule,
  ],
  controllers: [HealthController],
  providers: [
    RemindersService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
