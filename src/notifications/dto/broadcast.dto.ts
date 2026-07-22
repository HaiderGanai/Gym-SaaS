import {
  IsArray, IsOptional, IsString, IsUUID, MaxLength,
} from 'class-validator';

export class BroadcastDto {
  @IsUUID()
  gym_id!: string;

  // omit to broadcast to every active member of the gym
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  member_ids?: string[];

  @IsString()
  @MaxLength(150)
  title!: string;

  @IsString()
  body!: string;
}
