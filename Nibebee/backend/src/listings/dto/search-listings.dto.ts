import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { AvailabilityStatus, LorryType } from '@prisma/client';
import { Type } from 'class-transformer';

export class SearchListingsDto {
  @IsOptional()
  @IsString()
  origin?: string;

  @IsOptional()
  @IsString()
  destination?: string;

  @IsOptional()
  @IsEnum(AvailabilityStatus)
  availability?: AvailabilityStatus;

  @IsOptional()
  @IsEnum(LorryType)
  lorryType?: LorryType;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minCapacity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxCapacity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxPrice?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  verifiedOnly?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  minStars?: number;
}
