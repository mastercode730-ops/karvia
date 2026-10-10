import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Role, User } from '@prisma/client';
import { randomInt } from 'crypto';
import * as jwt from 'jsonwebtoken';
import { authenticator } from 'otplib';
import { AuditService } from '../common/audit.service';
import { AuthUser, STAFF_ROLES } from '../common/auth.types';
import { addMinutes, decrypt, encrypt, hmac, randomToken, safeEqual, sha256 } from '../common/util';
import { devProvidersAllowed, env, isProd } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../sms/sms.service';

// Accept the previous/next 30-second authenticator code to tolerate clock drift and slow networks.
authenticator.options = { window: 1 };

const OTP_TTL_MIN = 5;
const OTP_MAX_ATTEMPTS = 5;
const OTP_PER_PHONE_PER_HOUR = 5;
/** Per-IP OTP cap (shared office Wi-Fi and the test suite may need more). */
const OTP_PER_IP_PER_HOUR = Number(process.env.OTP_PER_IP_PER_HOUR ?? 30);
const OTP_RESEND_SEC = 30;
const ACCESS_TTL_SEC = 15 * 60;
const REFRESH_TTL_MS: Record<'public' | 'staff', number> = { public: 30 * 86400000, staff: 12 * 3600000 };

export interface SessionMeta {
  ip?: string;
  userAgent?: string;
}

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: ReturnType<AuthService['publicUser']>;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
    private readonly audit: AuditService,
  ) {}

  private otpHash(phone: string, code: string) {
    return hmac(env().OTP_PEPPER, `${phone}:${code}`);
  }

  async requestOtp(phone: string, ip: string) {
    const hourAgo = new Date(Date.now() - 3600000);
    const [byPhone, byIp, last] = await Promise.all([
      this.prisma.otpCode.count({ where: { phone, createdAt: { gte: hourAgo } } }),
      this.prisma.otpCode.count({ where: { ip, createdAt: { gte: hourAgo } } }),
      this.prisma.otpCode.findFirst({ where: { phone }, orderBy: { createdAt: 'desc' } }),
    ]);
    if (byPhone >= OTP_PER_PHONE_PER_HOUR || byIp >= OTP_PER_IP_PER_HOUR) {
      throw new HttpException('Too many OTP requests. Please try again after an hour.', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (last && Date.now() - last.createdAt.getTime() < OTP_RESEND_SEC * 1000) {
      const wait = Math.ceil((OTP_RESEND_SEC * 1000 - (Date.now() - last.createdAt.getTime())) / 1000);
      throw new HttpException(`Please wait ${wait} seconds before requesting a new OTP.`, HttpStatus.TOO_MANY_REQUESTS);
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.prisma.$transaction([
      this.prisma.otpCode.updateMany({ where: { phone, consumedAt: null }, data: { consumedAt: new Date() } }),
      this.prisma.otpCode.create({
        data: { phone, ip, codeHash: this.otpHash(phone, code), expiresAt: addMinutes(new Date(), OTP_TTL_MIN) },
      }),
    ]);
    await this.sms.sendOtp(phone, code);
    const echo = env().OTP_DEV_ECHO && devProvidersAllowed();
    return { sent: true, resendAfterSec: OTP_RESEND_SEC, expiresInSec: OTP_TTL_MIN * 60, ...(echo ? { devCode: code } : {}) };
  }

  private async consumeOtp(phone: string, code: string) {
    const otp = await this.prisma.otpCode.findFirst({
      where: { phone, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp) throw new BadRequestException('OTP expired. Please request a new one.');
    if (otp.attempts >= OTP_MAX_ATTEMPTS) {
      await this.prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
      throw new HttpException('Too many wrong attempts. Please request a new OTP.', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (!safeEqual(otp.codeHash, this.otpHash(phone, code))) {
      const updated = await this.prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      const left = OTP_MAX_ATTEMPTS - updated.attempts;
      throw new BadRequestException(left > 0 ? `Wrong OTP. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Wrong OTP. Please request a new one.');
    }
    await this.prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
  }

  /** Verifies the OTP and opens a session for the chosen role. Clients and workers self-register; staff must already exist. */
  async verifyOtp(
    input: { phone: string; code: string; role: Role; name?: string },
    meta: SessionMeta,
  ): Promise<IssuedSession | { mfaRequired: true; mfaToken: string }> {
    await this.consumeOtp(input.phone, input.code);
    const isStaff = STAFF_ROLES.includes(input.role);
    let user = await this.prisma.user.findUnique({ where: { phone: input.phone } });

    if (isStaff) {
      if (!user || !user.roles.includes(input.role)) throw new ForbiddenException('No staff account exists for this number');
    } else {
      user = await this.ensurePublicUser(input.phone, input.role, input.name);
    }
    if (user.status === 'BLOCKED' || user.status === 'SUSPENDED') {
      throw new ForbiddenException('Your account is suspended. Contact Karvia support.');
    }
    if (isStaff && user.totpEnabled) {
      const mfaToken = jwt.sign({ sub: user.id, role: input.role, purpose: 'mfa' }, env().JWT_SECRET, {
        algorithm: 'HS256',
        expiresIn: 300,
        issuer: 'karvia',
        audience: 'karvia-mfa',
      });
      return { mfaRequired: true, mfaToken };
    }
    return this.issueSession(user, input.role, meta);
  }

  private async ensurePublicUser(phone: string, role: Role, name?: string): Promise<User> {
    return this.prisma.$transaction(async (tx) => {
      let user = await tx.user.findUnique({ where: { phone } });
      if (!user) {
        user = await tx.user.create({ data: { phone, name: name?.trim() || null, roles: [role] } });
      } else if (!user.roles.includes(role)) {
        user = await tx.user.update({ where: { id: user.id }, data: { roles: { push: role }, name: user.name ?? name ?? null } });
      }
      if (role === 'CLIENT') {
        await tx.clientProfile.upsert({ where: { userId: user.id }, create: { userId: user.id }, update: {} });
      }
      if (role === 'WORKER') {
        const existing = await tx.workerProfile.findUnique({ where: { userId: user.id } });
        if (!existing) {
          await tx.workerProfile.create({ data: { userId: user.id } });
          // Every new worker starts as a lead so telecallers can help finish the profile.
          await tx.lead.upsert({
            where: { workerId: user.id },
            create: { workerId: user.id, phone, name: user.name, source: 'INCOMPLETE_REGISTRATION' },
            update: {},
          });
        }
      }
      return user;
    });
  }

  async verifyMfa(mfaToken: string, code: string, meta: SessionMeta): Promise<IssuedSession> {
    let claims: { sub: string; role: Role; purpose: string };
    try {
      claims = jwt.verify(mfaToken, env().JWT_SECRET, { algorithms: ['HS256'], issuer: 'karvia', audience: 'karvia-mfa' }) as any;
    } catch {
      throw new UnauthorizedException('Login step expired. Please start again.');
    }
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: claims.sub } });
    if (!user.totpSecret || !authenticator.check(code, decrypt(user.totpSecret))) {
      await this.audit.log({ id: user.id, role: claims.role }, { action: 'auth.mfa_failed', entityType: 'User', entityId: user.id, ip: meta.ip });
      throw new UnauthorizedException('Wrong authenticator code');
    }
    return this.issueSession(user, claims.role, meta);
  }

  async issueSession(user: User, role: Role, meta: SessionMeta): Promise<IssuedSession> {
    const refreshToken = randomToken(48);
    const refreshExpiresAt = new Date(Date.now() + REFRESH_TTL_MS[STAFF_ROLES.includes(role) ? 'staff' : 'public']);
    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        activeRole: role,
        refreshHash: sha256(refreshToken),
        expiresAt: refreshExpiresAt,
        ip: meta.ip,
        userAgent: meta.userAgent?.slice(0, 300),
      },
    });
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    if (STAFF_ROLES.includes(role)) {
      await this.audit.log({ id: user.id, role }, { action: 'auth.staff_login', entityType: 'User', entityId: user.id, ip: meta.ip });
    }
    return { accessToken: this.signAccess(user.id, session.id, role), refreshToken, refreshExpiresAt, user: this.publicUser(user, role) };
  }

  private signAccess(userId: string, sessionId: string, role: Role) {
    return jwt.sign({ sub: userId, sid: sessionId, role }, env().JWT_SECRET, {
      algorithm: 'HS256',
      expiresIn: ACCESS_TTL_SEC,
      issuer: 'karvia',
      audience: 'karvia-api',
    });
  }

  /** Rotates the refresh token. Reusing an old token revokes every session of that user (token theft signal). */
  async refresh(refreshToken: string, meta: SessionMeta): Promise<IssuedSession> {
    const session = await this.prisma.session.findUnique({ where: { refreshHash: sha256(refreshToken) }, include: { user: true } });
    if (!session) throw new UnauthorizedException('Please log in again');
    if (session.revokedAt) {
      await this.prisma.session.updateMany({ where: { userId: session.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.log(null, { action: 'auth.refresh_reuse_detected', entityType: 'User', entityId: session.userId, ip: meta.ip });
      throw new UnauthorizedException('Please log in again');
    }
    if (session.expiresAt < new Date()) throw new UnauthorizedException('Please log in again');
    const u = session.user;
    if (u.status === 'BLOCKED' || u.status === 'SUSPENDED' || !u.roles.includes(session.activeRole)) {
      throw new UnauthorizedException('Please log in again');
    }

    const next = randomToken(48);
    const created = await this.prisma.$transaction(async (tx) => {
      const s = await tx.session.create({
        data: {
          userId: u.id,
          activeRole: session.activeRole,
          refreshHash: sha256(next),
          expiresAt: session.expiresAt, // rotation never extends the absolute lifetime
          ip: meta.ip,
          userAgent: meta.userAgent?.slice(0, 300),
        },
      });
      await tx.session.update({ where: { id: session.id }, data: { revokedAt: new Date(), replacedBy: s.id } });
      return s;
    });
    return {
      accessToken: this.signAccess(u.id, created.id, session.activeRole),
      refreshToken: next,
      refreshExpiresAt: created.expiresAt,
      user: this.publicUser(u, session.activeRole),
    };
  }

  async logout(refreshToken: string | undefined, sessionId?: string) {
    if (refreshToken) {
      await this.prisma.session.updateMany({ where: { refreshHash: sha256(refreshToken), revokedAt: null }, data: { revokedAt: new Date() } });
    }
    if (sessionId) await this.prisma.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async mfaSetup(me: AuthUser) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: me.id } });
    if (user.totpEnabled) throw new BadRequestException('Two-factor authentication is already on');
    const secret = authenticator.generateSecret();
    await this.prisma.user.update({ where: { id: me.id }, data: { totpSecret: encrypt(secret) } });
    return { secret, otpauthUrl: authenticator.keyuri(user.phone, 'Karvia Admin', secret) };
  }

  async mfaEnable(me: AuthUser, code: string, ip: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: me.id } });
    if (!user.totpSecret) throw new BadRequestException('Start setup first');
    if (!authenticator.check(code, decrypt(user.totpSecret))) throw new BadRequestException('Wrong authenticator code');
    await this.prisma.user.update({ where: { id: me.id }, data: { totpEnabled: true } });
    await this.audit.log(me, { action: 'auth.mfa_enabled', entityType: 'User', entityId: me.id, ip });
    return { enabled: true };
  }

  publicUser(u: User, role: Role) {
    return {
      id: u.id,
      phone: u.phone,
      name: u.name,
      email: u.email,
      roles: u.roles,
      activeRole: role,
      status: u.status,
      mfaEnabled: u.totpEnabled,
      termsAccepted: !!u.termsAcceptedAt,
      marketingConsent: u.marketingConsent,
      language: u.language,
    };
  }
}
