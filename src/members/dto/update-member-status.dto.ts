import { IsEnum, IsOptional, IsDateString } from 'class-validator';
import { MemberStatus } from '../entities/member.entity';

export class UpdateMemberStatusDto {
  @IsEnum(MemberStatus) status!: MemberStatus;
  @IsDateString() @IsOptional() pause_start?: string;
  @IsDateString() @IsOptional() resume_date?: string;
}
