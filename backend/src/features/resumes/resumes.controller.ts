import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  HttpCode,
  Inject,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ResumesService } from './resumes.service';
import { CreateResumeDto } from './dto/create-resume.dto';
import { UpdateResumeDto } from './dto/update-resume.dto';
import type { ResumeSummary } from './models/resume-summary.model';
import type { ResumeFull } from './models/resume-full.model';
import type { AuthenticatedRequest } from '../../common/models/authenticated-request.model';

@Controller('resumes')
@UseGuards(AuthGuard)
export class ResumesController {
  constructor(
    @Inject(ResumesService) private readonly resumesService: ResumesService,
  ) {}

  @Get()
  async findAll(@Req() req: AuthenticatedRequest): Promise<ResumeSummary[]> {
    return this.resumesService.findAll(req.user.id);
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<ResumeFull> {
    return this.resumesService.findOne(id, req.user.id);
  }

  @Post()
  async create(
    @Body() dto: CreateResumeDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ResumeFull> {
    return this.resumesService.create(req.user.id, dto);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateResumeDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ResumeFull> {
    return this.resumesService.update(id, req.user.id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    return this.resumesService.delete(id, req.user.id);
  }
}
