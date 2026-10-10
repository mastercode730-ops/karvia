import { loadTestEnv } from './load-env';
import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';

/** Fresh test database for every run: migrate, wipe all data, seed the catalogue and admin. Uses .env.test only. */
export default async function globalSetup() {
  loadTestEnv();
  if (!/karvia_test/.test(process.env.DATABASE_URL ?? '')) throw new Error('Refusing to run tests: DATABASE_URL is not the test database');
  const env = { ...process.env };
  execSync('npx prisma migrate deploy', { env, stdio: 'ignore' });
  const prisma = new PrismaClient();
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
  await prisma.$disconnect();
  execSync('npx ts-node prisma/seed.ts', { env, stdio: 'ignore' });
}
