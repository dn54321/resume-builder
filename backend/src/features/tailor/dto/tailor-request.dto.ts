import {
  IsString,
  IsNotEmpty,
  IsDefined,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ResumePayloadDto } from './resume-payload.dto';

/**
 * Validated request body for POST /resumes/tailor.
 */
export class TailorRequestDto {
  @IsString()
  @IsNotEmpty()
  jobDescription!: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => ResumePayloadDto)
  resume!: ResumePayloadDto;
}
