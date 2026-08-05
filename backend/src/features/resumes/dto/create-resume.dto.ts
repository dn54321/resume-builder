import {
  IsString,
  IsOptional,
  IsArray,
  IsInt,
  IsBoolean,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SectionFieldDto {
  @IsString()
  @IsOptional()
  id?: string;

  @IsString()
  key!: string;

  @IsString()
  value!: string;

  @IsString()
  @IsOptional()
  iv?: string;

  @IsString()
  @IsOptional()
  authTag?: string;

  @IsInt()
  @IsOptional()
  @Min(0)
  order?: number;
}

export class SectionEntryDto {
  @IsString()
  @IsOptional()
  id?: string;

  @IsInt()
  @Min(0)
  order!: number;

  @IsString()
  @IsOptional()
  parentId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SectionFieldDto)
  fields!: SectionFieldDto[];

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => SectionEntryDto)
  children?: SectionEntryDto[];
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

  @IsBoolean()
  @IsOptional()
  locked?: boolean;

  /** Whether the section is visible in the rendered resume (soft-toggle). */
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

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
