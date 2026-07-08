import {
  IsString, IsEnum, IsNumber, IsOptional, IsBoolean, IsInt, Min, Max, MaxLength,
} from 'class-validator';
import { PlanType } from '../entities/membership-plan.entity';

export class UpdatePlanDto {
  @IsString()
  @MaxLength(100)
  @IsOptional()
  name?: string;

  @IsEnum(PlanType)
  @IsOptional()
  type?: PlanType;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  price?: number;

  @IsString()
  @IsOptional()
  billing_interval?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  included_credits?: number;

  @IsBoolean()
  @IsOptional()
  is_vat_applicable?: boolean;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  @IsOptional()
  vat_rate_override?: number;

  @IsBoolean()
  @IsOptional()
  is_archived?: boolean;
}
