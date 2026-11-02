import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { env, REFRESH_COOKIE } from '../common/config';
import { AuthUser, CurrentUser, Public } from '../common/decorators';
import { AuthService } from './auth.service';
import { ChangePasswordDto, LoginDto } from './auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  private setCookie(res: Response, token: string, expires: Date) {
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.nodeEnv === 'production',
      path: '/api/v1/auth',
      expires,
    });
  }

  @Public() @Post('login') @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.login(dto.email, dto.password);
    this.setCookie(res, r.refresh.token, r.refresh.expiresAt);
    return { accessToken: r.accessToken, user: r.user };
  }

  @Public() @Post('refresh') @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.refresh(req.cookies?.[REFRESH_COOKIE]);
    this.setCookie(res, r.refresh.token, r.refresh.expiresAt);
    return { accessToken: r.accessToken, user: r.user };
  }

  @Public() @Post('logout') @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  @Post('change-password') @HttpCode(200)
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user.id, dto.currentPassword, dto.newPassword);
  }
}
