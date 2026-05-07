import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateDisputeDto {
  @IsString()
  tripId!: string;

  @IsString()
  category!: string;

  @IsString()
  @MaxLength(4000)
  description!: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;
}
