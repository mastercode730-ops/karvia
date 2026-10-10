# Karvia

Local service marketplace: clients find verified workers within 5 KM of the job; workers receive matching requests.
Built from the Karvia business-rule documents (V2 rules + consolidated master requirement).

```
karvia/
├─ backend/   NestJS API · PostgreSQL (Prisma) · Socket.IO live updates · scheduled timers
├─ web/       Next.js website: public pages, client app, worker app        (port 3000)
├─ admin/     Next.js admin console: admin, sub-admin, telecaller          (port 3001)
└─ shared/    API client, live-update socket, formatting shared by web + admin
```

## Run it locally

Requirements: Node.js 20+ and a PostgreSQL database (development uses the Neon project `karvia`).

```bash
npm install                          # installs all four workspaces
cp backend/.env.example backend/.env # then fill in DATABASE_URL, DIRECT_URL and generate the secrets
cd backend
npx prisma migrate deploy            # create tables
npm run seed -- --demo               # catalogue, staff roles, super admin, 5 demo workers near Noida
cd ..
npm run dev:api                      # http://localhost:4000/api
npm run dev:web                      # http://localhost:3000
npm run dev:admin                    # http://localhost:3001
```

In development, OTPs are printed in the API log **and** shown on the login screen ("Development mode: your OTP is …"),
and payments use a **test checkout** with "Simulate success / failure" buttons. Both are refused in production.

**First admin login:** set `SEED_ADMIN_PHONE` in `backend/.env` to your own mobile number and run `npm run seed`.
Log in at the admin console with that number. You must turn on two-factor authentication (scan the QR code with
Google/Microsoft Authenticator) before any admin screen opens.

**Demo accounts** (after `--demo`): workers `9000000001`–`9000000005`. Log in with any other number as a client.

## Tests

```bash
cd backend && npm test
```

19 end-to-end tests run against a separate database (`karvia_test`, configured in `backend/.env.test`, wiped each run).
They cover: OTP limits, refresh-token rotation and theft detection, admin 2FA, the ₹9 access gate, payment idempotency
and forged webhooks, incomplete worker registration, pricing-model rules, file-type checks, one-trial-per-mobile,
5 KM matching, simultaneous accepts (exactly one wins), the 60-second timeout, quotes, booking lifecycle rules,
telecaller data scoping, audit logging, and signed file links.

## Business rules (all configurable in Admin → Business settings, every change audited)

| Rule | Launch value |
|---|---|
| Client access | ₹9 for 30 days, no auto-renewal, no per-request charge |
| Worker plan | Free trial (5 days, one per mobile, starts on approval), then ₹199 / 30 days, manual renewal |
| Matching | Verified + active plan + AVAILABLE + service + within radius of the **job** + free at that time |
| Radius | 5 KM, widening 5 → 10 → 15 → 20 KM when nobody accepts |
| Distribution | Sent to all eligible workers at once (max 15); 60-second window; first accept wins and locks |
| Quotes | Valid 30 minutes; versioned; one accepted per request; service / material / tax shown separately |
| Contact | Phone opens only after the worker accepts; worker home address and documents are never shown |
| Tax / GST | Not set (to be confirmed by the company's CA); nothing hard-coded |

## Security

- **Login:** mobile + OTP (hashed, 5-minute expiry, 5 attempts, 5 per hour per number, 30 per hour per IP, 30-second resend).
- **Sessions:** 15-minute access token kept in memory; refresh token in an httpOnly cookie, rotated on every use;
  reusing an old refresh token signs the user out everywhere. Cookie endpoints check the browser Origin.
- **Staff:** separate admin app; two-factor authentication is mandatory; 12-hour sessions; granular permissions
  (Admin → Roles & staff); telecallers only ever load leads assigned to them, enforced in the database query.
- **Every business rule is enforced on the server** (₹9 gate, eligibility, prices, status changes). The browser never sends amounts.
- **Payments:** access unlocks only after a verified Razorpay signature or signed webhook; each payment is credited once.
- **First accept wins** is a single conditional database update, so two simultaneous accepts can never both succeed.
- **Files:** private storage, real file type checked from content, 10 MB limit, 5-minute signed links; staff document views are audited.
- **Audit log:** append-only record of approvals, suspensions, refunds, setting and category changes, document views, staff logins.
- **HTTP:** Helmet security headers, strict Content-Security-Policy on both front ends, CORS allow-list, request size limits,
  per-IP rate limits, input validation on every endpoint (Zod), no stack traces in error responses.

## Going live (checklist)

1. **Database in India:** move from Neon Singapore to a Mumbai-region Postgres (e.g. AWS RDS `ap-south-1`) for DPDP data residency.
2. **Secrets:** generate new `JWT_SECRET`, `OTP_PEPPER`, `FILE_URL_SECRET`, `DATA_KEY` for production; keep them in the host's secret manager.
3. **SMS:** register DLT templates, set `SMS_PROVIDER=msg91`, `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID`.
4. **Payments:** set `PAYMENT_PROVIDER=razorpay`, keys, and the webhook secret; point the Razorpay webhook to `https://<api>/api/payments/webhook/razorpay` (events: `payment.captured`, `payment.failed`, `order.paid`).
5. **Maps (optional):** `GOOGLE_MAPS_API_KEY` for address search (GPS works without it).
6. **File storage:** for more than one API server, swap the local disk storage in `backend/src/files/files.service.ts` for S3 (Mumbai) with the same interface.
7. **Hosting:** API on a Node host behind HTTPS (`TRUST_PROXY=true`, `NODE_ENV=production`); web + admin on Vercel with
   `NEXT_PUBLIC_API_URL=https://<api>/api`; put API and sites on the same parent domain (e.g. `api.karvia.services`, `karvia.services`,
   `admin.karvia.services`) so the login cookie works; add both sites to `CORS_ORIGINS`.
8. **Legal:** have the Terms and Privacy Policy reviewed by an Indian lawyer; fill the [placeholders] (support number, company details).
9. Run `npm test`, a penetration test, and UAT on staging before production.

## Not built yet (planned, switches already exist)

Voice-note **understanding** (voice notes are recorded and attached; AI extraction is a later phase), referral rewards,
in-app chat, masked calling, secure payment / escrow, Android/iOS apps (the API is ready for them).
