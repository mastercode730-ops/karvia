# Free deployment (development / staging)

| Part | Host | Example address |
|---|---|---|
| Website (`web/`) | Vercel | `https://karvia-web.vercel.app` |
| Admin console (`admin/`) | Vercel | `https://karvia-admin.vercel.app` |
| API (`backend/`) | Render (free) | `https://karvia-api.onrender.com` |
| Database | Neon (free) | — |

The websites call **their own** `/api`, and Vercel forwards it to Render. This keeps the login cookie working
even though the API is on a different domain. Live updates (WebSockets) connect to Render directly.

## 1. Render (API)

1. Sign up at render.com with GitHub. **New → Blueprint** → choose this repository. Render reads `render.yaml`.
2. Fill in the values it asks for:
   - `DATABASE_URL` and `DIRECT_URL`: Neon → your project → **Connect** → turn **Connection pooling OFF** → copy the string (same value for both).
   - `CORS_ORIGINS`: `https://<your-web>.vercel.app,https://<your-admin>.vercel.app` (no trailing slash).
   - `DATA_KEY`: run `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` and paste the output.
   - `GOOGLE_MAPS_API_KEY`: leave empty.
3. **Apply**. The first build takes a few minutes. Open `https://<your-api>.onrender.com/api/health`; it should show `"ok": true`.

## 2. Vercel (both projects)

Project → **Settings → Environment Variables**, then **Deployments → ⋯ → Redeploy**:

| Variable | Website | Admin |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `/api` | `/api` |
| `API_PROXY_TARGET` | `https://<your-api>.onrender.com` | `https://<your-api>.onrender.com` |
| `NEXT_PUBLIC_SOCKET_URL` | `https://<your-api>.onrender.com` | — |

## 3. Your admin account

On your computer, in `backend/.env` set `SEED_ADMIN_PHONE=<your mobile>`, then run `cd backend && npm run seed`.
Log in to the admin site with that number and set up two-factor authentication.

## Free-tier behaviour

- Render sleeps after ~15 minutes idle; the first request then takes 30–60 seconds.
- Uploaded photos and documents are wiped on every Render redeploy or restart.
- Staging mode (`ALLOW_DEV_PROVIDERS=true`) shows the OTP on screen and uses simulated payments,
  so **anyone can log in as any client or worker number. Use demo data only.** Admin accounts are still protected by 2FA.
- Before real users: real SMS and Razorpay keys, remove `ALLOW_DEV_PROVIDERS`, `OTP_DEV_ECHO`, mock settings (see README "Going live").
