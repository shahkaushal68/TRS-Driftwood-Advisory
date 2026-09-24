import { Module } from '@nestjs/common';

import { AiPromptsController } from './ai-prompts.controller';
import { AiPromptsRepository } from './ai-prompts.repository';
import { AiPromptsService } from './ai-prompts.service';

@Module({
  controllers: [AiPromptsController],
  providers: [AiPromptsService, AiPromptsRepository],
  // Exported so other modules (e.g. DocumentsModule) can look up active prompts without
  // duplicating prompt-template/version query logic. `AiPromptsService` is also exported
  // (not just the repository) so `ExecutiveReportModule` can reuse
  // `getActiveMasterReportPrompt` as-is instead of re-deriving that lookup itself.
  exports: [AiPromptsRepository, AiPromptsService],
})
export class AiPromptsModule {}
