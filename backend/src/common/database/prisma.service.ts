import {
  Injectable,
  Inject,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../config/env.interface';
import type { PrismaClient as PrismaClientType } from '../../generated/prisma/client';

/**
 * Declaration merging: PrismaService inherits all PrismaClient model delegates
 * (user, session, resume, etc.) at the type level. The underlying client is
 * loaded asynchronously via dynamic import because Prisma 7 generates ESM-only
 * output, but this project compiles to CJS.
 */
/* eslint-disable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-unsafe-return */
export interface PrismaService extends PrismaClientType {}

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private _client: PrismaClientType | null = null;
  private _initPromise: Promise<PrismaClientType> | null = null;

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<EnvConfig>,
  ) {
    // Proxy delegates PrismaClient model delegates (user, session, resume, etc.)
    // to the underlying _client. Non-Prisma properties fall through to undefined
    // so NestJS dependency resolution doesn't throw during class instantiation.
    const proxy = new Proxy(this, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        if (value !== undefined) return value;
        if (!target._client) return undefined;
        return Reflect.get(target._client, prop, target._client);
      },
    }) as unknown as PrismaService;
    return proxy;
  }

  private async _getClient(): Promise<PrismaClientType> {
    if (this._client) return this._client;
    if (!this._initPromise) {
      this._initPromise = this._init();
    }
    return this._initPromise;
  }

  private async _init(): Promise<PrismaClientType> {
    const [{ PrismaClient }, { PrismaLibSql }] = await Promise.all([
      import('../../generated/prisma/client.js'),
      import('@prisma/adapter-libsql'),
    ]);

    const databaseUrl: string = this.config.getOrThrow('DATABASE_URL');

    this._client = new PrismaClient({
      adapter: new PrismaLibSql({ url: databaseUrl }),
      log: [
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ],
    });

    return this._client;
  }

  async onModuleInit(): Promise<void> {
    this.logger.log('Connecting to database...');
    const client = await this._getClient();
    await client.$connect();
    this.logger.log('Database connection established');
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Disconnecting from database...');
    if (this._client) {
      await this._client.$disconnect();
    }
    this.logger.log('Database connection closed');
  }
}
