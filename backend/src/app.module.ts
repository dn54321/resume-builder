import { Module } from '@nestjs/common';
import { ConfigModule } from './common/config/config.module';
import { CryptoModule } from './common/crypto/crypto.module';
import { LoggerModule } from './common/logger/logger.module';
import { DatabaseModule } from './common/database/database.module';
import { AuthModule } from './auth/auth.module';
import { ResumesModule } from './resumes/resumes.module';
import { TailorModule } from './features/tailor/tailor.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    DatabaseModule,
    CryptoModule,
    AuthModule,
    ResumesModule,
    TailorModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
