import { IsString, IsNumber, Min, MaxLength, IsOptional, IsBoolean } from 'class-validator';

export class UpdatePlanDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  // changing this creates a new Stripe Price and archives the old one
  // (existing subscriptions keep their old price until they change plan)
  @IsNumber()
  @Min(0)
  @IsOptional()
  price_per_branch?: number;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}
