import { IsString, IsEmail, MinLength, MaxLength, IsOptional } from 'class-validator';

export class OrgSignupDto {
  @IsString()
  @MaxLength(100)
  organization_name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @IsOptional()
  @MaxLength(3)
  currency?: string;
}
