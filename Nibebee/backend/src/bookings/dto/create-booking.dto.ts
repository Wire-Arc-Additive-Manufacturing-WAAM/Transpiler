import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateBookingDto {
  @IsString()
  listingId!: string;

  @IsNumber()
  @Min(0)
  offeredPrice!: number;

  @IsString()
  cargoType!: string;

  @IsNumber()
  @Min(0)
  cargoWeightTons!: number;

  @IsDateString()
  pickupDate!: string;

  @IsString()
  originLabel!: string;

  @IsString()
  destinationLabel!: string;

  @IsOptional()
  @IsNumber()
  pickupLat?: number;

  @IsOptional()
  @IsNumber()
  pickupLng?: number;

  @IsOptional()
  @IsNumber()
  destLat?: number;

  @IsOptional()
  @IsNumber()
  destLng?: number;
}
