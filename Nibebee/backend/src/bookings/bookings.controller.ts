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
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { OwnerRespondDto } from './dto/owner-respond.dto';
import { SeekerRespondDto } from './dto/seeker-respond.dto';

@Controller('bookings')
@UseGuards(JwtAuthGuard)
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreateBookingDto) {
    return this.bookings.create(user, dto);
  }

  @Get('mine')
  list(@CurrentUser() user: User) {
    return this.bookings.listMine(user);
  }

  @Get(':id')
  one(@CurrentUser() user: User, @Param('id') id: string) {
    return this.bookings.getOne(user, id);
  }

  @Patch(':id/owner')
  owner(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: OwnerRespondDto,
  ) {
    return this.bookings.ownerRespond(user, id, dto);
  }

  @Patch(':id/seeker')
  seeker(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: SeekerRespondDto,
  ) {
    return this.bookings.seekerRespond(user, id, dto);
  }
}
