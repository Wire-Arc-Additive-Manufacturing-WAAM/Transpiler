import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '@prisma/client';
import { CreateListingDto } from './dto/create-listing.dto';
import { SearchListingsDto } from './dto/search-listings.dto';
import { UpdateAvailabilityDto } from './dto/update-availability.dto';
import { ListingsService } from './listings.service';

@Controller('listings')
export class ListingsController {
  constructor(private readonly listings: ListingsService) {}

  @Get()
  search(@Query() query: SearchListingsDto) {
    return this.listings.search(query);
  }

  @UseGuards(JwtAuthGuard)
  @Get('mine')
  mine(@CurrentUser() user: User) {
    return this.listings.mine(user);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/contacts')
  contacts(@CurrentUser() user: User, @Param('id') id: string) {
    return this.listings.contactsForListing(user, id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.listings.findById(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreateListingDto) {
    return this.listings.create(user, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/availability')
  setAvailability(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: UpdateAvailabilityDto,
  ) {
    return this.listings.setAvailability(user, id, body.status);
  }
}
