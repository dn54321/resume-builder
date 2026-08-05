import {
  IsString,
  IsInt,
  IsArray,
  IsOptional,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Per top-level entry: which bullet indices (order-sorted children) are
 * relevant after tailoring.
 */
export class EntryBulletIndicesDto {
  @IsInt()
  @Min(0)
  entryOrder!: number;

  @IsArray()
  @IsOptional()
  @IsInt({ each: true })
  @Min(0, { each: true })
  bulletIndices!: number[];
}

/**
 * Response shape of POST /api/v1/resumes/tailor — the filter the frontend
 * applies via store.applyTailorFilter(). NOT validated on the way out
 * (Nest only validates request bodies); exists for OpenAPI/typing.
 */
export class TailorResponseDto {
  @ValidateNested({ each: true })
  @Type(() => EntryBulletIndicesDto)
  filteredBulletIndices!: Record<string, EntryBulletIndicesDto[]>;

  @IsArray()
  @IsString({ each: true })
  filteredHardSkills!: string[];

  @IsArray()
  @IsString({ each: true })
  filteredSoftSkills!: string[];
}
