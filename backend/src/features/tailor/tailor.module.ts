import { Module } from '@nestjs/common';
import { TailorController } from './tailor.controller';
import { TailorService } from './tailor.service';

@Module({
  controllers: [TailorController],
  providers: [TailorService],
  exports: [TailorService],
})
export class TailorModule {}
