import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // Versioned API prefix per PRD section 7 (e.g. POST /api/v1/sales-invoice).
  app.setGlobalPrefix('api/v1');

  // Enforce DTO validation globally (whitelist strips unknown props).
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Allow one or more comma-separated frontend origins (e.g. production
  // domain + Vercel preview deploys). Falls back to the local dev origin.
  const origins = (
    config.get<string>('FRONTEND_ORIGIN') ?? 'http://localhost:5173'
  )
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, '')) // tolerate trailing slashes
    .filter(Boolean);
  app.enableCors({
    origin: origins.length === 1 ? origins[0] : origins,
    credentials: true,
  });

  const port = config.get<number>('PORT') ?? 3000;
  await app.listen(port);
}
void bootstrap();
