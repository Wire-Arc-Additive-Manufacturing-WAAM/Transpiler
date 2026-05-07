import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';

@Injectable()
export class UsersService {
  sanitize(user: User) {
    const { passwordHash, businessPin, ...rest } = user;
    return rest;
  }
}
