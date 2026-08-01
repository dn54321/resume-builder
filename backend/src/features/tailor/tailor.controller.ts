import {
  Controller,
  Post,
  Body,
  Inject,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TailorService } from './tailor.service';
import { TailorRequestDto } from './dto/tailor-request.dto';
import type { TailorResponse } from './models/tailor-response.model';

/**
 * Tailor endpoint — no auth required (anonymous users).
 * Mounted at /api/v1/resumes/tailor via the ResumesModule.
 */
@Controller('resumes')
export class TailorController {
  constructor(
    @Inject(TailorService) private readonly tailorService: TailorService,
  ) {}

  @Post('tailor')
  @HttpCode(HttpStatus.OK)
  tailor(@Body() dto: TailorRequestDto): TailorResponse {
    return this.tailorService.tailor({
      jobDescription: dto.jobDescription,
      resume: dto.resume,
    });
  }
}
