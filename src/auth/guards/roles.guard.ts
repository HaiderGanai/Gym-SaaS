import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { StaffRole } from '../../staff/entities/staff-user.entity';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { StaffJwtPayload } from '../../common/interfaces/jwt-payload.interface';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<StaffRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as StaffJwtPayload | undefined;
    if (!user) return false;
    if (user.role === StaffRole.SUPER_ADMIN) return true;

    return required.includes(user.role);
  }
}
