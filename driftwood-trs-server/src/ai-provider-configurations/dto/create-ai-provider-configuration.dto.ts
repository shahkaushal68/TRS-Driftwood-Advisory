import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
} from 'class-validator';

export class CreateAiProviderConfigurationDto {
  @IsString()
  @IsNotEmpty()
  providerName!: string;

  @IsString()
  @IsNotEmpty()
  providerType!: string;

  @IsOptional()
  @IsString()
  gatewayType?: string;

  @IsUrl({ require_tld: false })
  baseUrl!: string;

  @IsString()
  @IsNotEmpty()
  apiKey!: string;

  @IsString()
  @IsNotEmpty()
  defaultModel!: string;

  @IsOptional()
  @IsString()
  fallbackModel?: string;

  @IsString()
  @IsNotEmpty()
  environment!: string;

  @IsString()
  @IsNotEmpty()
  responseFormat!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(600)
  timeoutSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200_000)
  maxTokens?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  supportsMultipleModels?: boolean;

  @IsOptional()
  @IsBoolean()
  supportsFallback?: boolean;
}
