import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { User } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UpdateTripLocationDto } from './dto/update-trip-location.dto';
import { TripsService } from './trips.service';

@Controller('trips')
@UseGuards(JwtAuthGuard)
export class TripsController {
  constructor(private readonly trips: TripsService) {}

  @Get('mine')
  mine(@CurrentUser() user: User) {
    return this.trips.getMine(user);
  }

  @Get(':id')
  one(@CurrentUser() user: User, @Param('id') id: string) {
    return this.trips.getOne(user, id);
  }

  @Post(':id/status/advance')
  advance(@CurrentUser() user: User, @Param('id') id: string) {
    return this.trips.advanceStatus(user, id);
  }

  @Post(':id/pickup')
  pickup(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body('photoUrl') photoUrl?: string,
  ) {
    return this.trips.confirmPickup(user, id, photoUrl);
  }

  @Post(':id/delivery/seeker')
  deliverySeeker(@CurrentUser() user: User, @Param('id') id: string) {
    return this.trips.confirmDeliverySeeker(user, id);
  }

  @Post(':id/delivery/owner')
  deliveryOwner(@CurrentUser() user: User, @Param('id') id: string) {
    return this.trips.confirmDeliveryOwner(user, id);
  }

  @Patch(':id/location')
  location(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateTripLocationDto,
  ) {
    return this.trips.updateLocation(user, id, dto.lat, dto.lng, dto.etaMinutes);
  }

  @Patch(':id/sharing')
  sharing(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body('enabled') enabled: boolean,
  ) {
    return this.trips.setSharing(user, id, !!enabled);
  }
}
