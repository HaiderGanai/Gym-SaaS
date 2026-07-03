import { IsString, IsOptional, MaxLength, IsObject } from 'class-validator';

export class UpdateOrganizationDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @IsString()
  @IsOptional()
  logo_url?: string;

  @IsString()
  @IsOptional()
  @MaxLength(3)
  currency?: string;

  // theme blob for the org's app (colors, fonts, sizes…) — shape owned by frontend
  @IsObject()
  @IsOptional()
  branding?: Record<string, unknown>;
}
