import { Global, Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { type Request, type Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { type EnvConfig } from '../config/env.interface';

@Global()
@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvConfig>) => ({
        pinoHttp: {
          level: config.get('NODE_ENV') === 'production' ? 'info' : 'debug',
          transport:
            config.get('NODE_ENV') !== 'production'
              ? {
                  target: 'pino-pretty',
                  options: { colorize: true, singleLine: true },
                }
              : undefined,
          serializers: {
            req: (req: Request) => ({
              method: req.method,
              url: req.url,
              query: req.query,
            }),
            res: (res: Response) => ({
              statusCode: res.statusCode,
            }),
          },
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'RESUME_FIELD_ENCRYPTION_KEY',
              'SESSION_ENCRYPTION_KEY',
            ],
            censor: '[REDACTED]',
          },
          customProps: () => ({
            context: 'HTTP',
          }),
        },
      }),
    }),
  ],
  exports: [PinoLoggerModule],
})
export class LoggerModule {}
