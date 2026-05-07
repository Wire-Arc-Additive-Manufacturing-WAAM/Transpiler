import { IsEnum } from 'class-validator';
import { AvailabilityStatus } from '@prisma/client';

export class UpdateAvailabilityDto {
  @IsEnum(AvailabilityStatus)
  status!: AvailabilityStatus;
}
