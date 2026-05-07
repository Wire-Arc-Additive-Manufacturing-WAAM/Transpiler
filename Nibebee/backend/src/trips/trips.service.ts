import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EscrowStatus,
  MilestoneType,
  TripStatus,
  User,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { NotificationsService } from '../notifications/notifications.service';

const ORDER: TripStatus[] = [
  TripStatus.Planned,
  TripStatus.DriverEnRoute,
  TripStatus.CargoLoaded,
  TripStatus.InTransit,
  TripStatus.Approaching,
  TripStatus.Delivered,
];

const MILESTONE: Record<TripStatus, MilestoneType | null> = {
  [TripStatus.Planned]: null,
  [TripStatus.DriverEnRoute]: MilestoneType.DriverEnRoute,
  [TripStatus.CargoLoaded]: MilestoneType.CargoLoaded,
  [TripStatus.InTransit]: MilestoneType.InTransit,
  [TripStatus.Approaching]: MilestoneType.Approaching,
  [TripStatus.Delivered]: MilestoneType.Delivered,
  [TripStatus.Cancelled]: null,
};

@Injectable()
export class TripsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    private readonly notify: NotificationsService,
  ) {}

  async getMine(user: User) {
    return this.prisma.trip.findMany({
      where: {
        OR: [{ seekerId: user.id }, { ownerId: user.id }, { driverId: user.id }],
      },
      include: { contract: true, milestones: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOne(user: User, id: string) {
    const t = await this.prisma.trip.findUnique({
      where: { id },
      include: { contract: true, milestones: true },
    });
    if (!t) throw new NotFoundException();
    if (t.seekerId !== user.id && t.ownerId !== user.id && t.driverId !== user.id) {
      throw new ForbiddenException();
    }
    return t;
  }

  async setSharing(user: User, id: string, enabled: boolean) {
    const t = await this.getOne(user, id);
    if (t.ownerId !== user.id && user.role !== UserRole.Driver) {
      throw new ForbiddenException('Only operator can toggle sharing');
    }
    if (!enabled && t.status !== TripStatus.Delivered) {
      throw new BadRequestException(
        'Live sharing can only be disabled after delivery is marked complete',
      );
    }
    return this.prisma.trip.update({
      where: { id },
      data: { liveSharingEnabled: enabled },
    });
  }

  async updateLocation(
    user: User,
    id: string,
    lat: number,
    lng: number,
    etaMinutes?: number,
  ) {
    const t = await this.getOne(user, id);
    if (t.ownerId !== user.id) throw new ForbiddenException();
    if (!t.liveSharingEnabled) {
      throw new BadRequestException('Enable live sharing first');
    }
    if (t.status === TripStatus.Delivered) {
      throw new BadRequestException('Trip already delivered');
    }
    return this.prisma.trip.update({
      where: { id },
      data: { lastLat: lat, lastLng: lng, lastEtaMinutes: etaMinutes ?? null },
    });
  }

  async advanceStatus(user: User, id: string) {
    const t = await this.getOne(user, id);
    if (t.ownerId !== user.id) throw new ForbiddenException();
    const idx = ORDER.indexOf(t.status);
    if (idx < 0 || idx >= ORDER.length - 1) {
      throw new BadRequestException('Cannot advance status');
    }
    const next = ORDER[idx + 1];
    if (next === TripStatus.DriverEnRoute) {
      await this.prisma.contract.update({
        where: { id: t.contractId },
        data: { ownerEnRouteAt: new Date() },
      });
    }
    const m = MILESTONE[next];
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.trip.update({
        where: { id },
        data: { status: next },
      });
      if (m) {
        await tx.tripMilestone.create({
          data: { tripId: id, type: m },
        });
      }
      return updated;
    });
  }

  async confirmPickup(user: User, id: string, photoUrl?: string) {
    const t = await this.getOne(user, id);
    if (t.ownerId !== user.id) throw new ForbiddenException();
    const dep = await this.prisma.escrowPayment.findFirst({
      where: { contractId: t.contractId, kind: 'deposit' },
    });
    if (!dep || dep.status !== EscrowStatus.DepositHeld) {
      throw new BadRequestException(
        'Deposit must be received (held) before pickup confirmation',
      );
    }
    await this.payments.releaseDepositAfterPickup(t.contractId);
    return this.prisma.trip.update({
      where: { id },
      data: {
        ownerPickupConfirmedAt: new Date(),
        pickupPhotoUrl: photoUrl ?? null,
        status: TripStatus.CargoLoaded,
      },
    });
  }

  async confirmDeliverySeeker(user: User, id: string) {
    const t = await this.getOne(user, id);
    if (t.seekerId !== user.id) throw new ForbiddenException();
    await this.payments.payBalanceSimulated(user, t.contractId);
    await this.payments.completeBalance(t.contractId);
    const now = new Date();
    const partial = await this.prisma.trip.update({
      where: { id },
      data: { seekerDeliveryConfirmedAt: now },
    });
    await this.notify.notify(
      t.ownerId,
      'Delivery confirmed',
      'Load seeker confirmed delivery.',
    );
    return this.maybeMarkDelivered(id);
  }

  async confirmDeliveryOwner(user: User, id: string) {
    const t = await this.getOne(user, id);
    if (t.ownerId !== user.id) throw new ForbiddenException();
    await this.prisma.trip.update({
      where: { id },
      data: { ownerDeliveryConfirmedAt: new Date() },
    });
    return this.maybeMarkDelivered(id);
  }

  private async maybeMarkDelivered(tripId: string) {
    const t = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (
      t?.seekerDeliveryConfirmedAt &&
      t.ownerDeliveryConfirmedAt &&
      t.status !== TripStatus.Delivered
    ) {
      return this.prisma.trip.update({
        where: { id: tripId },
        data: { status: TripStatus.Delivered, liveSharingEnabled: false },
      });
    }
    return t;
  }
}
