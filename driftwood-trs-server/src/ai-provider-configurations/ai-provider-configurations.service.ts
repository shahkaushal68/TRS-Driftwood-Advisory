import { randomUUID } from 'crypto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import { db } from '../db';
import { decryptSecret, encryptSecret, lastFourOf } from '../libs/encryption';
import {
  AiProviderConfigurationsRepository,
  type AiProviderConfigurationRow,
} from './ai-provider-configurations.repository';
import type {
  DecryptedAiProviderConfiguration,
  SanitizedAiProviderConfiguration,
} from './ai-provider-configurations.types';
import type { CreateAiProviderConfigurationDto } from './dto/create-ai-provider-configuration.dto';
import type { UpdateAiProviderConfigurationDto } from './dto/update-ai-provider-configuration.dto';
import { testOpenRouterConnection } from './providers/openrouter-connection-tester';

export interface TestConnectionResult {
  connectionStatus: string;
  message: string;
  lastConnectionTestAt: Date | null;
}

function sanitize(row: AiProviderConfigurationRow): SanitizedAiProviderConfiguration {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { apiKey, ...rest } = row;
  return { ...rest, hasApiKey: rest.apiKeyLastFour.length > 0 };
}

@Injectable()
export class AiProviderConfigurationsService {
  private readonly logger = new Logger(AiProviderConfigurationsService.name);

  constructor(private readonly repository: AiProviderConfigurationsRepository) {}

  async list(): Promise<SanitizedAiProviderConfiguration[]> {
    const rows = await this.repository.findAll();
    return rows.map(sanitize);
  }

  /**
   * Server-internal only — the active configuration with `apiKey` decrypted, for an
   * outbound provider client (e.g. `OpenRouterClient`) to use. Never expose this over HTTP;
   * controller-facing reads must go through `list()`, which always strips the key.
   * Returns `null` when no configuration is currently active — that's an expected runtime
   * state (e.g. an admin deactivated it), not an error; callers decide how to react.
   */
  async getActiveConfigForExecution(): Promise<DecryptedAiProviderConfiguration | null> {
    const row = await this.repository.findActive();
    if (!row) return null;

    return { ...row, apiKey: decryptSecret(row.apiKey) };
  }

  async create(
    dto: CreateAiProviderConfigurationDto,
    userId: string,
  ): Promise<SanitizedAiProviderConfiguration> {
    const now = new Date();
    const encryptedApiKey = encryptSecret(dto.apiKey);
    const isActive = dto.isActive ?? false;

    const created = await db.transaction(async (tx) => {
      if (isActive) {
        await this.repository.deactivateAllExcept(null, tx);
      }

      return this.repository.insert(
        {
          id: randomUUID(),
          providerName: dto.providerName,
          providerType: dto.providerType,
          gatewayType: dto.gatewayType ?? null,
          baseUrl: dto.baseUrl,
          apiKey: encryptedApiKey,
          apiKeyLastFour: lastFourOf(dto.apiKey),
          defaultModel: dto.defaultModel,
          fallbackModel: dto.fallbackModel ?? null,
          environment: dto.environment,
          responseFormat: dto.responseFormat,
          timeoutSeconds: dto.timeoutSeconds ?? 60,
          maxTokens: dto.maxTokens ?? 4000,
          isActive,
          supportsMultipleModels: dto.supportsMultipleModels ?? false,
          supportsFallback: dto.supportsFallback ?? false,
          connectionStatus: 'not_tested',
          createdByUserId: userId,
          updatedByUserId: userId,
          createdAt: now,
          updatedAt: now,
        },
        tx,
      );
    });

    return sanitize(created);
  }

  async update(
    id: string,
    dto: UpdateAiProviderConfigurationDto,
    userId: string,
  ): Promise<SanitizedAiProviderConfiguration> {
    const existing = await this.repository.findById(id);
    if (!existing) throw new NotFoundException('AI provider configuration not found');

    const updated = await db.transaction(async (tx) => {
      if (dto.isActive === true) {
        await this.repository.deactivateAllExcept(id, tx);
      }

      const values: Partial<AiProviderConfigurationRow> = {
        updatedByUserId: userId,
        updatedAt: new Date(),
      };

      if (dto.providerName !== undefined) values.providerName = dto.providerName;
      if (dto.providerType !== undefined) values.providerType = dto.providerType;
      if (dto.gatewayType !== undefined) values.gatewayType = dto.gatewayType;
      if (dto.baseUrl !== undefined) values.baseUrl = dto.baseUrl;
      if (dto.defaultModel !== undefined) values.defaultModel = dto.defaultModel;
      if (dto.fallbackModel !== undefined) values.fallbackModel = dto.fallbackModel;
      if (dto.environment !== undefined) values.environment = dto.environment;
      if (dto.responseFormat !== undefined) values.responseFormat = dto.responseFormat;
      if (dto.timeoutSeconds !== undefined) values.timeoutSeconds = dto.timeoutSeconds;
      if (dto.maxTokens !== undefined) values.maxTokens = dto.maxTokens;
      if (dto.isActive !== undefined) values.isActive = dto.isActive;
      if (dto.supportsMultipleModels !== undefined)
        values.supportsMultipleModels = dto.supportsMultipleModels;
      if (dto.supportsFallback !== undefined) values.supportsFallback = dto.supportsFallback;

      if (dto.apiKey) {
        values.apiKey = encryptSecret(dto.apiKey);
        values.apiKeyLastFour = lastFourOf(dto.apiKey);
      }

      return this.repository.update(id, values, tx);
    });

    return sanitize(updated);
  }

  async testConnection(id: string): Promise<TestConnectionResult> {
    const config = await this.repository.findById(id);
    if (!config) throw new NotFoundException('AI provider configuration not found');

    const apiKey = decryptSecret(config.apiKey);
    const result = await testOpenRouterConnection(
      config.baseUrl,
      apiKey,
      config.defaultModel,
      config.timeoutSeconds,
      config.maxTokens,
    );

    const now = new Date();
    const connectionStatus = result.ok ? 'connected' : 'failed';

    await this.repository.update(id, {
      connectionStatus,
      lastConnectionTestResult: result.ok ? 'success' : 'failed',
      lastConnectionTestAt: now,
      lastConnectionError: result.ok ? null : result.message,
      updatedAt: now,
    });

    if (!result.ok) {
      this.logger.warn(
        `Connection test failed for provider configuration ${id}: ${result.message}`,
      );
    }

    return { connectionStatus, message: result.message, lastConnectionTestAt: now };
  }
}
