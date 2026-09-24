import { IsIn, IsOptional, IsString } from 'class-validator';

import { ALL_DOMAINS } from '../../documents/constants/evidence';

export class ListPromptTemplatesQueryDto {
  @IsOptional()
  @IsIn(ALL_DOMAINS)
  trsDomainId?: string;

  @IsOptional()
  @IsString()
  evidenceCategoryId?: string;
}
