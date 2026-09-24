import { Module } from '@nestjs/common';
import { UploadModule } from '../upload/upload.module';
import { AiPromptsModule } from '../ai-prompts/ai-prompts.module';
import { AnalystDocumentsController } from './analyst-documents.controller';
import { DocumentsController } from './documents.controller';
import { ManualReviewController } from './manual-review.controller';
import { DocumentsService } from './documents.service';

@Module({
  imports: [UploadModule, AiPromptsModule],
  controllers: [DocumentsController, AnalystDocumentsController, ManualReviewController],
  providers: [DocumentsService],
  // Exported so AiReviewModule can reuse `getAiReviewEligibility`/`getDocument` instead of
  // duplicating eligibility or document-lookup logic.
  exports: [DocumentsService],
})
export class DocumentsModule {}
