import {
  IsString, IsOptional, IsEnum, IsNumber, IsBoolean, Min, Max, MaxLength,
} from 'class-validator';
import { TaxMode, GymType } from '../entities/gym.entity';

export class UpdateGymDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  timezone?: string;

  @IsEnum(GymType)
  @IsOptional()
  type?: GymType;

  @IsEnum(TaxMode)
  @IsOptional()
  tax_mode?: TaxMode;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(100)
  default_tax_rate?: number;

  @IsBoolean()
  @IsOptional()
  tax_inclusive?: boolean;

  @IsString()
  @IsOptional()
  vat_number?: string;
}
