import { IsIn, IsOptional } from 'class-validator';

export class MarkPaidDto {
  // manual billing v1 — how the front desk collected
  @IsIn(['cash', 'card', 'other'])
  @IsOptional()
  payment_method?: string;
}
