import { Module } from '@nestjs/common';

import { AiPromptsModule } from '../ai-prompts/ai-prompts.module';
import { AiProviderConfigurationsModule } from '../ai-provider-configurations/ai-provider-configurations.module';
import { ExecutiveReportController } from './executive-report.controller';
import { ExecutiveReportEndUserController } from './executive-report-end-user.controller';
import { ExecutiveReportPdfService } from './executive-report-pdf.service';
import { ExecutiveReportRepository } from './executive-report.repository';
import { ExecutiveReportService } from './executive-report.service';

/**
 * Owns `executive_report` persistence (`ExecutiveReportRepository`), eligibility +
 * generation orchestration (`ExecutiveReportService`), and the HTTP routes
 * (`ExecutiveReportController`, `/customers/:customerId/executive-report/...`).
 * `ExecutiveReportService` composes:
 *  - `AiPromptsModule` for the active Master Report prompt template/version
 *  - `AiProviderConfigurationsModule` for the active provider config and the OpenRouter
 *    call (`OpenRouterClient`, the same class `AiReviewModule` uses — not re-implemented)
 *
 * Deliberately does not import `DocumentsModule`/`AiReviewModule`: this feature only reads
 * `intake_document`/`manual_review`/`ai_review_request`/`ai_review_response` (via Drizzle
 * directly, same as `DocumentsService` itself does for its own tables) rather than calling
 * into those services, since none of their existing methods expose the raw rows this
 * feature needs across every required category for a customer.
 */
@Module({
  imports: [AiPromptsModule, AiProviderConfigurationsModule],
  controllers: [ExecutiveReportController, ExecutiveReportEndUserController],
  providers: [ExecutiveReportRepository, ExecutiveReportService, ExecutiveReportPdfService],
  exports: [ExecutiveReportRepository, ExecutiveReportService],
})
export class ExecutiveReportModule {}
