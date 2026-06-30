import { IsString, Length, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @Length(6, 6)
  otp!: string;

  @IsString()
  @MinLength(8)
  new_password!: string;
}
