import { Module } from '@nestjs/common';

import { AiProviderConfigurationsController } from './ai-provider-configurations.controller';
import { AiProviderConfigurationsRepository } from './ai-provider-configurations.repository';
import { AiProviderConfigurationsService } from './ai-provider-configurations.service';
import { OpenRouterClient } from './providers/openrouter-client';

@Module({
  controllers: [AiProviderConfigurationsController],
  providers: [
    AiProviderConfigurationsService,
    AiProviderConfigurationsRepository,
    OpenRouterClient,
  ],
  // Exported so AiReviewModule can inject both: `OpenRouterClient` for the actual provider
  // call, and `AiProviderConfigurationsService` directly to snapshot `provider`/`model` onto
  // an `ai_review_request` row before that call happens — mirrors how `AiPromptsRepository`
  // and `AiReviewRepository` are exported from their own modules.
  exports: [OpenRouterClient, AiProviderConfigurationsService],
})
export class AiProviderConfigurationsModule {}
