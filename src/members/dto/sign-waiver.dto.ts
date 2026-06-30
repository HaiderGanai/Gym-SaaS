import { IsOptional, IsString, IsUUID } from 'class-validator';

export class SignWaiverDto {
  @IsUUID()
  gym_id!: string;

  @IsString()
  signature_url!: string;

  @IsString()
  @IsOptional()
  document_url?: string;
}
