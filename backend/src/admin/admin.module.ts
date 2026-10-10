import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { MarketplaceModule } from '../marketplace/marketplace.module';
import { PaymentsModule } from '../payments/payments.module';
import { WorkersModule } from '../workers/workers.module';
import { AdminConfigController } from './admin-config.controller';
import { AdminOpsController } from './admin-ops.controller';
import { AdminWorkersController } from './admin-workers.controller';
import { LeadsController } from './leads.controller';

@Module({
  imports: [WorkersModule, MarketplaceModule, PaymentsModule, CatalogModule],
  controllers: [AdminWorkersController, AdminOpsController, AdminConfigController, LeadsController],
})
export class AdminModule {}
