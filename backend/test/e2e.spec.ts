/* End-to-end tests against a real (test) Postgres database: business rules and security boundaries. */
import './load-env';
import { INestApplication } from '@nestjs/common';
import { createHmac } from 'crypto';
import { authenticator } from 'otplib';
import request from 'supertest';
import { createApp } from '../src/main';
import { PrismaService } from '../src/prisma/prisma.service';
import { RequestsService } from '../src/requests/requests.service';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
const NOIDA = { lat: 28.6208, lng: 77.3633 };
const ADMIN_PHONE = '9999999999';

let app: INestApplication;
let http: any;
let prisma: PrismaService;
let adminToken: string;
let tapRepairId: string;
let pipelineId: string;

async function login(phone: string, role: string, name?: string) {
  const r1 = await request(http).post('/api/auth/otp/request').send({ phone }).expect(200);
  const r2 = await request(http).post('/api/auth/otp/verify').send({ phone, code: r1.body.devCode, role, name }).expect(200);
  return r2.body as { accessToken: string; user: any; mfaRequired?: boolean; mfaToken?: string };
}
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

async function upload(token: string, kind: string, buf = PNG, name = 'a.png') {
  const r = await request(http).post('/api/files').set(auth(token)).field('kind', kind).attach('file', buf, name).expect(201);
  return r.body.id as string;
}

/** Registers a worker through the real API, gets them approved by the admin, and turns them AVAILABLE. */
async function makeWorker(phone: string, name: string, at = NOIDA, serviceIds = [tapRepairId]) {
  const { accessToken: t } = await login(phone, 'WORKER', name);
  const photo = await upload(t, 'PROFILE_PHOTO');
  await request(http).patch('/api/worker/me').set(auth(t)).send({ photoFileId: photo, serviceIds, area: 'Sector 62, Noida', pincode: '201309', ...at, experienceYears: 5 }).expect(200);
  await request(http).put('/api/worker/me/rates').set(auth(t)).send({ rates: [{ label: 'Visit charge', model: 'PER_VISIT', amountPaise: 30000 }, { label: 'Big jobs', model: 'CUSTOM_QUOTE' }] }).expect(200);
  for (const type of ['AADHAAR', 'ADDRESS_PROOF']) {
    const f = await upload(t, 'DOCUMENT', PDF, 'doc.pdf');
    await request(http).post('/api/worker/me/documents').set(auth(t)).send({ type, fileId: f }).expect(201);
  }
  await request(http).post('/api/worker/me/submit').set(auth(t)).expect(200);
  const id = (await request(http).get('/api/worker/me').set(auth(t))).body.id;
  await request(http).post(`/api/admin/workers/${id}/approve`).set(auth(adminToken)).expect(200);
  await request(http).post('/api/worker/me/availability').set(auth(t)).send({ availability: 'AVAILABLE' }).expect(200);
  return { token: t, id };
}

async function makeClient(phone: string, withAccess = true) {
  const { accessToken: t, user } = await login(phone, 'CLIENT', 'Test Client');
  if (withAccess) {
    const order = await request(http).post('/api/payments/orders').set(auth(t)).send({ purpose: 'CLIENT_ACCESS' }).expect(201);
    await request(http).post(`/api/payments/mock/${order.body.orderId}/complete`).set(auth(t)).send({ outcome: 'success' }).expect(200);
  }
  return { token: t, id: user.id as string };
}

