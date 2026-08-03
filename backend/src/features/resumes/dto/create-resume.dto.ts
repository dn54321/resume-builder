import {
  IsString,
  IsOptional,
  IsArray,
  IsInt,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SectionFieldDto {
  @IsString()
  key!: string;

  @IsString()
  value!: string;
}

export class SectionEntryDto {
  @IsInt()
  @Min(0)
  order!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SectionFieldDto)
  fields!: SectionFieldDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SectionEntryDto)
  children!: SectionEntryDto[];
}

export class ResumeSectionDto {
  @IsString()
  sectionId!: string;

  @IsString()
  @IsOptional()
  column?: string;

  @IsInt()
  @Min(0)
  order!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SectionEntryDto)
  entries!: SectionEntryDto[];
}

export class CreateResumeDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  layout?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ResumeSectionDto)
  sections!: ResumeSectionDto[];
}
