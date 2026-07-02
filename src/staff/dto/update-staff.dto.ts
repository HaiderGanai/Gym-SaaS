import { IsEnum, IsBoolean, IsOptional } from 'class-validator';
import { StaffRole } from '../entities/staff-user.entity';

export class UpdateStaffDto {
  @IsEnum(StaffRole)
  @IsOptional()
  role?: StaffRole;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}
