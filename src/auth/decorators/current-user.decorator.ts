import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { StaffJwtPayload, MemberJwtPayload } from '../../common/interfaces/jwt-payload.interface';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): StaffJwtPayload | MemberJwtPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
