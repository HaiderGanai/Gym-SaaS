import {
  IsUUID, IsString, IsNotEmpty, IsOptional, IsInt, Min, IsDateString,
} from 'class-validator';

export class CreateTemplateDto {
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

  @IsInt()
  @Min(1)
  capacity!: number;

  // full RFC 5545 string incl. DTSTART, e.g.
  // "DTSTART:20260720T090000Z\nRRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR"
  @IsString()
  @IsNotEmpty()
  rrule!: string;

  @IsInt()
  @Min(5)
  duration_minutes!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  booking_window_hours?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  cancellation_cutoff_hours?: number;

  // how far ahead to materialize slots right away (default: 30 days)
  @IsOptional()
  @IsDateString()
  generate_until?: string;
}
