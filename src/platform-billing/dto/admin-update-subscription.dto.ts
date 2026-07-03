import { IsEnum, IsInt, Min, IsOptional } from 'class-validator';
import { SubscriptionStatus } from '../entities/subscription-status.enum';

// super_admin support tooling: comp / extend / force a status
export class AdminUpdateSubscriptionDto {
  @IsEnum(SubscriptionStatus)
  @IsOptional()
  status?: SubscriptionStatus;

  // pushes current_period_end forward and re-activates (comp an org)
  @IsInt()
  @Min(1)
  @IsOptional()
  extend_days?: number;
}
