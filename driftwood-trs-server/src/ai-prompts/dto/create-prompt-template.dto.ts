import { Type } from 'class-transformer';
import { IsIn, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';

import { ALL_DOMAINS } from '../../documents/constants/evidence';

export class CreateInitialPromptVersionDto {
  @IsString()
  @IsNotEmpty()
  promptContent!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  versionLabel?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  outputFormat?: string;

  @IsOptional()
  @IsString()
  changeSummary?: string;
}

export class CreatePromptTemplateDto {
  @IsString()
  @IsNotEmpty()
  promptName!: string;

  @IsOptional()
  @IsString()
  promptDescription?: string;

  // Required for category-scoped templates; must be omitted for the Master Transformation
  // Readiness Report template (see `AiPromptsService.createTemplate`).
  @IsOptional()
  @IsIn(ALL_DOMAINS)
  trsDomainId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  evidenceCategoryId?: string;

  @IsString()
  @IsNotEmpty()
  promptType!: string;

  /** Optionally seed the template with its first version (created as `draft`). */
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateInitialPromptVersionDto)
  initialVersion?: CreateInitialPromptVersionDto;
}
