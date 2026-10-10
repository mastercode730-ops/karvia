import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PaymentPurpose } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { AuthUser } from '../common/auth.types';
import { hmac, randomToken, safeEqual } from '../common/util';
import { env } from '../config/env';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

@Injectable()
export class PaymentsService {
  private log = new Logger('Payments');

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly subs: SubscriptionsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  /** Prices come only from server settings; the browser never sends an amount. */
  async quote(purpose: PaymentPurpose) {
    const s = await this.settings.get();
    const amountPaise = purpose === 'CLIENT_ACCESS' ? s.clientAccessFeePaise : s.workerPlanPricePaise;
    const pct = purpose === 'CLIENT_ACCESS' ? s.clientTaxPercent : s.workerTaxPercent;
    const taxPaise = pct ? Math.round((amountPaise * pct) / 100) : 0;
    const days = purpose === 'CLIENT_ACCESS' ? s.clientAccessDays : s.workerPlanDays;
    return { purpose, amountPaise, taxPaise, taxPercent: pct, totalPaise: amountPaise + taxPaise, days, currency: 'INR' };
  }

  async createOrder(me: AuthUser, purpose: PaymentPurpose) {
    if (purpose === 'CLIENT_ACCESS' && me.role !== 'CLIENT') throw new ForbiddenException('Only clients buy access');
    if (purpose === 'WORKER_PLAN') {
      if (me.role !== 'WORKER') throw new ForbiddenException('Only workers buy the worker plan');
      const w = await this.prisma.workerProfile.findUnique({ where: { userId: me.id } });
      if (w?.verificationStatus !== 'VERIFIED') throw new BadRequestException('The plan is available after Karvia verifies your profile');
    }
    const q = await this.quote(purpose);
    const provider = env().PAYMENT_PROVIDER;
    const receipt = `krv_${randomToken(9)}`;
    const providerOrderId = provider === 'razorpay' ? await this.razorpayOrder(q.totalPaise, receipt, purpose) : `mock_order_${randomToken(12)}`;

    const p = await this.prisma.payment.create({
      data: { userId: me.id, purpose, amountPaise: q.amountPaise, taxPaise: q.taxPaise, totalPaise: q.totalPaise, provider, providerOrderId, status: 'CREATED' },
    });
    return { paymentId: p.id, orderId: providerOrderId, provider, keyId: provider === 'razorpay' ? env().RAZORPAY_KEY_ID : null, ...q };
  }

