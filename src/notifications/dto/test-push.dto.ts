import { IsOptional, IsString, MaxLength } from 'class-validator';

// optional overrides for POST /notifications/test-push — omit both for a canned test message
export class TestPushDto {
  @IsString()
  @MaxLength(150)
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  body?: string;
}