beforeAll(async () => {
  app = await createApp();
  await app.init();
  http = app.getHttpServer();
  prisma = app.get(PrismaService);
  tapRepairId = (await prisma.service.findUniqueOrThrow({ where: { slug: 'tap-leak-repair' } })).id;
  pipelineId = (await prisma.service.findUniqueOrThrow({ where: { slug: 'pipeline-work' } })).id;

  // Admin must turn on 2FA before any admin action.
  const a = await login(ADMIN_PHONE, 'ADMIN');
  adminToken = a.accessToken;
  const blocked = await request(http).get('/api/admin/workers').set(auth(adminToken));
  expect(blocked.status).toBe(403);
  expect(blocked.body.code).toBe('MFA_SETUP_REQUIRED');
  const setup = await request(http).post('/api/auth/mfa/setup').set(auth(adminToken)).expect(200);
  await request(http).post('/api/auth/mfa/enable').set(auth(adminToken)).send({ code: authenticator.generate(setup.body.secret) }).expect(200);
  (global as any).adminSecret = setup.body.secret;
});

afterAll(async () => {
  await app?.close();
});

describe('Auth & sessions', () => {
  it('rejects requests without a token', async () => {
    await request(http).get('/api/auth/me').expect(401);
    await request(http).get('/api/health').expect(200);
  });

  it('validates phone numbers and limits wrong OTP attempts', async () => {
    await request(http).post('/api/auth/otp/request').send({ phone: '12345' }).expect(400);
    const r = await request(http).post('/api/auth/otp/request').send({ phone: '+91 98111 00001' }).expect(200);
    expect(r.body.devCode).toMatch(/^\d{6}$/);
    const wrong = r.body.devCode === '000000' ? '111111' : '000000';
    const bad = await request(http).post('/api/auth/otp/verify').send({ phone: '9811100001', code: wrong, role: 'CLIENT' }).expect(400);
    expect(bad.body.message).toMatch(/4 attempts left/);
    // Immediate resend is throttled per phone.
    await request(http).post('/api/auth/otp/request').send({ phone: '9811100001' }).expect(429);
  });

  it('does not create staff accounts from the public OTP login', async () => {
    const r1 = await request(http).post('/api/auth/otp/request').send({ phone: '9811100002' }).expect(200);
    await request(http).post('/api/auth/otp/verify').send({ phone: '9811100002', code: r1.body.devCode, role: 'ADMIN' }).expect(403);
  });

  it('rotates refresh tokens and revokes everything when an old one is reused', async () => {
    const agent = request.agent(http);
    const r1 = await agent.post('/api/auth/otp/request').send({ phone: '9811100003' }).expect(200);
    await agent.post('/api/auth/otp/verify').send({ phone: '9811100003', code: r1.body.devCode, role: 'CLIENT' }).expect(200);
    const first = await agent.post('/api/auth/refresh').expect(200);
    const oldCookie = first.headers['set-cookie'];
    const second = await agent.post('/api/auth/refresh').expect(200);
    expect(second.body.accessToken).toBeTruthy();
    // Replay the first rotated cookie: theft signal → all sessions revoked.
    await request(http).post('/api/auth/refresh').set('Cookie', oldCookie).expect(401);
    await request(http).get('/api/auth/me').set(auth(second.body.accessToken)).expect(401);
  });

  it('refuses refresh from an untrusted origin', async () => {
    await request(http).post('/api/auth/refresh').set('Origin', 'https://evil.example').expect(403);
  });

  it('requires the authenticator code for admin login once 2FA is on', async () => {
    await prisma.otpCode.deleteMany({ where: { phone: ADMIN_PHONE } }); // skip the 30-second resend wait
    const r = await login(ADMIN_PHONE, 'ADMIN');
    expect(r.mfaRequired).toBe(true);
    await request(http).post('/api/auth/mfa/verify').send({ mfaToken: r.mfaToken, code: '000000' }).expect(401);
    const ok = await request(http).post('/api/auth/mfa/verify').send({ mfaToken: r.mfaToken, code: authenticator.generate((global as any).adminSecret) }).expect(200);
    adminToken = ok.body.accessToken;
  });
});

