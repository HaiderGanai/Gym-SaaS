import { IsString, IsOptional } from 'class-validator';

export class UpdateMemberDto {
  @IsString() @IsOptional() full_name?: string;
  @IsString() @IsOptional() phone?: string;
  @IsString() @IsOptional() photo_url?: string;
}
