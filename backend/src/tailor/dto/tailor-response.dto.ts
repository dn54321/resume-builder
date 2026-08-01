import { IsString, IsInt, IsArray, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { SectionFieldDto } from '../../resumes/dto/create-resume.dto';

export class TailorResponseEntryDto {
  @IsInt()
  @Min(0)
  order!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SectionFieldDto)
  fields!: SectionFieldDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TailorResponseEntryDto)
  children!: TailorResponseEntryDto[];
}

export class TailorResponseSectionDto {
  @IsString()
  sectionId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TailorResponseEntryDto)
  entries!: TailorResponseEntryDto[];
}

export class TailorResponseDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TailorResponseSectionDto)
  sections!: TailorResponseSectionDto[];
}
