import { IsIn } from 'class-validator';

const VALID_SUFFICIENCY_RATINGS = [
  'strong',
  'partial',
  'insufficient',
  'not_relevant',
  'needs_human_followup',
] as const;

const VALID_VALIDATION_STATUSES = ['in_review', 'validated', 'rejected'] as const;

export class SetSufficiencyDto {
  @IsIn(VALID_SUFFICIENCY_RATINGS)
  sufficiencyRating!: string;

  @IsIn(VALID_VALIDATION_STATUSES)
  analystValidationStatus!: string;
}
