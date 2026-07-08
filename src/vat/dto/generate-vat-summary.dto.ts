import { IsUUID, IsEnum, IsDateString } from 'class-validator';
import { PeriodType } from '../entities/vat-period-summary.entity';

export class GenerateVatSummaryDto {
  @IsUUID()
  gym_id!: string;

  @IsEnum(PeriodType)
  period_type!: PeriodType;

  // first day of the period, e.g. "2026-07-01"
  @IsDateString()
  period_start!: string;
}
