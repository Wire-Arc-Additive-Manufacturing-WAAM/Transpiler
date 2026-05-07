import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SendMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  body?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;
}
