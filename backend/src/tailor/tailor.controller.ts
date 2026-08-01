import { Controller, Post, Body, Inject } from '@nestjs/common';
import { TailorService } from './tailor.service';
import { TailorRequestDto } from './dto/tailor-request.dto';
import type { TailorResponseDto } from './dto/tailor-response.dto';
import type { TailorRequest } from './models/tailor-request.model';

@Controller('resumes')
export class TailorController {
  constructor(
    @Inject(TailorService) private readonly tailorService: TailorService,
  ) {}

  /**
   * POST /api/v1/resumes/tailor
   * No authentication required — accepts resume data and JD in body.
   * Returns the same resume structure with bullet points and skills
   * filtered to the most relevant ones based on the JD.
   * @param dto
   */
  @Post('tailor')
  async tailor(@Body() dto: TailorRequestDto): Promise<TailorResponseDto> {
    const request: TailorRequest = {
      jobDescription: dto.jobDescription,
      resume: dto.resume,
    };
    return this.tailorService.tailor(request);
  }
}
