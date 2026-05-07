import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DisputeStatus, User, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SmsService } from '../integrations/sms.service';
import { EmailService } from '../integrations/email.service';
import { CreateDisputeDto } from './dto/create-dispute.dto';

@Injectable()
export class DisputesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: NotificationsService,
    private readonly sms: SmsService,
    private readonly email: EmailService,
  ) {}

  async create(user: User, dto: CreateDisputeDto) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: dto.tripId },
      include: { contract: true, seeker: true, owner: true },
    });
    if (!trip) throw new NotFoundException();
    if (trip.seekerId !== user.id && trip.ownerId !== user.id) {
      throw new ForbiddenException();
    }
    const dispute = await this.prisma.$transaction(async (tx) => {
      const d = await tx.dispute.create({
        data: {
          tripId: trip.id,
          contractId: trip.contractId,
          openedById: user.id,
          category: dto.category,
          description: dto.description,
          status: DisputeStatus.Open,
        },
      });
      if (dto.imageUrl) {
        await tx.disputeEvidence.create({
          data: { disputeId: d.id, imageUrl: dto.imageUrl },
        });
      }
      return d;
    });

    const otherId = trip.seekerId === user.id ? trip.ownerId : trip.seekerId;
    await this.notify.notify(
      otherId,
      'Dispute opened',
      `A dispute was opened for trip ${trip.id}.`,
    );
    return dispute;
  }

  async listMine(user: User) {
    return this.prisma.dispute.findMany({
      where: { openedById: user.id },
      include: { evidence: true, trip: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async adminResolve(
    admin: User,
    disputeId: string,
    body: {
      status: DisputeStatus;
      resolution: string;
      releaseTo?: 'seeker' | 'owner';
    },
  ) {
    if (admin.role !== UserRole.Admin) throw new ForbiddenException();
    const d = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: { trip: { include: { seeker: true, owner: true } } },
    });
    if (!d) throw new NotFoundException();
    const updated = await this.prisma.dispute.update({
      where: { id: disputeId },
      data: {
        status: body.status,
        resolution: body.resolution,
      },
    });
    await this.notify.notify(
      d.trip.seekerId,
      'Dispute update',
      `Dispute ${disputeId}: ${body.resolution}`,
    );
    await this.notify.notify(
      d.trip.ownerId,
      'Dispute update',
      `Dispute ${disputeId}: ${body.resolution}`,
    );
    await this.sms.send(
      d.trip.seeker.phoneE164,
      `Nibebee dispute ${disputeId} resolved: ${body.resolution}`,
    );
    await this.sms.send(
      d.trip.owner.phoneE164,
      `Nibebee dispute ${disputeId} resolved: ${body.resolution}`,
    );
    await this.email.send({
      to: d.trip.seeker.email,
      subject: 'Nibebee — dispute outcome',
      html: `<p>${body.resolution}</p>`,
    });
    await this.email.send({
      to: d.trip.owner.email,
      subject: 'Nibebee — dispute outcome',
      html: `<p>${body.resolution}</p>`,
    });
    return updated;
  }
}
