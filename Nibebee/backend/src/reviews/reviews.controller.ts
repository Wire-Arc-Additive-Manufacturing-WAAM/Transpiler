import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { User } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateReviewDto } from './dto/create-review.dto';
import { ReviewsService } from './reviews.service';

@Controller('reviews')
@UseGuards(JwtAuthGuard)
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreateReviewDto) {
    return this.reviews.create(user, dto);
  }

  @Get('user/:userId')
  forUser(@Param('userId') userId: string) {
    return this.reviews.listForUser(userId);
  }
}
