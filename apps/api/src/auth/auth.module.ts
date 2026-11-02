import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ACCESS_TOKEN_TTL, env } from '../common/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

@Global()
@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({ useFactory: () => ({ secret: env.jwtSecret, signOptions: { expiresIn: ACCESS_TOKEN_TTL } }) }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
