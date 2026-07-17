import { IsString } from 'class-validator';

export class CheckinDto {
  @IsString()
  qr_token!: string;
}
