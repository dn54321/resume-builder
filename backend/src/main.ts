import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import type { EnvConfig } from './common/config/env.interface';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));

  const config = app.get<ConfigService<EnvConfig>>(ConfigService);
  const port = config.get('PORT', 3000);

  await app.listen(port);

  app.get(Logger).log(`Server running on http://localhost:${port}`, 'Bootstrap');
}
bootstrap();
