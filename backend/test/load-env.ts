import { readFileSync } from 'fs';
import { parseEnv } from 'util';

/** Forces .env.test values over anything already loaded (Prisma auto-loads .env on import). */
export function loadTestEnv() {
  Object.assign(process.env, parseEnv(readFileSync('.env.test', 'utf8')));
}
loadTestEnv();
