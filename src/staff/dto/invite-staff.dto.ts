import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
import { StaffRole } from '../entities/staff-user.entity';

export class InviteStaffDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  full_name!: string;

  @IsEnum(StaffRole)
  role!: StaffRole;
}
