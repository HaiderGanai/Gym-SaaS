import { IsEmail, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class RegisterMemberDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  full_name!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsUUID()
  gym_id!: string;
}
