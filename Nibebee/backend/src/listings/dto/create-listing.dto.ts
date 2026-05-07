import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { LorryType } from '@prisma/client';

export class CreateListingDto {
  @IsString()
  photoUrl!: string;

  @IsString()
  numberPlate!: string;

  @IsEnum(LorryType)
  lorryType!: LorryType;

  @IsNumber()
  @Min(0.1)
  capacityTons!: number;

  @IsString()
  cityRegion!: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @IsString()
  pricingMode!: 'per_km' | 'flat_routes';

  @IsOptional()
  @IsNumber()
  @Min(0)
  perKmRate?: number;

  @IsOptional()
  flatRouteRates?: Record<string, number>;

  @IsArray()
  @IsString({ each: true })
  supportedRoutes!: string[];

  @IsOptional()
  @IsNumber()
  basePriceHint?: number;
}
