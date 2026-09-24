import { Module } from '@nestjs/common';

import { AiPromptsModule } from '../ai-prompts/ai-prompts.module';
import { AiProviderConfigurationsModule } from '../ai-provider-configurations/ai-provider-configurations.module';
import { DocumentsModule } from '../documents/documents.module';
import { UploadModule } from '../upload/upload.module';
import { AiReviewController } from './ai-review.controller';
import { AiReviewRepository } from './ai-review.repository';
import { AiReviewService } from './ai-review.service';
import { DocumentTextExtractionService } from './document-text-extraction.service';

/**
 * Owns `ai_review_request`/`ai_review_response` persistence (`AiReviewRepository`), the
 * orchestration that actually executes a review (`AiReviewService`), and the HTTP route that
 * exposes it (`AiReviewController`, `POST /documents/:id/ai-review`). `AiReviewService`
 * composes:
 *  - `DocumentsModule` for eligibility + document lookup (no duplicated eligibility logic)
 *  - `AiPromptsModule` for the active prompt template/version rows
 *  - `AiProviderConfigurationsModule` for the active provider config and the OpenRouter call
 *
 * `AiReviewController` lives here (not on `DocumentsController`) specifically to avoid a
 * circular module dependency: `AiReviewModule` already needs `DocumentsModule` for
 * `DocumentsService`, so `DocumentsModule` importing back for the controller would cycle.
 * Nest routes by path across all controllers regardless of which module declares them, so
 * `@Controller('documents')` here coexists fine with `DocumentsController`'s own `documents`
 * routes in a different module.
 */
@Module({
  imports: [DocumentsModule, AiPromptsModule, AiProviderConfigurationsModule, UploadModule],
  controllers: [AiReviewController],
  providers: [AiReviewRepository, AiReviewService, DocumentTextExtractionService],
  exports: [AiReviewRepository, AiReviewService],
})
export class AiReviewModule {}