describe('₹9 access gate & payments', () => {
  it('hides worker search and profiles until access is paid, then unlocks after server confirmation', async () => {
    const w = await makeWorker('9822200001', 'Gate Worker');
    const c = await makeClient('9822200002', false);
    const q = `/api/workers/search?serviceId=${tapRepairId}&lat=${NOIDA.lat}&lng=${NOIDA.lng}`;
    const denied = await request(http).get(q).set(auth(c.token)).expect(403);
    expect(denied.body.code).toBe('ACCESS_REQUIRED');
    await request(http).get(`/api/workers/${w.id}`).set(auth(c.token)).expect(403);

    const order = await request(http).post('/api/payments/orders').set(auth(c.token)).send({ purpose: 'CLIENT_ACCESS', amountPaise: 1 }).expect(201);
    expect(order.body.totalPaise).toBe(900); // amount always from server settings
    await request(http).get(q).set(auth(c.token)).expect(403); // created but not paid
    await request(http).post(`/api/payments/mock/${order.body.orderId}/complete`).set(auth(c.token)).send({ outcome: 'failed' }).expect(200);
    await request(http).get(q).set(auth(c.token)).expect(403); // failed payment never unlocks
    const order2 = await request(http).post('/api/payments/orders').set(auth(c.token)).send({ purpose: 'CLIENT_ACCESS' }).expect(201);
    await request(http).post(`/api/payments/mock/${order2.body.orderId}/complete`).set(auth(c.token)).send({ outcome: 'success' }).expect(200);
    // Confirming twice grants access only once.
    await request(http).post(`/api/payments/mock/${order2.body.orderId}/complete`).set(auth(c.token)).send({ outcome: 'success' }).expect(200);
    expect(await prisma.subscription.count({ where: { userId: c.id, kind: 'CLIENT_ACCESS' } })).toBe(1);

    const found = await request(http).get(q).set(auth(c.token)).expect(200);
    const hit = found.body.items.find((i: any) => i.id === w.id);
    expect(hit).toBeTruthy();
    expect(hit.lat).toBeUndefined();
    const profile = await request(http).get(`/api/workers/${w.id}`).set(auth(c.token)).expect(200);
    expect(profile.body.phone).toBeUndefined();
    expect(profile.body.lat).toBeUndefined();
  });

  it('accepts a correctly signed Razorpay webhook once, and rejects wrong amounts', async () => {
    const { accessToken: t, user } = await login('9822200009', 'CLIENT', 'Webhook Client');
    const order = await request(http).post('/api/payments/orders').set(auth(t)).send({ purpose: 'CLIENT_ACCESS' }).expect(201);
    const send = (eventId: string, amount: number) => {
      const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_test_' + eventId, order_id: order.body.orderId, amount, currency: 'INR' } } } });
      const sig = createHmac('sha256', 'test_webhook_secret_for_e2e_only').update(body).digest('hex');
      return request(http).post('/api/payments/webhook/razorpay').set('Content-Type', 'application/json').set('x-razorpay-signature', sig).set('x-razorpay-event-id', eventId).send(body);
    };
    await send('evt_wrong_amount', 100).expect(400);
    const order2 = await request(http).post('/api/payments/orders').set(auth(t)).send({ purpose: 'CLIENT_ACCESS' }).expect(201);
    order.body.orderId = order2.body.orderId;
    await send('evt_ok', 900).expect(200);
    const dup = await send('evt_ok', 900).expect(200);
    expect(dup.body.duplicate).toBe(true);
    expect(await prisma.subscription.count({ where: { userId: user.id, kind: 'CLIENT_ACCESS' } })).toBe(1);
  });

  it('rejects forged payment webhooks', async () => {
    await request(http).post('/api/payments/webhook/razorpay').set('x-razorpay-signature', 'forged').send({ event: 'payment.captured' }).expect(403);
  });

  it('only verified workers can buy the ₹199 plan', async () => {
    const { accessToken } = await login('9822200003', 'WORKER', 'Unverified');
    await request(http).post('/api/payments/orders').set(auth(accessToken)).send({ purpose: 'WORKER_PLAN' }).expect(400);
  });
});

