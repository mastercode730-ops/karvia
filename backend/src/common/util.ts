import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { env } from '../config/env';

/** Indian mobile: accepts 10 digits, optional +91 / 91 / 0 prefix, spaces or dashes. Returns 10 digits. */
export const phoneSchema = z
  .string()
  .transform((v) => v.replace(/[\s-]/g, '').replace(/^(\+91|91|0)(?=\d{10}$)/, ''))
  .refine((v) => /^[6-9]\d{9}$/.test(v), 'Enter a valid 10-digit Indian mobile number');

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const hmac = (secret: string, s: string) => createHmac('sha256', secret).update(s).digest('hex');

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export const randomToken = (bytes = 48) => randomBytes(bytes).toString('base64url');

/** AES-256-GCM for small secrets at rest (e.g. 2FA seeds). */
export function encrypt(plain: string): string {
  const key = Buffer.from(env().DATA_KEY, 'base64');
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
}
export function decrypt(blob: string): string {
  const [iv, tag, data] = blob.split('.').map((p) => Buffer.from(p, 'base64url'));
  const d = createDecipheriv('aes-256-gcm', Buffer.from(env().DATA_KEY, 'base64'), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString('utf8');
}

/** "98765 43210" → "98xxxxx210" for lists and logs. */
export const maskPhone = (p: string) => (p.length === 10 ? `${p.slice(0, 2)}xxxxx${p.slice(7)}` : 'xxxxxxxxxx');

/** Great-circle distance in km. */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 86400000);
export const addMinutes = (d: Date, m: number) => new Date(d.getTime() + m * 60000);

export const latLng = { lat: z.number().min(6).max(38), lng: z.number().min(68).max(98) }; // India bounding box
