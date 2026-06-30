import { IsEmail, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class InviteMemberDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  full_name!: string;

  @IsUUID()
  gym_id!: string;

  @IsString()
  @IsOptional()
  phone?: string;
}
