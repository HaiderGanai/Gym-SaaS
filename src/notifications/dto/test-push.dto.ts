import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

// optional overrides for POST /notifications/test-push — omit all for a canned test message
export class TestPushDto {
  @IsString()
  @MaxLength(150)
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  body?: string;

  // pass to also test gym-branded icon/badge (must be one of the member's affiliated gyms)
  @IsUUID()
  @IsOptional()
  gym_id?: string;
}
