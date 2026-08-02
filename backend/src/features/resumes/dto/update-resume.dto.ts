import { IsString, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ResumeSectionDto } from './create-resume.dto';

export class UpdateResumeDto {
  @IsString()
  @IsOptional()
  layout?: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ResumeSectionDto)
  sections?: ResumeSectionDto[];
}
