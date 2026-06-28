'use strict';
// Vercel serverless entrypoint for the NestJS backend.
//
// We require the ALREADY-COMPILED output in ../dist (produced by `nest build`
// during the Vercel build step). The compiled JS carries the emitted decorator
// metadata, so Nest's dependency injection works — importing the TS sources
// here would let the bundler strip that metadata and break DI.
//
// The Nest app is created once and cached across warm invocations.
require('reflect-metadata');
const { NestFactory } = require('@nestjs/core');
const { ValidationPipe } = require('@nestjs/common');
const { ConfigService } = require('@nestjs/config');
const { AppModule } = require('../dist/app.module');

let cachedHandler;

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });

  // Mirror src/main.ts configuration.
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = app.get(ConfigService);
  const origins = (config.get('FRONTEND_ORIGIN') || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: origins.length === 1 ? origins[0] : origins,
    credentials: true,
  });

  await app.init();
  return app.getHttpAdapter().getInstance();
}

module.exports = async (req, res) => {
  if (!cachedHandler) cachedHandler = await bootstrap();
  return cachedHandler(req, res);
};
