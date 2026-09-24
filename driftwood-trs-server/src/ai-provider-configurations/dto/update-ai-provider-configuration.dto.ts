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

export class UpdateAiProviderConfigurationDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  providerName?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  providerType?: string;

  @IsOptional()
  @IsString()
  gatewayType?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  baseUrl?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  apiKey?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  defaultModel?: string;

  @IsOptional()
  @IsString()
  fallbackModel?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  environment?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  responseFormat?: string;

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
