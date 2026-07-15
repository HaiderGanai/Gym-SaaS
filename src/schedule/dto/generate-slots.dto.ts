import { IsDateString } from 'class-validator';

export class GenerateSlotsDto {
  @IsDateString()
  until!: string;
}
