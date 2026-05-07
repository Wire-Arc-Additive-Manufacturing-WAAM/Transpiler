import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateReviewDto {
  @IsString()
  tripId!: string;

  @IsEnum(['owner', 'seeker'] as const)
  target!: 'owner' | 'seeker';

  @IsInt()
  @Min(1)
  @Max(5)
  stars!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  punctuality?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  handling?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  communication?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  priceAccuracy?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  reliability?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  cargoAccuracy?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  paymentPromptness?: number;

  @IsOptional()
  @IsString()
  comment?: string;
}
