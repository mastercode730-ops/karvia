import { existsSync } from 'fs';
import { z } from 'zod';

// Local development reads backend/.env; real deployments set environment variables directly.
if (existsSync('.env') && !process.env.DATABASE_URL) process.loadEnvFile('.env');

const bool = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:3001'),
  JWT_SECRET: z.string().min(32),
  OTP_PEPPER: z.string().min(32),
  FILE_URL_SECRET: z.string().min(32),
  DATA_KEY: z.string().refine((v) => Buffer.from(v, 'base64').length === 32, 'DATA_KEY must be 32 bytes base64'),
  SMS_PROVIDER: z.enum(['console', 'msg91']).default('console'),
  MSG91_AUTH_KEY: z.string().optional(),
  MSG91_TEMPLATE_ID: z.string().optional(),
  OTP_DEV_ECHO: bool,
  PAYMENT_PROVIDER: z.enum(['mock', 'razorpay']).default('mock'),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  STORAGE_DIR: z.string().default('./storage'),
  TRUST_PROXY: bool,
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

/** Validates process.env once. The app refuses to start with missing or weak secrets. */
export function env(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n  ');
    throw new Error(`Invalid environment configuration:\n  ${issues}`);
  }
  const e = parsed.data;
  if (e.NODE_ENV === 'production') {
    if (e.OTP_DEV_ECHO) throw new Error('OTP_DEV_ECHO must be false in production');
    if (e.SMS_PROVIDER === 'console') throw new Error('SMS_PROVIDER=console is not allowed in production');
    if (e.PAYMENT_PROVIDER === 'mock') throw new Error('PAYMENT_PROVIDER=mock is not allowed in production');
  }
  if (e.PAYMENT_PROVIDER === 'razorpay' && !(e.RAZORPAY_KEY_ID && e.RAZORPAY_KEY_SECRET && e.RAZORPAY_WEBHOOK_SECRET)) {
    throw new Error('Razorpay keys and webhook secret are required when PAYMENT_PROVIDER=razorpay');
  }
  cached = e;
  return e;
}

export const isProd = () => env().NODE_ENV === 'production';
