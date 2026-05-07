import { UserRole } from '@prisma/client';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
}
