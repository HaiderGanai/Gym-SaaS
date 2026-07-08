import {
  IsUUID, IsString, IsOptional, IsDateString, IsBoolean, IsIn,
} from 'class-validator';

export class CreateSubscriptionDto {
  @IsUUID()
  member_id!: string;

  @IsUUID()
  plan_id!: string;

  // promo code entered at the desk — resolved against the plan's gym
  @IsString()
  @IsOptional()
  discount_code?: string;

  // defaults to today
  @IsDateString()
  @IsOptional()
  start_date?: string;

  // cash already collected at the desk → first invoice is created as paid
  @IsBoolean()
  @IsOptional()
  mark_paid?: boolean;

  @IsIn(['cash', 'card', 'other'])
  @IsOptional()
  payment_method?: string;
}
