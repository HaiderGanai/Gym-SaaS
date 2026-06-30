import { StaffRole } from '../../staff/entities/staff-user.entity';
import { MemberStatus } from '../../members/entities/member.entity';

export interface StaffJwtPayload {
  sub: string;
  email: string;
  role: StaffRole;
  org_id: string | null;
  gym_ids: string[];
}

export interface MemberJwtPayload {
  sub: string;
  email: string;
  gym_ids: string[];
  primary_gym_id: string;
  status: MemberStatus;
}
