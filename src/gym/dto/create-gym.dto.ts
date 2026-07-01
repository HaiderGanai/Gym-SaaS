import {
  IsString, IsOptional, IsUUID, IsEnum, IsNumber, IsBoolean, Min, Max, MaxLength,
} from 'class-validator';
import { TaxMode } from '../entities/gym.entity';

export class CreateGymDto {
  @IsUUID()
  @IsOptional()
  organization_id?: string;

  @IsString()
  @MaxLength(100)
  name!: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  timezone?: string;

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
