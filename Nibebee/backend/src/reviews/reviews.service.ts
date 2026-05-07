import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TripStatus, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: User, dto: CreateReviewDto) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: dto.tripId },
      include: { contract: true },
    });
    if (!trip) throw new NotFoundException();
    if (trip.status !== TripStatus.Delivered) {
      throw new BadRequestException('Trip must be delivered');
    }
    if (!trip.seekerDeliveryConfirmedAt || !trip.ownerDeliveryConfirmedAt) {
      throw new BadRequestException('Both parties must confirm delivery');
    }
    const revieweeId =
      dto.target === 'owner' ? trip.ownerId : trip.seekerId;
    if (dto.target === 'owner' && user.id !== trip.seekerId) {
      throw new ForbiddenException();
    }
    if (dto.target === 'seeker' && user.id !== trip.ownerId) {
      throw new ForbiddenException();
    }
    const existing = await this.prisma.review.findFirst({
      where: { reviewerId: user.id, tripId: trip.id, revieweeId },
    });
    if (existing) throw new BadRequestException('Already reviewed this trip');

    const review = await this.prisma.review.create({
      data: {
        reviewerId: user.id,
        revieweeId,
        tripId: trip.id,
        stars: dto.stars,
        punctuality: dto.punctuality,
        handling: dto.handling,
        communication: dto.communication,
        priceAccuracy: dto.priceAccuracy,
        reliability: dto.reliability,
        cargoAccuracy: dto.cargoAccuracy,
        paymentPromptness: dto.paymentPromptness,
        comment: dto.comment,
      },
    });

    const agg = await this.prisma.review.aggregate({
      where: { revieweeId },
      _avg: { stars: true },
      _count: { id: true },
    });
    await this.prisma.user.update({
      where: { id: revieweeId },
      data: {
        averageRating: agg._avg.stars ?? dto.stars,
        ratingCount: agg._count.id,
      },
    });

    return review;
  }

  async listForUser(userId: string) {
    return this.prisma.review.findMany({
      where: { revieweeId: userId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
