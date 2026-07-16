import { IsString, IsOptional, MaxLength, IsObject, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

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

  // core theme colors — validated hex, stored inside branding
  @IsString()
  @IsOptional()
  @Matches(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/, { message: 'primary_color must be a hex color like #111827' })
  primary_color?: string;

  @IsString()
  @IsOptional()
  @Matches(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/, { message: 'secondary_color must be a hex color like #6B7280' })
  secondary_color?: string;

  @IsString()
  @IsOptional()
  @Matches(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/, { message: 'accent must be a hex color like #F59E0B' })
  accent?: string;

  // theme blob for the org's app (colors, fonts, sizes…) — shape owned by frontend.
  // Arrives as a JSON string on multipart requests (logo upload) — parse it.
  @Transform(({ value }) => (typeof value === 'string' ? JSON.parse(value) : value))
  @IsObject()
  @IsOptional()
  branding?: Record<string, unknown>;
}
