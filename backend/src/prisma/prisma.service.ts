import { Global, Injectable, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

/** Connection-level failures (server closed the connection, pool timeout, cannot reach DB). Safe to retry once. */
const TRANSIENT = new Set(['P1001', 'P1002', 'P1017', 'P2024']);

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}

/**
 * Same client with one automatic retry when the database connection drops before a query ran
 * (managed Postgres may close idle connections). Queries inside interactive transactions are not retried;
 * the whole transaction fails cleanly instead.
 */
function createPrisma(): PrismaService {
  const log = new Logger('Prisma');
  const base = new PrismaService();
  return base.$extends({
    query: {
      async $allOperations({ args, query, operation, model }) {
        try {
          return await query(args);
        } catch (e) {
          if (e instanceof Prisma.PrismaClientKnownRequestError && TRANSIENT.has(e.code)) {
            log.warn(`Retrying ${model ?? ''}.${operation} after ${e.code}`);
            await new Promise((r) => setTimeout(r, 250));
            return query(args);
          }
          throw e;
        }
      },
    },
  }) as unknown as PrismaService;
}

@Global()
@Module({ providers: [{ provide: PrismaService, useFactory: createPrisma }], exports: [PrismaService] })
export class PrismaModule {}
