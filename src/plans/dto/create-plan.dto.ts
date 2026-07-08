import {
  IsUUID, IsString, IsEnum, IsNumber, IsOptional, IsBoolean, IsInt, Min, Max, MaxLength,
} from 'class-validator';
import { PlanType } from '../entities/membership-plan.entity';

export class CreatePlanDto {
  @IsUUID()
  gym_id!: string;

  @IsString()
  @MaxLength(100)
  name!: string;

  @IsEnum(PlanType)
  type!: PlanType;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price!: number;

  // free-text label shown on the plan card, e.g. "per month"
  @IsString()
  @IsOptional()
  billing_interval?: string;

  // class_pack / payg: number of classes included
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
}
