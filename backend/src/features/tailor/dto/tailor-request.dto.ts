import {
  IsString,
  IsNotEmpty,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ResumeSectionDto } from '../../resumes/dto/create-resume.dto';

class TailorResumeDto {
  /**
   * The frontend sends the full resume payload from store.toPayload(),
   * which includes `name` and `layout` alongside `sections`. The matching
   * engines only read `sections`, but with `forbidNonWhitelisted: true` on
   * the global ValidationPipe these extra top-level keys MUST be declared
   * here or every tailor request 400s with
   * "resume.property name should not exist" (regression from 66cd443,
   * which replaced ResumePayloadDto with a sections-only DTO).
   */
  @IsString()
  @IsOptional()
  name?: string | null;

  @IsString()
  @IsOptional()
  layout?: string;

  @ValidateNested({ each: true })
  @Type(() => ResumeSectionDto)
  sections!: ResumeSectionDto[];
}

export class TailorRequestDto {
  @IsString()
  @IsNotEmpty()
  jobDescription!: string;

  @ValidateNested()
  @Type(() => TailorResumeDto)
  resume!: TailorResumeDto;
}
