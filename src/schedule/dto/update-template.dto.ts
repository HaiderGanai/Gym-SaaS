import {
  IsUUID, IsString, IsNotEmpty, IsOptional, IsInt, Min, IsBoolean, IsDateString,
} from 'class-validator';

export class UpdateTemplateDto {
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
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  rrule?: string;

  @IsOptional()
  @IsInt()
  @Min(5)
  duration_minutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  booking_window_hours?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  cancellation_cutoff_hours?: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  // true → propagate changes to future slots of this template
  // ("all future occurrences"; omit/false = template only, existing slots untouched)
  @IsOptional()
  @IsBoolean()
  apply_to_future?: boolean;

  // extend/set how far ahead slots are materialized (replaces POST :id/generate)
  @IsOptional()
  @IsDateString()
  generate_until?: string;
}
