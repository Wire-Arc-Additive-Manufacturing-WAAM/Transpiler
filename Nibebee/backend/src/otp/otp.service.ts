import { Injectable, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

const OTP_TTL_MIN = 10;

@Injectable()
export class OtpService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeCode(raw: string): string {
    return raw.replace(/\s/g, '');
  }

  async issue(phoneE164: string, purpose: string, userId?: string) {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const codeHash = await bcrypt.hash(code, 8);
    const expiresAt = new Date(Date.now() + OTP_TTL_MIN * 60 * 1000);
    await this.prisma.otpChallenge.create({
      data: {
        phoneE164,
        purpose,
        codeHash,
        expiresAt,
        userId: userId ?? null,
      },
    });
    return code;
  }

  async verify(
    phoneE164: string,
    purpose: string,
    code: string,
  ): Promise<boolean> {
    const normalized = this.normalizeCode(code);
    const row = await this.prisma.otpChallenge.findFirst({
      where: {
        phoneE164,
        purpose,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!row) return false;
    const ok = await bcrypt.compare(normalized, row.codeHash);
    if (!ok) return false;
    await this.prisma.otpChallenge.update({
      where: { id: row.id },
      data: { consumedAt: new Date() },
    });
    return true;
  }

  async verifyOrThrow(phoneE164: string, purpose: string, code: string) {
    const ok = await this.verify(phoneE164, purpose, code);
    if (!ok) throw new BadRequestException('Invalid or expired OTP');
  }
}
