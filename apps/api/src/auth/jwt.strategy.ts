import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ERROR_CODES } from '@ospm/shared';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { env } from '../common/config';
import { AppException } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import type { AuthUser } from '../common/decorators';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: env.jwtSecret,
    });
  }

  async validate(payload: { sub: string }): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({ where: { id: BigInt(payload.sub) } });
    if (!user || !user.isActive) throw new AppException(401, ERROR_CODES.UNAUTHORIZED, 'Tài khoản không khả dụng');
    return { id: user.id, email: user.email, displayName: user.displayName, systemRole: user.systemRole as any };
  }
}
