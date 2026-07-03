import { IsString, IsEnum, IsNumber, Min, MaxLength, IsOptional } from 'class-validator';
import { PlanInterval } from '../entities/platform-plan.entity';

export class CreatePlanDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsEnum(PlanInterval)
  interval!: PlanInterval;

  // price per branch, in major currency units (e.g. 49.99)
  @IsNumber()
  @Min(0)
  price_per_branch!: number;

  @IsString()
  @IsOptional()
  @MaxLength(3)
  currency?: string;
}