  private async razorpayOrder(amount: number, receipt: string, purpose: string) {
    const e = env();
    const res = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Basic ' + Buffer.from(`${e.RAZORPAY_KEY_ID}:${e.RAZORPAY_KEY_SECRET}`).toString('base64'),
      },
      body: JSON.stringify({ amount, currency: 'INR', receipt, notes: { purpose } }),
    });
    if (!res.ok) {
      this.log.error(`Razorpay order failed: ${res.status}`);
      throw new BadRequestException('Payment could not be started. Please try again.');
    }
    return ((await res.json()) as { id: string }).id;
  }

  /** Marks the payment successful and grants the subscription exactly once, whatever path confirms it first. */
  async markCaptured(orderId: string, providerPaymentId: string, amountPaid?: number) {
    const s = await this.settings.get();
    const result = await this.prisma.$transaction(async (tx) => {
      const p = await tx.payment.findUnique({ where: { providerOrderId: orderId } });
      if (!p) throw new NotFoundException('Payment not found');
      if (p.status === 'SUCCESS') return { payment: p, granted: false };
      if (amountPaid != null && amountPaid !== p.totalPaise) {
        await tx.payment.update({ where: { id: p.id }, data: { status: 'FAILED', failureReason: `Amount mismatch: ${amountPaid}` } });
        throw new BadRequestException('Payment amount mismatch');
      }
      const claimed = await tx.payment.updateMany({
        where: { id: p.id, status: { in: ['CREATED', 'PENDING', 'FAILED'] } },
        data: { status: 'SUCCESS', providerPaymentId },
      });
      if (!claimed.count) return { payment: p, granted: false };
      const kind = p.purpose === 'CLIENT_ACCESS' ? 'CLIENT_ACCESS' : 'WORKER_PLAN';
      const days = p.purpose === 'CLIENT_ACCESS' ? s.clientAccessDays : s.workerPlanDays;
      const sub = await this.subs.grant(p.userId, kind, days, 'PAYMENT', { paymentId: p.id }, tx);
      return { payment: { ...p, status: 'SUCCESS' as const }, granted: true, sub };
    });
    if (result.granted && 'sub' in result && result.sub) {
      const p = result.payment;
      const until = result.sub.endsAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
      await this.notifications.notify({
        userId: p.userId,
        type: 'PAYMENT_SUCCESS',
        title: 'Payment successful',
        body: p.purpose === 'CLIENT_ACCESS' ? `₹${p.totalPaise / 100} received. Access active till ${until}.` : `₹${p.totalPaise / 100} received. Your plan is active till ${until}.`,
        link: p.purpose === 'CLIENT_ACCESS' ? '/client/payments' : '/worker/plan',
      });
      if (p.purpose === 'WORKER_PLAN') await this.prisma.lead.updateMany({ where: { workerId: p.userId }, data: { status: 'CONVERTED' } });
    }
    return result.payment;
  }

  async markFailed(orderId: string, reason: string) {
    const p = await this.prisma.payment.findUnique({ where: { providerOrderId: orderId } });
    if (!p || p.status === 'SUCCESS') return;
    await this.prisma.payment.update({ where: { id: p.id }, data: { status: 'FAILED', failureReason: reason.slice(0, 200) } });
    await this.notifications.notify({
      userId: p.userId,
      type: 'PAYMENT_FAILED',
      title: 'Payment failed',
      body: 'No access was unlocked. If money was deducted it will return in 5–7 days.',
      link: p.purpose === 'CLIENT_ACCESS' ? '/client/payments' : '/worker/plan',
    });
  }

  /** Razorpay webhook: signature over the raw body, deduplicated by event id. */
  async handleRazorpayWebhook(raw: Buffer, signature: string | undefined, eventId: string | undefined) {
    const secret = env().RAZORPAY_WEBHOOK_SECRET;
    if (!secret || !signature || !safeEqual(signature, hmac(secret, raw.toString('utf8')))) {
      throw new ForbiddenException('Invalid signature');
    }
    const event = JSON.parse(raw.toString('utf8'));
    const id = eventId || `${event.event}:${event.payload?.payment?.entity?.id ?? event.created_at}`;
    try {
      await this.prisma.webhookEvent.create({ data: { id, provider: 'razorpay', type: String(event.event) } });
    } catch {
      return { ok: true, duplicate: true };
    }
    const pay = event.payload?.payment?.entity;
    if ((event.event === 'payment.captured' || event.event === 'order.paid') && pay?.order_id) {
      await this.markCaptured(pay.order_id, pay.id, pay.amount);
    } else if (event.event === 'payment.failed' && pay?.order_id) {
      await this.markFailed(pay.order_id, pay.error_description ?? 'failed');
    }
    return { ok: true };
  }

  /** Checkout callback: verify Razorpay's signature server-side (order_id|payment_id). */
  async verifyCheckout(me: AuthUser, orderId: string, paymentId: string, signature: string) {
    const p = await this.prisma.payment.findUnique({ where: { providerOrderId: orderId } });
    if (!p || p.userId !== me.id) throw new NotFoundException('Payment not found');
    const expected = hmac(env().RAZORPAY_KEY_SECRET ?? '', `${orderId}|${paymentId}`);
    if (!safeEqual(signature, expected)) throw new BadRequestException('Payment could not be verified');
    return this.markCaptured(orderId, paymentId);
  }

  /** Development only: simulates the provider confirming or failing a payment. */
  async mockComplete(me: AuthUser, orderId: string, outcome: 'success' | 'failed') {
    if (env().PAYMENT_PROVIDER !== 'mock') throw new ForbiddenException('Mock payments are disabled');
    const p = await this.prisma.payment.findUnique({ where: { providerOrderId: orderId } });
    if (!p || p.userId !== me.id) throw new NotFoundException('Payment not found');
    if (outcome === 'failed') {
      await this.markFailed(orderId, 'Mock failure');
      return this.prisma.payment.findUniqueOrThrow({ where: { id: p.id } });
    }
    return this.markCaptured(orderId, `mock_pay_${randomToken(10)}`, p.totalPaise);
  }

  async status(me: AuthUser, paymentId: string) {
    const p = await this.prisma.payment.findFirst({ where: { id: paymentId, userId: me.id } });
    if (!p) throw new NotFoundException('Payment not found');
    return p;
  }

  mine(me: AuthUser) {
    return this.prisma.payment.findMany({ where: { userId: me.id }, orderBy: { createdAt: 'desc' }, take: 50 });
  }

  async refund(actor: AuthUser, paymentId: string, reason: string, ip: string) {
    const p = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!p) throw new NotFoundException('Payment not found');
    if (p.status !== 'SUCCESS') throw new BadRequestException('Only successful payments can be refunded');
    const updated = await this.prisma.payment.update({ where: { id: p.id }, data: { status: 'REFUNDED', failureReason: reason } });
    await this.audit.log(actor, { action: 'payment.refund', entityType: 'Payment', entityId: p.id, before: { status: p.status }, after: { status: 'REFUNDED' }, reason, ip });
    return updated;
  }
}