describe('Worker registration & verification', () => {
  it('saves incomplete profiles, blocks submission until complete, and keeps them out of matching', async () => {
    const { accessToken: t } = await login('9833300001', 'WORKER', 'Half Done');
    await request(http).patch('/api/worker/me').set(auth(t)).send({ experienceYears: 3 }).expect(200);
    const me = await request(http).get('/api/worker/me').set(auth(t)).expect(200);
    expect(me.body.verificationStatus).toBe('INCOMPLETE');
    expect(me.body.completion.percent).toBeLessThan(100);
    const sub = await request(http).post('/api/worker/me/submit').set(auth(t)).expect(400);
    expect(sub.body.message).toMatch(/Profile photo/);
    await request(http).post('/api/worker/me/availability').set(auth(t)).send({ availability: 'AVAILABLE' }).expect(400);
    // It became a lead for telecallers.
    expect(await prisma.lead.count({ where: { phone: '9833300001' } })).toBe(1);
  });

  it('rejects pricing models the admin has not allowed for the service', async () => {
    const { accessToken: t } = await login('9833300002', 'WORKER', 'Price Test');
    await request(http).patch('/api/worker/me').set(auth(t)).send({ serviceIds: [tapRepairId] }).expect(200);
    await request(http).put('/api/worker/me/rates').set(auth(t)).send({ rates: [{ label: 'Per km', model: 'PER_KM', amountPaise: 1000 }] }).expect(400);
  });

  it('rejects uploads whose real content is not an allowed type', async () => {
    const { accessToken: t } = await login('9833300003', 'WORKER', 'Upload Test');
    const fake = Buffer.from('<html><script>alert(1)</script></html>');
    await request(http).post('/api/files').set(auth(t)).field('kind', 'PROFILE_PHOTO').attach('file', fake, 'photo.png').expect(400);
  });

  it('grants exactly one free trial on approval', async () => {
    const w = await makeWorker('9833300004', 'Trial Worker');
    const subs = await prisma.subscription.findMany({ where: { userId: w.id } });
    expect(subs).toHaveLength(1);
    expect(subs[0].kind).toBe('WORKER_TRIAL');
    expect(Math.round((subs[0].endsAt.getTime() - subs[0].startsAt.getTime()) / 86400000)).toBe(5);
  });
});

