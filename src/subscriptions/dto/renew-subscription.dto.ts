import { IsBoolean, IsOptional, IsIn } from 'class-validator';

export class RenewSubscriptionDto {
  @IsBoolean()
  @IsOptional()
  mark_paid?: boolean;

  @IsIn(['cash', 'card', 'other'])
  @IsOptional()
  payment_method?: string;
}
