import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

// trsDomainId/evidenceCategoryId are intentionally not editable here — changing them
// after creation would silently move a template's identity out from under any
// `GET /admin/ai-prompts/active` lookups already keyed on the old domain/category.
export class UpdatePromptTemplateDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  promptName?: string;

  @IsOptional()
  @IsString()
  promptDescription?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  promptType?: string;
}
