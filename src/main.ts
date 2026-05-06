import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import 'reflect-metadata';
import * as express from 'express';
import pinoHttp from 'pino-http';
import * as Sentry from '@sentry/node';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
  rawBody: true,
});

  // =========================
  // 🔥 INIT SENTRY FIRST
  // =========================
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
  });

  // =========================
  // 📊 REQUEST LOGGING
  // =========================
  app.use(pinoHttp());

  // =========================
  // 🔐 STRIPE WEBHOOK RAW BODY
  // =========================
  app.use(
    '/payment/webhook',
    express.raw({ type: 'application/json' }),
  );

  // =========================
  // 🌍 CORS
  // =========================
  app.enableCors({
    origin: ['https://www.cheapregcheck.com'],
  });

  console.log('🚨 VERSION 2 DEPLOY CHECK');

  const port = Number(process.env.PORT) || 8080;

  await app.listen(port);

  console.log('🔥 SERVER IS LISTENING ON:', port);
}

bootstrap();