import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser, Permission } from './auth.types';

export const IS_PUBLIC = 'isPublic';
export const ROLES = 'roles';
export const PERMS = 'perms';
export const ALLOW_MFA_PENDING = 'allowMfaPending';

/** Staff route reachable before 2FA is enabled (only the 2FA setup and "me" routes). */
export const AllowMfaPending = () => SetMetadata(ALLOW_MFA_PENDING, true);

/** Route needs no login. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Session must be opened for one of these roles. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);
/** Staff session must hold every listed permission (ADMIN passes all). */
export const RequirePerms = (...perms: Permission[]) => SetMetadata(PERMS, perms);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});

export const ClientIp = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest();
  return req.ip || req.socket?.remoteAddress || '';
});
