import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import * as jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, Permission, PERMISSIONS, STAFF_ROLES, TELECALLER_PERMISSIONS } from './auth.types';
import { ALLOW_MFA_PENDING, IS_PUBLIC, PERMS, ROLES } from './decorators';

export interface AccessClaims {
  sub: string;
  sid: string;
  role: Role;
}

export function verifyAccessToken(token: string): AccessClaims {
  return jwt.verify(token, env().JWT_SECRET, {
    algorithms: ['HS256'],
    issuer: 'karvia',
    audience: 'karvia-api',
  }) as AccessClaims;
}

/** Loads the session behind a token. Rejects revoked/expired sessions and blocked or suspended users. */
export async function resolveAuthUser(prisma: PrismaService, claims: AccessClaims): Promise<AuthUser> {
  const session = await prisma.session.findUnique({
    where: { id: claims.sid },
    include: { user: { include: { staffRole: true } } },
  });
  if (!session || session.revokedAt || session.expiresAt < new Date() || session.userId !== claims.sub) {
    throw new UnauthorizedException('Your session has ended. Please log in again.');
  }
  const u = session.user;
  if (u.status === 'BLOCKED' || u.status === 'SUSPENDED') {
    throw new ForbiddenException('Your account is suspended. Contact Karvia support.');
  }
  if (!u.roles.includes(session.activeRole)) throw new UnauthorizedException('Role no longer available');

  let permissions: Permission[] = [];
  if (session.activeRole === 'ADMIN') permissions = [...PERMISSIONS];
  else if (session.activeRole === 'SUBADMIN') permissions = (u.staffRole?.permissions ?? []) as Permission[];
  else if (session.activeRole === 'TELECALLER') permissions = TELECALLER_PERMISSIONS;

  const mfaPending = STAFF_ROLES.includes(session.activeRole) && !u.totpEnabled;
  return { id: u.id, role: session.activeRole, roles: u.roles, sessionId: session.id, permissions, mfaPending };
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('Please log in');

    let claims: AccessClaims;
    try {
      claims = verifyAccessToken(header.slice(7));
    } catch {
      throw new UnauthorizedException('Your session has expired');
    }
    const user = await resolveAuthUser(this.prisma, claims);
    req.user = user;

    if (user.mfaPending && !this.reflector.getAllAndOverride<boolean>(ALLOW_MFA_PENDING, targets)) {
      throw new ForbiddenException({ message: 'Turn on two-factor authentication to continue', code: 'MFA_SETUP_REQUIRED' });
    }

    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES, targets);
    if (roles?.length && !roles.includes(user.role)) throw new ForbiddenException('Not allowed for your account type');

    const perms = this.reflector.getAllAndOverride<Permission[]>(PERMS, targets);
    if (perms?.length && !perms.every((p) => user.permissions.includes(p))) {
      throw new ForbiddenException('You do not have permission for this action');
    }
    return true;
  }
}
