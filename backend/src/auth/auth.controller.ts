import { Body, Controller, ForbiddenException, Get, HttpCode, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { Request, Response } from 'express';
import { z } from 'zod';
import { AuthUser } from '../common/auth.types';
import { AllowMfaPending, ClientIp, CurrentUser, Public } from '../common/decorators';
import { phoneSchema } from '../common/util';
import { Z } from '../common/zod.pipe';
import { env, isProd } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService, IssuedSession } from './auth.service';

const REFRESH_COOKIE = 'krv_rt';
const COOKIE_PATH = '/api/auth';

const OtpRequest = z.object({ phone: phoneSchema });
const OtpVerify = z.object({
  phone: phoneSchema,
  code: z.string().regex(/^\d{6}$/, 'OTP is 6 digits'),
  role: z.nativeEnum(Role),
  name: z.string().trim().min(2).max(80).optional(),
});
const MfaVerify = z.object({ mfaToken: z.string().min(10), code: z.string().regex(/^\d{6}$/) });
const MfaCode = z.object({ code: z.string().regex(/^\d{6}$/) });

/** Cookie-carrying endpoints only accept requests from our own front-ends (CSRF defence on top of SameSite=Lax). */
function assertTrustedOrigin(req: Request) {
  const origin = req.headers.origin;
  if (!origin) return; // non-browser clients (mobile app, curl) send no Origin
  const allowed = env().CORS_ORIGINS.split(',').map((s) => s.trim());
  if (!allowed.includes(origin)) throw new ForbiddenException('Origin not allowed');
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  private meta(req: Request, ip: string) {
    return { ip, userAgent: req.headers['user-agent'] };
  }

  private send(res: Response, s: IssuedSession) {
    res.cookie(REFRESH_COOKIE, s.refreshToken, {
      httpOnly: true,
      secure: isProd(),
      sameSite: 'lax',
      path: COOKIE_PATH,
      expires: s.refreshExpiresAt,
    });
    // Mobile apps cannot use cookies; they receive the refresh token in the body only when asking for it.
    return { accessToken: s.accessToken, user: s.user };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('otp/request')
  @HttpCode(200)
  requestOtp(@Body(Z(OtpRequest)) body: z.infer<typeof OtpRequest>, @ClientIp() ip: string) {
    return this.auth.requestOtp(body.phone, ip);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('otp/verify')
  @HttpCode(200)
  async verifyOtp(
    @Body(Z(OtpVerify)) body: z.infer<typeof OtpVerify>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @ClientIp() ip: string,
  ) {
    const r = await this.auth.verifyOtp(body, this.meta(req, ip));
    if ('mfaRequired' in r) return r;
    return this.send(res, r);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('mfa/verify')
  @HttpCode(200)
  async verifyMfa(
    @Body(Z(MfaVerify)) body: z.infer<typeof MfaVerify>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @ClientIp() ip: string,
  ) {
    return this.send(res, await this.auth.verifyMfa(body.mfaToken, body.code, this.meta(req, ip)));
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response, @ClientIp() ip: string) {
    assertTrustedOrigin(req);
    const token = req.cookies?.[REFRESH_COOKIE] ?? (typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : undefined);
    if (!token) throw new UnauthorizedException('Please log in');
    return this.send(res, await this.auth.refresh(token, this.meta(req, ip)));
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    assertTrustedOrigin(req);
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH });
    return { ok: true };
  }

  @AllowMfaPending()
  @Get('me')
  async me(@CurrentUser() me: AuthUser) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: me.id } });
    return { ...this.auth.publicUser(u, me.role), permissions: me.permissions, mfaPending: me.mfaPending };
  }

  @AllowMfaPending()
  @Post('mfa/setup')
  @HttpCode(200)
  mfaSetup(@CurrentUser() me: AuthUser) {
    return this.auth.mfaSetup(me);
  }

  @AllowMfaPending()
  @Post('mfa/enable')
  @HttpCode(200)
  mfaEnable(@CurrentUser() me: AuthUser, @Body(Z(MfaCode)) body: z.infer<typeof MfaCode>, @ClientIp() ip: string) {
    return this.auth.mfaEnable(me, body.code, ip);
  }
}
