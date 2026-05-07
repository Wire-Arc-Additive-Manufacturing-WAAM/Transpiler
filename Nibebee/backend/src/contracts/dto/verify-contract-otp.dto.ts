import { IsEnum, IsString, Length } from 'class-validator';

export class VerifyContractOtpDto {
  @IsEnum(['seeker', 'owner'] as const)
  party!: 'seeker' | 'owner';

  @IsString()
  @Length(4, 8)
  code!: string;
}
