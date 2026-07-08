import {
  IsUUID, IsString, IsEnum, IsNumber, IsOptional, IsInt, IsDateString, Min, Max, MaxLength,
} from 'class-validator';
import { DiscountType } from '../entities/discount.entity';

export class CreateDiscountDto {
  @IsUUID()
  gym_id!: string;

  @IsString()
  @MaxLength(50)
  code!: string;

  @IsEnum(DiscountType)
  type!: DiscountType;

  // percentage: 0–100; fixed: amount off in gym currency
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  value!: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  max_uses?: number;

  @IsDateString()
  @IsOptional()
  expires_at?: string;
}
