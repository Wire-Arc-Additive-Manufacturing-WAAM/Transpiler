import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BookingRequestStatus,
  NegotiationActor,
  SubscriptionPlanType,
  User,
  UserRole,
} from '@prisma/client';
import {
  assertOwnerCanAct,
  assertSeekerCanAct,
  lastRound,
  nextRoundIndex,
} from '../domain/negotiation.policy';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SmsService } from '../integrations/sms.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { OwnerRespondDto } from './dto/owner-respond.dto';
import { SeekerRespondDto } from './dto/seeker-respond.dto';

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subs: SubscriptionsService,
    private readonly notify: NotificationsService,
    private readonly sms: SmsService,
  ) {}

  async create(seeker: User, dto: CreateBookingDto) {
    if (seeker.role !== UserRole.LoadSeeker) {
      throw new ForbiddenException('Only load seekers create booking requests');
    }
    await this.subs.startFreeIfNone(seeker.id);
    const listing = await this.prisma.lorryListing.findUnique({
      where: { id: dto.listingId },
      include: { owner: true },
    });
    if (!listing?.isActive) throw new NotFoundException('Listing not found');

    const seekerSub = await this.subs.hasActive(
      seeker.id,
      SubscriptionPlanType.LoadSeekerMonthly,
    );
    if (!seekerSub) {
      const c = await this.subs.seekerMonthlyRequestCount(seeker.id);
      if (c >= 2) {
        throw new ForbiddenException(
          'Free tier allows 2 booking requests per month. Upgrade to continue.',
        );
      }
    }

    const ownerSub = await this.subs.hasActive(
      listing.ownerId,
      SubscriptionPlanType.LorryOwnerMonthly,
    );
    if (!ownerSub) {
      const c = await this.subs.ownerMonthlyInboundRequestCount(listing.ownerId);
      if (c >= 3) {
        throw new ForbiddenException(
          'This operator has reached the free-tier inbound request limit for this month.',
        );
      }
    }

    const pickupDate = new Date(dto.pickupDate);
    const booking = await this.prisma.$transaction(async (tx) => {
      const b = await tx.bookingRequest.create({
        data: {
          listingId: listing.id,
          seekerId: seeker.id,
          ownerId: listing.ownerId,
          offeredPrice: dto.offeredPrice,
          cargoType: dto.cargoType,
          cargoWeightTons: dto.cargoWeightTons,
          pickupDate,
          originLabel: dto.originLabel,
          destinationLabel: dto.destinationLabel,
          pickupLat: dto.pickupLat,
          pickupLng: dto.pickupLng,
          destLat: dto.destLat,
          destLng: dto.destLng,
          status: BookingRequestStatus.Pending,
        },
      });
      await tx.negotiationRound.create({
        data: {
          bookingRequestId: b.id,
          roundIndex: 1,
          actor: NegotiationActor.Seeker,
          action: 'offer',
          amount: dto.offeredPrice,
        },
      });
      await tx.conversation.create({
        data: {
          bookingRequestId: b.id,
          userAId: seeker.id,
          userBId: listing.ownerId,
        },
      });
      return tx.bookingRequest.findUniqueOrThrow({
        where: { id: b.id },
        include: { rounds: true, listing: true },
      });
    });

    await this.notify.notify(
      listing.ownerId,
      'New booking request',
      `${seeker.firstName} requested your lorry for ${dto.originLabel} → ${dto.destinationLabel}.`,
      { bookingId: booking.id },
    );
    await this.sms.send(
      listing.owner.phoneE164,
      `Nibebee: new booking request for ${listing.numberPlate}. Open the app to respond.`,
    );

    return booking;
  }

  async listMine(user: User) {
    if (user.role === UserRole.LoadSeeker) {
      return this.prisma.bookingRequest.findMany({
        where: { seekerId: user.id },
        include: { rounds: true, listing: true },
        orderBy: { createdAt: 'desc' },
      });
    }
    if (user.role === UserRole.LorryOwner) {
      return this.prisma.bookingRequest.findMany({
        where: { ownerId: user.id },
        include: { rounds: true, listing: true },
        orderBy: { createdAt: 'desc' },
      });
    }
    return [];
  }

  async getOne(user: User, id: string) {
    const b = await this.prisma.bookingRequest.findUnique({
      where: { id },
      include: { rounds: true, listing: true, conversation: true },
    });
    if (!b) throw new NotFoundException();
    if (b.seekerId !== user.id && b.ownerId !== user.id) {
      throw new ForbiddenException();
    }
    return b;
  }

  async ownerRespond(owner: User, id: string, dto: OwnerRespondDto) {
    if (owner.role !== UserRole.LorryOwner) throw new ForbiddenException();
    const booking = await this.prisma.bookingRequest.findUnique({
      where: { id },
      include: { rounds: true },
    });
    if (!booking || booking.ownerId !== owner.id) {
      throw new NotFoundException();
    }
    assertOwnerCanAct(
      booking.status,
      booking.rounds,
      dto.action,
      dto.amount,
    );

    if (dto.action === 'reject') {
      return this.prisma.bookingRequest.update({
        where: { id },
        data: { status: BookingRequestStatus.Closed },
        include: { rounds: true },
      });
    }
    if (dto.action === 'accept') {
      const agreed = lastRound(booking.rounds)?.amount ?? booking.offeredPrice;
      return this.prisma.bookingRequest.update({
        where: { id },
        data: { status: BookingRequestStatus.AwaitingContract, offeredPrice: agreed },
        include: { rounds: true },
      });
    }
    const idx = nextRoundIndex(booking.rounds);
    return this.prisma.$transaction(async (tx) => {
      await tx.negotiationRound.create({
        data: {
          bookingRequestId: id,
          roundIndex: idx,
          actor: NegotiationActor.Owner,
          action: 'counter',
          amount: dto.amount!,
          message: dto.message,
        },
      });
      return tx.bookingRequest.update({
        where: { id },
        data: { status: BookingRequestStatus.Countered, offeredPrice: dto.amount! },
        include: { rounds: true },
      });
    });
  }

  async seekerRespond(seeker: User, id: string, dto: SeekerRespondDto) {
    if (seeker.role !== UserRole.LoadSeeker) throw new ForbiddenException();
    const booking = await this.prisma.bookingRequest.findUnique({
      where: { id },
      include: { rounds: true },
    });
    if (!booking || booking.seekerId !== seeker.id) {
      throw new NotFoundException();
    }
    assertSeekerCanAct(
      booking.status,
      booking.rounds,
      dto.action,
      dto.amount,
    );

    if (dto.action === 'reject') {
      return this.prisma.bookingRequest.update({
        where: { id },
        data: { status: BookingRequestStatus.Closed },
        include: { rounds: true },
      });
    }
    if (dto.action === 'accept') {
      const agreed = lastRound(booking.rounds)?.amount ?? booking.offeredPrice;
      return this.prisma.bookingRequest.update({
        where: { id },
        data: { status: BookingRequestStatus.AwaitingContract, offeredPrice: agreed },
        include: { rounds: true },
      });
    }
    const idx = nextRoundIndex(booking.rounds);
    return this.prisma.$transaction(async (tx) => {
      await tx.negotiationRound.create({
        data: {
          bookingRequestId: id,
          roundIndex: idx,
          actor: NegotiationActor.Seeker,
          action: 'counter',
          amount: dto.amount!,
          message: dto.message,
        },
      });
      return tx.bookingRequest.update({
        where: { id },
        data: { status: BookingRequestStatus.Pending, offeredPrice: dto.amount! },
        include: { rounds: true },
      });
    });
  }
}
