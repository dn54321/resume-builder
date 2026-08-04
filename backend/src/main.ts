import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import type { EnvConfig } from './common/config/models/env-config.model';

/**
 *
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));

  const config = app.get<ConfigService<EnvConfig>>(ConfigService);
  // ConfigService.get return type is `any` by design

  const frontendUrl: string = config.get(
    'FRONTEND_URL',
    'http://localhost:5173',
  );

  const port: number = config.get('PORT', 3000);

  app.setGlobalPrefix('api/v1');

  app.enableCors({
    origin: frontendUrl,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  app.use(cookieParser());

  app.use(helmet());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(port);

  app
    .get(Logger)
    .log(`Server running on http://localhost:${port}`, 'Bootstrap');
}

void bootstrap();
