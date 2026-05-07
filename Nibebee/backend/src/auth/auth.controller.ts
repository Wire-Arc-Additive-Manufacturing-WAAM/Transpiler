import { Body, Controller, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { REFRESH_TOKEN_COOKIE } from './auth.constants';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Throttle({ default: { ttl: 60, limit: 20 } })
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.auth.register(dto, res);
  }

  @Throttle({ default: { ttl: 60, limit: 30 } })
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.auth.login(dto, res);
  }

  @Throttle({ default: { ttl: 60, limit: 60 } })
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined;
    return this.auth.refreshTokens(token, res);
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined;
    res.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/' });
    return this.auth.logout(token);
  }
}
