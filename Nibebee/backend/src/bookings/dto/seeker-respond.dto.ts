import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class SeekerRespondDto {
  @IsEnum(['accept', 'reject', 'counter'] as const)
  action!: 'accept' | 'reject' | 'counter';

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsString()
  message?: string;
}
