import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreatePromptVersionDto {
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
