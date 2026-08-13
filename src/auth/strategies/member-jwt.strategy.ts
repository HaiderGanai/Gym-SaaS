import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { MemberJwtPayload } from '../../common/interfaces/jwt-payload.interface';

@Injectable()
export class MemberJwtStrategy extends PassportStrategy(Strategy, 'member-jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET')!,
    });
  }

  validate(payload: MemberJwtPayload): MemberJwtPayload {
    // staff tokens carry `role`; reject them here so a staff JWT can't pass member guards
    if ('role' in (payload as object)) throw new UnauthorizedException();
    // QR tokens (class/entry/desk check-in) carry a `typ` discriminator and no session
    // fields — reject them so a printed/scanned QR can't be replayed as a bearer session token
    if ('typ' in (payload as object)) throw new UnauthorizedException();
    return payload;
  }
}
