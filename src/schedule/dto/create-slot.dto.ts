import {
  IsUUID, IsString, IsNotEmpty, IsOptional, IsInt, Min, IsDateString,
} from 'class-validator';

// one-off custom slot (no template)
export class CreateSlotDto {
  @IsUUID()
  gym_id!: string;

  @IsUUID()
  instructor_id!: string;

  @IsString()
  @IsNotEmpty()
  activity_name!: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsDateString()
  starts_at!: string;

  @IsDateString()
  ends_at!: string;

  @IsInt()
  @Min(1)
  capacity!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  booking_window_hours?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  cancellation_cutoff_hours?: number;
}
