import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

const VALID_SUFFICIENCY_RATINGS = [
  'strong',
  'partial',
  'insufficient',
  'not_relevant',
  'needs_human_followup',
] as const;

export class CreateFindingDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title!: string;

  @IsString()
  @IsNotEmpty()
  body!: string;

  @IsOptional()
  @IsIn(VALID_SUFFICIENCY_RATINGS)
  sufficiencyRating?: string;
}
