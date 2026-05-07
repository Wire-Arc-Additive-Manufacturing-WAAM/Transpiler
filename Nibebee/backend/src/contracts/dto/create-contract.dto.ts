import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateContractDto {
  @IsString()
  pickupAddress!: string;

  @IsString()
  destinationAddress!: string;

  @IsString()
  cargoDescription!: string;

  @IsOptional()
  @IsNumber()
  @Min(5)
  @Max(90)
  depositPercent?: number;

  @IsString()
  cancellationTerms!: string;
}
