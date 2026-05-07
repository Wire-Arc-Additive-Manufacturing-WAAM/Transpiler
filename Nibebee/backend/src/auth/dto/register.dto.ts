import {
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
  Matches,
} from 'class-validator';
import { CountryCode, EntityType, UserRole } from '@prisma/client';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsIn([UserRole.LoadSeeker, UserRole.LorryOwner])
  role!: UserRole;

  @IsEnum(CountryCode)
  country!: CountryCode;

  @IsString()
  @Matches(/^\+(254|256|255)\d{9,12}$/, {
    message: 'phoneE164 must use +254, +256, or +255',
  })
  phoneE164!: string;

  @IsString()
  firstName!: string;

  @IsString()
  lastName!: string;

  @IsOptional()
  @IsEnum(EntityType)
  entityType?: EntityType;

  @IsOptional()
  @IsString()
  businessName?: string;

  @IsOptional()
  @IsString()
  businessPin?: string;
}
