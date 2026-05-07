import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AvailabilityStatus,
  ContractStatus,
  LorryListing,
  Prisma,
  SubscriptionPlanType,
  SubscriptionStatus,
  User,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateListingDto } from './dto/create-listing.dto';
import { SearchListingsDto } from './dto/search-listings.dto';

@Injectable()
export class ListingsService {
  constructor(private readonly prisma: PrismaService) {}

  private toPublicListing(
    row: LorryListing & {
      owner: Pick<User, 'id' | 'firstName' | 'averageRating' | 'ratingCount'>;
    },
    opts?: { distanceKm?: number },
  ) {
    return {
      id: row.id,
      photoUrl: row.photoUrl,
      numberPlate: row.numberPlate,
      lorryType: row.lorryType,
      capacityTons: row.capacityTons,
      cityRegion: row.cityRegion,
      distanceKm: opts?.distanceKm,
      pricingMode: row.pricingMode,
      perKmRate: row.perKmRate,
      flatRouteRates: row.flatRouteRates,
      supportedRoutes: row.supportedRoutes,
      basePriceHint: row.basePriceHint,
      availability: row.availability,
      verifiedBlueBadge: row.verifiedBlueBadge,
      boostExpiresAt: row.boostExpiresAt,
      subscriptionTier: row.subscriptionTier,
      ownerFirstName: row.owner.firstName,
      ownerRating: row.owner.averageRating,
      ownerRatingCount: row.owner.ratingCount,
    };
  }

  async create(owner: User, dto: CreateListingDto) {
    if (owner.role !== UserRole.LorryOwner) {
      throw new ForbiddenException('Only lorry owners can create listings');
    }
    const listing = await this.prisma.lorryListing.create({
      data: {
        ownerId: owner.id,
        photoUrl: dto.photoUrl,
        numberPlate: dto.numberPlate,
        lorryType: dto.lorryType,
        capacityTons: dto.capacityTons,
        cityRegion: dto.cityRegion,
        latitude: dto.latitude,
        longitude: dto.longitude,
        pricingMode: dto.pricingMode,
        perKmRate: dto.perKmRate,
        flatRouteRates: dto.flatRouteRates
          ? (dto.flatRouteRates as Prisma.InputJsonValue)
          : undefined,
        supportedRoutes: dto.supportedRoutes,
        basePriceHint: dto.basePriceHint,
      },
      include: { owner: true },
    });
    return this.toPublicListing(listing);
  }

  async search(query: SearchListingsDto) {
    const where: Prisma.LorryListingWhereInput = { isActive: true };
    if (query.availability) {
      where.availability = query.availability;
    } else {
      where.availability = { not: AvailabilityStatus.Unavailable };
    }
    if (query.lorryType) where.lorryType = query.lorryType;
    if (query.minCapacity != null || query.maxCapacity != null) {
      where.capacityTons = {};
      if (query.minCapacity != null) {
        where.capacityTons.gte = query.minCapacity;
      }
      if (query.maxCapacity != null) {
        where.capacityTons.lte = query.maxCapacity;
      }
    }
    if (query.minPrice != null || query.maxPrice != null) {
      where.basePriceHint = {};
      if (query.minPrice != null) where.basePriceHint.gte = query.minPrice;
      if (query.maxPrice != null) where.basePriceHint.lte = query.maxPrice;
    }
    if (query.verifiedOnly) {
      where.verifiedBlueBadge = true;
    }
    const andParts: Prisma.LorryListingWhereInput[] = [];
    if (query.origin || query.destination) {
      const routeOr: Prisma.LorryListingWhereInput[] = [];
      if (query.origin) {
        routeOr.push({ supportedRoutes: { has: query.origin } });
      }
      if (query.destination) {
        routeOr.push({ supportedRoutes: { has: query.destination } });
      }
      if (routeOr.length) {
        andParts.push({ OR: routeOr });
      }
    }
    if (andParts.length) {
      where.AND = andParts;
    }

    const rows = await this.prisma.lorryListing.findMany({
      where,
      include: {
        owner: {
          select: {
            id: true,
            firstName: true,
            averageRating: true,
            ratingCount: true,
          },
        },
      },
    });

    const ownerIds = [...new Set(rows.map((r) => r.ownerId))];
    const subs = await this.prisma.subscription.findMany({
      where: {
        userId: { in: ownerIds },
        status: SubscriptionStatus.Active,
        plan: SubscriptionPlanType.LorryOwnerMonthly,
      },
    });
    const subscribed = new Set(subs.map((s) => s.userId));

    const scored: { row: (typeof rows)[0]; score: number }[] = rows.map(
      (row) => {
        let score = 0;
        const now = new Date();
        if (row.boostExpiresAt && row.boostExpiresAt > now) score += 1000;
        if (subscribed.has(row.ownerId)) score += 100;
        if (row.subscriptionTier !== 'free') score += 50;
        if (query.minStars && row.owner.averageRating < query.minStars) {
          return { row, score: -1 };
        }
        score += row.owner.averageRating;
        return { row, score };
      },
    );

    const filtered = scored.filter((s) => s.score >= 0);
    filtered.sort((a, b) => b.score - a.score);

    return filtered.map((s) => this.toPublicListing(s.row));
  }

