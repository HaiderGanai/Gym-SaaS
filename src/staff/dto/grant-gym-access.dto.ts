import { IsUUID } from 'class-validator';

export class GrantGymAccessDto {
  @IsUUID()
  gym_id!: string;
}
