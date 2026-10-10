import { Global, Injectable, Module } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from './auth.types';

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  ip?: string | null;
}

/** Append-only audit trail. There is deliberately no update or delete method. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(actor: Pick<AuthUser, 'id' | 'role'> | null, e: AuditEntry, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma;
    await db.auditLog.create({
      data: {
        actorId: actor?.id ?? null,
        actorRole: actor?.role ?? 'SYSTEM',
        action: e.action,
        entityType: e.entityType,
        entityId: e.entityId ?? null,
        before: (e.before ?? undefined) as Prisma.InputJsonValue | undefined,
        after: (e.after ?? undefined) as Prisma.InputJsonValue | undefined,
        reason: e.reason ?? null,
        ip: e.ip ?? null,
      },
    });
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
