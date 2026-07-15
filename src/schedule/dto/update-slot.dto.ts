import {
  IsUUID, IsString, IsNotEmpty, IsOptional, IsInt, Min, IsDateString,
} from 'class-validator';

// "this occurrence only" edits — never touches the template or sibling slots
export class UpdateSlotDto {
  @IsOptional()
  @IsUUID()
  instructor_id?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  activity_name?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsDateString()
  starts_at?: string;

  @IsOptional()
  @IsDateString()
  ends_at?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  booking_window_hours?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  cancellation_cutoff_hours?: number;
}
