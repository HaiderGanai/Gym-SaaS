import { IsUUID, IsInt, Min, Max } from 'class-validator';

export class CheckoutDto {
  @IsUUID()
  plan_id!: string;

  @IsInt()
  @Min(1)
  @Max(100)
  branch_count!: number;
}
