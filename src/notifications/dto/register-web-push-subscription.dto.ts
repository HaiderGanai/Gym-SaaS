import { Type } from 'class-transformer';
import {
  IsString, IsUrl, ValidateNested, IsDefined,
} from 'class-validator';

class PushKeysDto {
  @IsString()
  p256dh!: string;

  @IsString()
  auth!: string;
}

// shape of the browser's PushSubscription.toJSON() — sent as-is by the frontend
export class RegisterWebPushSubscriptionDto {
  @IsUrl({ require_tld: false })
  endpoint!: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => PushKeysDto)
  keys!: PushKeysDto;
}
