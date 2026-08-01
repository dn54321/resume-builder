import { IsString, IsNotEmpty, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ResumeSectionDto } from '../../resumes/dto/create-resume.dto';

class TailorResumeDto {
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
