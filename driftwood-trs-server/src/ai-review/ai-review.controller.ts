import { Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';

import { CurrentUser, SessionUser } from '../auth/current-user.decorator';
import { isAppRole } from '../auth/roles';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AiReviewService } from './ai-review.service';

/**
 * `documents` base path deliberately matches `DocumentsController`'s existing `:id/...`
 * route convention (`:id/classify`, `:id/reset`, `:id/resubmit`) — this is a separate
 * controller class (not a duplicate) because this route needs `RolesGuard`/`@Roles` to give
 * an unambiguous Admin/Analyst-only guarantee, distinct from the existing, still-mock-backed
 * `POST /analyst/documents/:id/ai-review` (`DocumentsService.submitForAiReview`), which is
 * also reachable by the `user` role for the self-service bulk-trigger flow
 * (`POST /documents/trigger-ai-review`) and must keep working unchanged for that.
 */
@Controller('documents')
export class AiReviewController {
  constructor(private readonly aiReviewService: AiReviewService) {}

  @Post(':id/ai-review')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('admin', 'analyst')
  runAiReview(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    // RolesGuard already restricted entry to admin/analyst; this fallback only matters if
    // `user.role` were somehow an unrecognized string, in which case AiReviewService's own
    // role check fails closed (throws Forbidden) rather than silently proceeding.
    const role = isAppRole(user.role) ? user.role : 'user';
    return this.aiReviewService.executeReview(id, user.id, role);
  }

  /** Re-fetches the most recent completed AI Review for a document (no new call to the
   *  provider) — lets the Analyst UI reload a review that already ran without re-triggering
   *  OpenRouter. Returns `null` when the document has never had a review complete. */
  @Get(':id/ai-review')
  @UseGuards(RolesGuard)
  @Roles('admin', 'analyst')
  getLatestAiReview(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    const role = isAppRole(user.role) ? user.role : 'user';
    return this.aiReviewService.getLatestReview(id, user.id, role);
  }
}
