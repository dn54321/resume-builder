import {
  IsString,
  IsOptional,
  IsArray,
  IsInt,
  ValidateNested,
  Min,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

class SectionFieldPayloadDto {
  @IsString()
  key!: string;

  @IsString()
  value!: string;

  @IsInt()
  @Min(0)
  order!: number;
}

class SectionEntryPayloadDto {
  @IsInt()
  @Min(0)
  order!: number;

  @IsOptional()
  @IsString()
  parentId: string | null = null;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SectionFieldPayloadDto)
  fields!: SectionFieldPayloadDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SectionEntryPayloadDto)
  children?: SectionEntryPayloadDto[];
}

class ResumeSectionPayloadDto {
  @IsString()
  sectionId!: string;

  @IsIn(['left', 'right'])
  column!: 'left' | 'right';

  @IsInt()
  @Min(0)
  order!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SectionEntryPayloadDto)
  entries!: SectionEntryPayloadDto[];
}

export class ResumePayloadDto {
  @IsIn(['standard', 'column2-1'])
  layout!: 'standard' | 'column2-1';

  @IsString()
  name!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ResumeSectionPayloadDto)
  sections!: ResumeSectionPayloadDto[];
}
