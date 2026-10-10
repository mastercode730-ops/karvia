import { Body, Controller, Delete, Get, HttpCode, Module, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { AuthUser } from '../common/auth.types';
import { CurrentUser, Roles } from '../common/decorators';
import { latLng } from '../common/util';
import { Z } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

const UpdateMe = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  email: z.string().trim().email().max(120).nullable().optional(),
  language: z.enum(['en', 'hi']).optional(),
  marketingConsent: z.boolean().optional(),
  acceptTerms: z.literal(true).optional(),
});

const ClientLocation = z.object({
  area: z.string().trim().min(2).max(120),
  pincode: z.string().regex(/^\d{6}$/, 'Enter a 6-digit pincode').optional(),
  ...latLng,
});

const AddressBody = z.object({
  label: z.string().trim().min(1).max(40),
  line: z.string().trim().min(3).max(200),
  area: z.string().trim().max(120).optional(),
  pincode: z.string().regex(/^\d{6}$/).optional(),
  isDefault: z.boolean().optional(),
  ...latLng,
});

@Controller('me')
class MeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subs: SubscriptionsService,
  ) {}

  @Patch()
  async update(@CurrentUser() me: AuthUser, @Body(Z(UpdateMe)) b: z.infer<typeof UpdateMe>) {
    const u = await this.prisma.user.update({
      where: { id: me.id },
      data: {
        name: b.name,
        email: b.email,
        language: b.language,
        marketingConsent: b.marketingConsent,
        ...(b.acceptTerms ? { termsAcceptedAt: new Date() } : {}),
      },
      select: { id: true, name: true, email: true, language: true, marketingConsent: true, termsAcceptedAt: true },
    });
    if (b.name && me.roles.includes('WORKER')) await this.prisma.lead.updateMany({ where: { workerId: me.id }, data: { name: b.name } });
    return u;
  }

  @Get('subscription')
  subscription(@CurrentUser() me: AuthUser) {
    return this.subs.summary(me.id);
  }

  @Roles('CLIENT')
  @Get('client')
  async client(@CurrentUser() me: AuthUser) {
    const [profile, addresses, summary] = await Promise.all([
      this.prisma.clientProfile.findUnique({ where: { userId: me.id } }),
      this.prisma.address.findMany({ where: { userId: me.id }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] }),
      this.subs.summary(me.id),
    ]);
    return { profile, addresses, access: summary.clientAccess };
  }

  @Roles('CLIENT')
  @Patch('client/location')
  async location(@CurrentUser() me: AuthUser, @Body(Z(ClientLocation)) b: z.infer<typeof ClientLocation>) {
    return this.prisma.clientProfile.upsert({ where: { userId: me.id }, create: { userId: me.id, ...b }, update: b });
  }

  @Roles('CLIENT')
  @Post('addresses')
  async addAddress(@CurrentUser() me: AuthUser, @Body(Z(AddressBody)) b: z.infer<typeof AddressBody>) {
    const count = await this.prisma.address.count({ where: { userId: me.id } });
    if (count >= 10) throw new NotFoundException('You can save up to 10 addresses');
    return this.prisma.$transaction(async (tx) => {
      const makeDefault = b.isDefault || count === 0;
      if (makeDefault) await tx.address.updateMany({ where: { userId: me.id }, data: { isDefault: false } });
      return tx.address.create({ data: { ...b, isDefault: makeDefault, userId: me.id } });
    });
  }

  @Roles('CLIENT')
  @Patch('addresses/:id')
  async editAddress(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body(Z(AddressBody.partial())) b: Partial<z.infer<typeof AddressBody>>) {
    const a = await this.prisma.address.findFirst({ where: { id, userId: me.id } });
    if (!a) throw new NotFoundException('Address not found');
    return this.prisma.$transaction(async (tx) => {
      if (b.isDefault) await tx.address.updateMany({ where: { userId: me.id }, data: { isDefault: false } });
      return tx.address.update({ where: { id }, data: b });
    });
  }

  @Roles('CLIENT')
  @Delete('addresses/:id')
  @HttpCode(200)
  async deleteAddress(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    const r = await this.prisma.address.deleteMany({ where: { id, userId: me.id } });
    if (!r.count) throw new NotFoundException('Address not found');
    return { ok: true };
  }
}

@Module({ controllers: [MeController] })
export class UsersModule {}
