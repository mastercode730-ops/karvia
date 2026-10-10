import { Body, Controller, Get, Headers, HttpCode, Module, Param, Post, Req } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PaymentPurpose } from '@prisma/client';
import { Request } from 'express';
import { z } from 'zod';
import { AuthUser } from '../common/auth.types';
import { CurrentUser, Public, Roles } from '../common/decorators';
import { Z } from '../common/zod.pipe';
import { PaymentsService } from './payments.service';

const OrderBody = z.object({ purpose: z.nativeEnum(PaymentPurpose) });
const VerifyBody = z.object({ orderId: z.string(), paymentId: z.string(), signature: z.string() });
const MockBody = z.object({ outcome: z.enum(['success', 'failed']) });

@Controller('payments')
class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Roles('CLIENT', 'WORKER')
  @Get('quote/:purpose')
  quote(@Param('purpose') purpose: string) {
    return this.payments.quote(z.nativeEnum(PaymentPurpose).parse(purpose));
  }

  @Roles('CLIENT', 'WORKER')
  @Post('orders')
  create(@CurrentUser() me: AuthUser, @Body(Z(OrderBody)) b: z.infer<typeof OrderBody>) {
    return this.payments.createOrder(me, b.purpose);
  }

  @Roles('CLIENT', 'WORKER')
  @Get('mine')
  mine(@CurrentUser() me: AuthUser) {
    return this.payments.mine(me);
  }

  @Roles('CLIENT', 'WORKER')
  @Get(':id')
  status(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.payments.status(me, id);
  }

  @Roles('CLIENT', 'WORKER')
  @Post('razorpay/verify')
  @HttpCode(200)
  verify(@CurrentUser() me: AuthUser, @Body(Z(VerifyBody)) b: z.infer<typeof VerifyBody>) {
    return this.payments.verifyCheckout(me, b.orderId, b.paymentId, b.signature);
  }

  @Roles('CLIENT', 'WORKER')
  @Post('mock/:orderId/complete')
  @HttpCode(200)
  mock(@CurrentUser() me: AuthUser, @Param('orderId') orderId: string, @Body(Z(MockBody)) b: z.infer<typeof MockBody>) {
    return this.payments.mockComplete(me, orderId, b.outcome);
  }

  @Public()
  @SkipThrottle()
  @Post('webhook/razorpay')
  @HttpCode(200)
  webhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-razorpay-signature') sig?: string,
    @Headers('x-razorpay-event-id') eventId?: string,
  ) {
    return this.payments.handleRazorpayWebhook(req.rawBody ?? Buffer.from(''), sig, eventId);
  }
}

@Module({ controllers: [PaymentsController], providers: [PaymentsService], exports: [PaymentsService] })
export class PaymentsModule {}
