import { SetMetadata } from '@nestjs/common';
import { StaffRole } from '../../staff/entities/staff-user.entity';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: StaffRole[]) => SetMetadata(ROLES_KEY, roles);
