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
    return payload;
  }
}
