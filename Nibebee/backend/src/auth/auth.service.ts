import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { EntityType, User, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import {
  ACCESS_TOKEN_EXPIRES,
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_DAYS,
} from './auth.constants';
import { AccessTokenPayload } from './jwt-payload.interface';
import { randomBytes, createHash } from 'crypto';
import { Response } from 'express';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  private async issueRefreshCookie(userId: string, res: Response) {
    const raw = randomBytes(48).toString('hex');
    const tokenHash = this.hashToken(raw);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_DAYS);
    await this.prisma.refreshToken.create({
      data: { userId, tokenHash, expiresAt },
    });
    const isProd = this.config.get('NODE_ENV') === 'production';
    res.cookie(REFRESH_TOKEN_COOKIE, raw, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'strict' : 'lax',
      maxAge: REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000,
      path: '/',
    });
  }

  private signAccess(user: User) {
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    return this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: ACCESS_TOKEN_EXPIRES,
    });
  }

  async register(dto: RegisterDto, res: Response) {
    if (dto.role === UserRole.Admin || dto.role === UserRole.Driver) {
      throw new ConflictException('Invalid role for self-registration');
    }
    if (dto.role === UserRole.LoadSeeker) {
      if (dto.entityType === EntityType.Business) {
        if (!dto.businessName || !dto.businessPin) {
          throw new ConflictException('Business accounts require name and PIN');
        }
      }
    }
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        role: dto.role,
        country: dto.country,
        phoneE164: dto.phoneE164,
        firstName: dto.firstName,
        lastName: dto.lastName,
        entityType: dto.entityType ?? null,
        businessName: dto.businessName ?? null,
        businessPin: dto.businessPin ?? null,
      },
    });
    const accessToken = await this.signAccess(user);
    await this.issueRefreshCookie(user.id, res);
    return { accessToken, user: this.stripUser(user) };
  }

  async login(dto: LoginDto, res: Response) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user?.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (user.isSuspended) {
      throw new UnauthorizedException('Account suspended');
    }
    const accessToken = await this.signAccess(user);
    await this.issueRefreshCookie(user.id, res);
    return { accessToken, user: this.stripUser(user) };
  }

  async refreshTokens(refreshToken: string | undefined, res: Response) {
    if (!refreshToken) {
      throw new UnauthorizedException('Missing refresh token');
    }
    const tokenHash = this.hashToken(refreshToken);
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!record || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    await this.prisma.refreshToken.delete({ where: { id: record.id } });
    const accessToken = await this.signAccess(record.user);
    await this.issueRefreshCookie(record.user.id, res);
    return { accessToken, user: this.stripUser(record.user) };
  }

  async logout(refreshToken: string | undefined) {
    if (!refreshToken) return { ok: true };
    const tokenHash = this.hashToken(refreshToken);
    await this.prisma.refreshToken.deleteMany({ where: { tokenHash } });
    return { ok: true };
  }

  stripUser(user: User) {
    const { passwordHash, ...rest } = user;
    return rest;
  }
}
