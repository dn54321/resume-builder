import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import type { EnvConfig } from './common/config/env.interface';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));

  const config = app.get<ConfigService<EnvConfig>>(ConfigService);
  const frontendUrl: string =
    config.get('FRONTEND_URL') ?? 'http://localhost:5173';

  app.enableCors({ origin: frontendUrl, credentials: true });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const port: number = config.get('PORT') ?? 3000;

  await app.listen(port);

  app
    .get(Logger)
    .log(`Server running on http://localhost:${port}`, 'Bootstrap');
}
void bootstrap();
