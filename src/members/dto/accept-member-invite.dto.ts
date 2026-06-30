import { IsString, MinLength } from 'class-validator';

export class AcceptMemberInviteDto {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
