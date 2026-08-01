import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Inject,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AuthGuard } from '../common/guards/auth.guard';
import { ResumesService } from './resumes.service';
import { CreateResumeDto } from './dto/create-resume.dto';
import { UpdateResumeDto } from './dto/update-resume.dto';

interface AuthenticatedRequest {
  user: { id: string; email: string };
}

@Controller('resumes')
@UseGuards(AuthGuard)
export class ResumesController {
  constructor(
    @Inject(ResumesService) private readonly resumesService: ResumesService,
  ) {}

  @Get()
  async findAll(@Req() req: AuthenticatedRequest) {
    return this.resumesService.findAll(req.user.id);
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.resumesService.findOne(id, req.user.id);
  }

  @Post()
  async create(
    @Body() dto: CreateResumeDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.resumesService.create(req.user.id, dto);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateResumeDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.resumesService.update(id, req.user.id, dto);
  }
}