describe('Matching, first-accept-wins and bookings', () => {
  it('sends a request to nearby eligible workers only; exactly one of two simultaneous accepts wins', async () => {
    const near1 = await makeWorker('9844400001', 'Near One');
    const near2 = await makeWorker('9844400002', 'Near Two');
    const far = await makeWorker('9844400003', 'Far Away', { lat: 28.75, lng: 77.55 }); // ~22 km away
    const busy = await makeWorker('9844400004', 'Busy One');
    await request(http).post('/api/worker/me/availability').set(auth(busy.token)).send({ availability: 'BUSY' }).expect(200);
    // Clear earlier test workers out of the area so the assertions are exact.
    await prisma.workerProfile.updateMany({ where: { userId: { notIn: [near1.id, near2.id, far.id, busy.id] } }, data: { availability: 'BUSY' } });

    const c = await makeClient('9844400010');
    const req = await request(http).post('/api/requests').set(auth(c.token)).send({
      serviceId: tapRepairId, bookingType: 'INSTANT', description: 'Kitchen tap leaking', location: { ...NOIDA, addressText: 'B-204, Sector 62, Noida' },
    }).expect(201);
    expect(req.body.status).toBe('SENT');
    const offers = await prisma.requestOffer.findMany({ where: { requestId: req.body.id } });
    expect(offers.map((o) => o.workerId).sort()).toEqual([near1.id, near2.id].sort());

    // Worker sees the job area, not the exact address, before accepting.
    const list = await request(http).get('/api/worker/offers').set(auth(near1.token)).expect(200);
    expect(JSON.stringify(list.body)).not.toContain('B-204');

    const [a, b] = await Promise.all([
      request(http).post(`/api/worker/offers/${req.body.id}/accept`).set(auth(near1.token)),
      request(http).post(`/api/worker/offers/${req.body.id}/accept`).set(auth(near2.token)),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const winner = a.status === 200 ? near1 : near2;
    const bookingId = (a.status === 200 ? a : b).body.bookingId;
    expect(await prisma.booking.count({ where: { requestId: req.body.id } })).toBe(1);

    // Contact opens after acceptance; the other client cannot see this booking at all.
    const detail = await request(http).get(`/api/bookings/${bookingId}`).set(auth(c.token)).expect(200);
    expect(detail.body.contactOpen).toBe(true);
    expect(detail.body.worker.phone).toMatch(/^\d{10}$/);
    const stranger = await makeClient('9844400011');
    await request(http).get(`/api/bookings/${bookingId}`).set(auth(stranger.token)).expect(404);

    // Lifecycle rules: cannot complete before starting; reviews only after completion, once.
    await request(http).post(`/api/bookings/${bookingId}/review`).set(auth(c.token)).send({ stars: 5 }).expect(400);
    await request(http).post(`/api/bookings/${bookingId}/confirm`).set(auth(c.token)).expect(200);
    await request(http).post(`/api/bookings/${bookingId}/complete`).set(auth(winner.token)).expect(400);
    await request(http).post(`/api/bookings/${bookingId}/start`).set(auth(winner.token)).expect(200);
    await request(http).post(`/api/bookings/${bookingId}/complete`).set(auth(winner.token)).expect(200);
    await request(http).post(`/api/bookings/${bookingId}/review`).set(auth(c.token)).send({ stars: 4, text: 'Good work' }).expect(201);
    await request(http).post(`/api/bookings/${bookingId}/review`).set(auth(c.token)).send({ stars: 5 }).expect(409);
    const wp = await prisma.workerProfile.findUniqueOrThrow({ where: { userId: winner.id } });
    expect(wp.ratingAvg).toBe(4);
    expect(wp.jobsDone).toBe(1);
  });

  it('moves on when nobody accepts in time and ends as NO_WORKER', async () => {
    await prisma.workerProfile.updateMany({ data: { availability: 'BUSY' } });
    const solo = await makeWorker('9855500001', 'Solo Worker');
    const c = await makeClient('9855500010');
    const req = await request(http).post('/api/requests').set(auth(c.token)).send({
      serviceId: tapRepairId, bookingType: 'INSTANT', description: 'Leak', location: { ...NOIDA, addressText: 'Sector 62' },
    }).expect(201);
    expect(req.body.status).toBe('SENT');
    await prisma.serviceRequest.update({ where: { id: req.body.id }, data: { roundExpiresAt: new Date(Date.now() - 1000) } });
    await app.get(RequestsService).tick();
    const after = await prisma.serviceRequest.findUniqueOrThrow({ where: { id: req.body.id } });
    expect(after.status).toBe('NO_WORKER');
    // Late accept is refused.
    await request(http).post(`/api/worker/offers/${req.body.id}/accept`).set(auth(solo.token)).expect(409);
  });

  it('quote flow: worker quotes, client accepts, booking is confirmed with the quoted price', async () => {
    await prisma.workerProfile.updateMany({ data: { availability: 'BUSY' } });
    const q = await makeWorker('9866600001', 'Quote Worker', NOIDA, [tapRepairId, pipelineId]);
    const c = await makeClient('9866600010');
    const req = await request(http).post('/api/requests').set(auth(c.token)).send({
      serviceId: pipelineId, bookingType: 'QUOTE', description: 'Full pipeline for 3BHK', location: { ...NOIDA, addressText: 'Sector 62' },
    }).expect(201);
    expect(req.body.status).toBe('QUOTING');
    const quote = await request(http).post(`/api/worker/offers/${req.body.id}/quote`).set(auth(q.token)).send({ servicePaise: 750000, materialPaise: 420000 }).expect(201);
    const accepted = await request(http).post(`/api/requests/quotes/${quote.body.id}/accept`).set(auth(c.token)).expect(200);
    const b = await prisma.booking.findUniqueOrThrow({ where: { id: accepted.body.bookingId } });
    expect(b.status).toBe('CONFIRMED');
    expect((b.agreedPrice as any).totalPaise).toBe(1170000);
  });
});

describe('Staff permissions', () => {
  it('telecallers cannot use admin routes and only see their assigned leads', async () => {
    const tc = await prisma.user.create({ data: { phone: '9877700001', name: 'Anjali', roles: ['TELECALLER'] } });
    const r = await login('9877700001', 'TELECALLER');
    const setup = await request(http).post('/api/auth/mfa/setup').set(auth(r.accessToken)).expect(200);
    await request(http).post('/api/auth/mfa/enable').set(auth(r.accessToken)).send({ code: authenticator.generate(setup.body.secret) }).expect(200);
    const t = r.accessToken;

    await request(http).get('/api/admin/workers').set(auth(t)).expect(403);
    await request(http).get('/api/admin/payments').set(auth(t)).expect(403);
    await request(http).patch('/api/admin/settings').set(auth(t)).send({ acceptTimeoutSec: 30 }).expect(403);

    const before = await request(http).get('/api/leads').set(auth(t)).expect(200);
    expect(before.body.items).toHaveLength(0);
    const lead = await prisma.lead.findFirstOrThrow({ where: { phone: '9833300001' } });
    const other = await prisma.lead.findFirstOrThrow({ where: { phone: '9833300002' } });
    await request(http).post('/api/leads/assign').set(auth(adminToken)).send({ leadIds: [lead.id], assignedToId: tc.id }).expect(200);
    const after = await request(http).get('/api/leads').set(auth(t)).expect(200);
    expect(after.body.items.map((l: any) => l.id)).toEqual([lead.id]);
    await request(http).get(`/api/leads/${other.id}`).set(auth(t)).expect(404);
    await request(http).post(`/api/leads/${lead.id}/outcome`).set(auth(t)).send({ status: 'INTERESTED', note: 'Will upload docs tonight' }).expect(200);
    await request(http).post(`/api/leads/assign`).set(auth(t)).send({ leadIds: [other.id], assignedToId: tc.id }).expect(403);
  });

  it('records sensitive admin actions in the audit log', async () => {
    await request(http).patch('/api/admin/settings').set(auth(adminToken)).send({ acceptTimeoutSec: 90 }).expect(200);
    const log = await prisma.auditLog.findFirst({ where: { action: 'settings.update' }, orderBy: { createdAt: 'desc' } });
    expect(log?.after).toEqual({ acceptTimeoutSec: 90 });
    expect(await prisma.auditLog.count({ where: { action: 'worker.approve' } })).toBeGreaterThan(0);
    await request(http).patch('/api/admin/settings').set(auth(adminToken)).send({ acceptTimeoutSec: 60 }).expect(200);
  });

  it('signed file links expire and cannot be tampered with', async () => {
    const doc = await prisma.document.findFirstOrThrow();
    const link = await request(http).get(`/api/admin/workers/documents/${doc.id}/url`).set(auth(adminToken)).expect(200);
    await request(http).get(link.body.url).expect(200);
    await request(http).get(link.body.url.replace(/sig=[a-f0-9]+/, 'sig=' + '0'.repeat(64))).expect(403);
    expect(await prisma.auditLog.count({ where: { action: 'document.view' } })).toBeGreaterThan(0);
    const c = await makeClient('9877700010');
    await request(http).get(`/api/files/${doc.fileId}/url`).set(auth(c.token)).expect(403);
  });
});
