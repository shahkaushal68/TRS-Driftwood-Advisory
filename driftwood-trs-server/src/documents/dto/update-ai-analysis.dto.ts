import { IsIn, IsObject, IsOptional } from 'class-validator';

export class UpdateAiAnalysisDto {
  @IsOptional()
  @IsObject()
  rawOutput?: Record<string, unknown>;

  @IsOptional()
  @IsIn(['pass', 'review', 'failed'])
  aiVerdict?: 'pass' | 'review' | 'failed';
}
