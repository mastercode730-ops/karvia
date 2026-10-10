import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { env } from './config/env';

export async function createApp() {
  const e = env(); // fail fast on bad configuration
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true, // needed to verify payment webhook signatures
    logger: e.NODE_ENV === 'test' ? ['error'] : ['log', 'warn', 'error'],
  });
  if (e.TRUST_PROXY) app.set('trust proxy', e.TRUST_PROXY);
  app.disable('x-powered-by');
  app.setGlobalPrefix('api');
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      hsts: e.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true } : false,
    }),
  );
  app.use(cookieParser());
  app.useBodyParser('json', { limit: '200kb' });
  app.useBodyParser('urlencoded', { limit: '50kb', extended: false });
  app.enableCors({
    origin: e.CORS_ORIGINS.split(',').map((s) => s.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  });
  app.enableShutdownHooks();
  return app;
}

async function bootstrap() {
  const app = await createApp();
  await app.listen(env().PORT);
  new Logger('Karvia').log(`API listening on http://localhost:${env().PORT}/api`);
}

if (require.main === module) bootstrap();
