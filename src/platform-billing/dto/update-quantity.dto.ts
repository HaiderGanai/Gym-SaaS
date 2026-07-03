import { IsInt, Min, Max } from 'class-validator';

export class UpdateQuantityDto {
  @IsInt()
  @Min(1)
  @Max(100)
  branch_count!: number;
}
