import {
  IsNumber, IsOptional, IsInt, IsDateString, IsBoolean, Min,
} from 'class-validator';

export class UpdateDiscountDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  value?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  max_uses?: number;

  @IsDateString()
  @IsOptional()
  expires_at?: string;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}
