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

  app.enableCors({
    origin: config.get<string>('FRONTEND_ORIGIN') ?? 'http://localhost:5173',
    credentials: true,
  });

  const port = config.get<number>('PORT') ?? 3000;
  await app.listen(port);
}
void bootstrap();
