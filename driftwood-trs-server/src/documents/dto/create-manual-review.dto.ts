import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  COLOR_INDICATORS,
  MANUAL_REVIEW_STATUSES,
  RECOMMENDED_ANALYST_ACTIONS,
  REVIEWER_CONFIDENCE_LEVELS,
  SUFFICIENCY_RATINGS,
} from '../constants/evidence';

const VALID_REVIEW_STATUSES = Object.values(MANUAL_REVIEW_STATUSES);
const VALID_SUFFICIENCY_RATINGS = Object.values(SUFFICIENCY_RATINGS);
const VALID_CONFIDENCE_LEVELS = Object.values(REVIEWER_CONFIDENCE_LEVELS);
const VALID_COLOR_INDICATORS = Object.values(COLOR_INDICATORS);
const VALID_RECOMMENDED_ACTIONS = Object.values(RECOMMENDED_ANALYST_ACTIONS);

export class CreateManualReviewDto {
  @IsNotEmpty()
  @IsString()
  documentId!: string;

  @IsOptional()
  @IsIn(VALID_REVIEW_STATUSES)
  reviewStatus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  executiveSummary?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  documentQualityReview?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  readinessFindings?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  evidenceGaps?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  humanValidationQuestions?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  suggestedNextSteps?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  draftAnalystFinding?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  limitations?: string;

  @IsOptional()
  @IsIn(VALID_SUFFICIENCY_RATINGS)
  evidenceSufficiency?: string;

  @IsOptional()
  @IsIn(VALID_CONFIDENCE_LEVELS)
  reviewerConfidence?: string;

  @IsOptional()
  @IsIn(VALID_COLOR_INDICATORS)
  primaryColorIndicator?: string;

  @IsOptional()
  @IsIn(VALID_RECOMMENDED_ACTIONS)
  recommendedAnalystAction?: string;
}
