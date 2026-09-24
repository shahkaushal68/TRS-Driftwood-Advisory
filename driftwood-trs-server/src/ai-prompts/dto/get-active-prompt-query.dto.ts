import { IsIn, IsNotEmpty, IsString } from 'class-validator';

import { ALL_DOMAINS } from '../../documents/constants/evidence';

export class GetActivePromptQueryDto {
  @IsIn(ALL_DOMAINS)
  trsDomainId!: string;

  @IsString()
  @IsNotEmpty()
  evidenceCategoryId!: string;
}
