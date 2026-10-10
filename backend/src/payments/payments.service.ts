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
    const providerOrderId =
      provider === 'razorpay'
        ? (await this.rzp<{ id: string }>('POST', '/orders', { amount: q.totalPaise, currency: 'INR', receipt, notes: { purpose, userId: me.id } }, 'Payment could not be started. Please try again.')).id
        : `mock_order_${randomToken(12)}`;

    const p = await this.prisma.payment.create({
      data: { userId: me.id, purpose, amountPaise: q.amountPaise, taxPaise: q.taxPaise, totalPaise: q.totalPaise, provider, providerOrderId, status: 'CREATED' },
    });
    return { paymentId: p.id, orderId: providerOrderId, provider, keyId: provider === 'razorpay' ? env().RAZORPAY_KEY_ID : null, ...q };
  }

  /** Calls the Razorpay REST API with the server-side key. The key secret never leaves the server. */
  private async rzp<T>(method: 'GET' | 'POST', path: string, body: unknown, userMessage: string): Promise<T> {
    const e = env();
    const res = await fetch(`https://api.razorpay.com/v1${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        authorization: 'Basic ' + Buffer.from(`${e.RAZORPAY_KEY_ID}:${e.RAZORPAY_KEY_SECRET}`).toString('base64'),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      this.log.error(`Razorpay ${method} ${path.split('/').slice(0, 2).join('/')} failed: ${res.status} ${json?.error?.code ?? ''}`);
      throw new BadRequestException(userMessage);
    }
    return json as T;
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
    const known = pay?.order_id ? await this.prisma.payment.findUnique({ where: { providerOrderId: pay.order_id } }) : null;
    if ((event.event === 'payment.captured' || event.event === 'order.paid') && known) {
      if (pay.currency && pay.currency !== 'INR') return { ok: true, ignored: 'currency' };
      await this.markCaptured(pay.order_id, pay.id, pay.amount);
    } else if (event.event === 'payment.failed' && known) {
      await this.markFailed(pay.order_id, pay.error_description ?? 'failed');
    } else if (event.event === 'refund.processed') {
      const refund = event.payload?.refund?.entity;
      if (refund?.payment_id) {
        await this.prisma.payment.updateMany({ where: { providerPaymentId: refund.payment_id, status: 'SUCCESS' }, data: { status: 'REFUNDED' } });
      }
    }
    return { ok: true };
  }

  /**
   * Checkout callback. Three checks before any access is granted:
   * 1. Razorpay's signature over order_id|payment_id is valid (proves the browser did not invent it).
   * 2. Razorpay's own API confirms this payment belongs to this order, for the exact amount, in INR.
   * 3. The payment is captured; if it is only authorised, the server captures it now.
   */
  async verifyCheckout(me: AuthUser, orderId: string, paymentId: string, signature: string) {
    if (env().PAYMENT_PROVIDER !== 'razorpay') throw new BadRequestException('Online payments are not enabled');
    const p = await this.prisma.payment.findUnique({ where: { providerOrderId: orderId } });
    if (!p || p.userId !== me.id) throw new NotFoundException('Payment not found');
    if (p.status === 'SUCCESS') return p;
    const expected = hmac(env().RAZORPAY_KEY_SECRET ?? '', `${orderId}|${paymentId}`);
    if (!safeEqual(signature, expected)) throw new BadRequestException('Payment could not be verified');

    const failMsg = 'We could not confirm this payment yet. If money was deducted, access unlocks as soon as the bank confirms.';
    let rp = await this.rzp<{ id: string; order_id: string; amount: number; currency: string; status: string }>('GET', `/payments/${encodeURIComponent(paymentId)}`, undefined, failMsg);
    if (rp.order_id !== orderId || rp.amount !== p.totalPaise || rp.currency !== 'INR') {
      this.log.error(`Payment ${paymentId} does not match order ${orderId}`);
      throw new BadRequestException('Payment details do not match this order');
    }
    if (rp.status === 'authorized') {
      rp = await this.rzp('POST', `/payments/${encodeURIComponent(paymentId)}/capture`, { amount: p.totalPaise, currency: 'INR' }, failMsg);
    }
    if (rp.status !== 'captured') {
      await this.prisma.payment.update({ where: { id: p.id }, data: { status: 'PENDING', providerPaymentId: paymentId } });
      throw new BadRequestException(failMsg);
    }
    return this.markCaptured(orderId, paymentId, rp.amount);
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
    // Real Razorpay payments are refunded through Razorpay; test/mock payments are only marked.
    let refundId: string | null = null;
    if (p.provider === 'razorpay' && p.providerPaymentId) {
      const r = await this.rzp<{ id: string }>('POST', `/payments/${encodeURIComponent(p.providerPaymentId)}/refund`, { amount: p.totalPaise, notes: { reason: reason.slice(0, 200) } }, 'Razorpay could not process the refund. Try again or refund from the Razorpay dashboard.');
      refundId = r.id;
    }
    const updated = await this.prisma.payment.update({ where: { id: p.id }, data: { status: 'REFUNDED', failureReason: reason } });
    await this.audit.log(actor, { action: 'payment.refund', entityType: 'Payment', entityId: p.id, before: { status: p.status }, after: { status: 'REFUNDED', refundId }, reason, ip });
    return updated;
  }
}
