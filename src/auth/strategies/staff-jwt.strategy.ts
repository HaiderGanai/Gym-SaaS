import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { StaffJwtPayload } from '../../common/interfaces/jwt-payload.interface';

@Injectable()
export class StaffJwtStrategy extends PassportStrategy(Strategy, 'staff-jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET')!,
    });
  }

  validate(payload: StaffJwtPayload): StaffJwtPayload {
    // member tokens have no `role`; reject them so a member JWT can't pass staff guards
    if (!payload.role) throw new UnauthorizedException();
    // QR tokens (class/entry/desk check-in) carry a `typ` discriminator and no session
    // fields — reject them so a printed/scanned QR can't be replayed as a bearer session token
    if ('typ' in (payload as object)) throw new UnauthorizedException();
    return payload;
  }
}