  async mine(owner: User) {
    if (owner.role !== UserRole.LorryOwner) return [];
    const rows = await this.prisma.lorryListing.findMany({
      where: { ownerId: owner.id },
      include: {
        owner: {
          select: {
            id: true,
            firstName: true,
            averageRating: true,
            ratingCount: true,
          },
        },
      },
    });
    return rows.map((r) => this.toPublicListing(r));
  }

  async findById(id: string) {
    const row = await this.prisma.lorryListing.findUnique({
      where: { id },
      include: {
        owner: {
          select: {
            id: true,
            firstName: true,
            averageRating: true,
            ratingCount: true,
          },
        },
      },
    });
    if (!row || !row.isActive) throw new NotFoundException();
    return this.toPublicListing(row);
  }

  async contactsForListing(viewer: User, listingId: string) {
    const listing = await this.prisma.lorryListing.findUnique({
      where: { id: listingId },
      include: { owner: true },
    });
    if (!listing) throw new NotFoundException();
    const booking = await this.prisma.bookingRequest.findFirst({
      where: {
        listingId,
        OR: [{ seekerId: viewer.id }, { ownerId: viewer.id }],
      },
      include: { contract: { include: { seeker: true, owner: true } } },
    });
    const contract = booking?.contract;
    if (!contract || contract.status !== ContractStatus.Signed) {
      throw new ForbiddenException('Contacts available only after signed contract');
    }
    if (viewer.id === listing.ownerId) {
      return {
        seeker: {
          firstName: contract.seeker.firstName,
          lastName: contract.seeker.lastName,
          phoneE164: contract.seeker.phoneE164,
          email: contract.seeker.email,
          pickupAddress: contract.pickupAddress,
          destinationAddress: contract.destinationAddress,
        },
      };
    }
    if (viewer.id === contract.seekerId) {
      return {
        owner: {
          firstName: contract.owner.firstName,
          lastName: contract.owner.lastName,
          phoneE164: contract.owner.phoneE164,
          email: contract.owner.email,
          whatsappUrl: `https://wa.me/${contract.owner.phoneE164.replace('+', '')}`,
        },
      };
    }
    throw new ForbiddenException();
  }

  async setAvailability(owner: User, id: string, status: AvailabilityStatus) {
    const listing = await this.prisma.lorryListing.findUnique({
      where: { id },
    });
    if (!listing || listing.ownerId !== owner.id) {
      throw new ForbiddenException('Listing not found');
    }
    return this.prisma.lorryListing.update({
      where: { id },
      data: { availability: status },
    });
  }
}
