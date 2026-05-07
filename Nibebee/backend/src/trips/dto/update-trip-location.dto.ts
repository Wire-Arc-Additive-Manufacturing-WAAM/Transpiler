import { IsNumber, IsOptional } from 'class-validator';

export class UpdateTripLocationDto {
  @IsNumber()
  lat!: number;

  @IsNumber()
  lng!: number;

  @IsOptional()
  @IsNumber()
  etaMinutes?: number;
}
