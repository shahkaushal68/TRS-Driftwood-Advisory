import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, SessionUser } from '../auth/current-user.decorator';
import { RequirePermission } from '../auth/permission.decorator';
import { PermissionsGuard } from '../auth/permission.guard';
import { CreateManualReviewDto } from './dto/create-manual-review.dto';
import { UpdateManualReviewDto } from './dto/update-manual-review.dto';
import { DocumentsService } from './documents.service';

/**
 * Manual Review — the human-authored counterpart to AI Review (Analyst/Admin only), used
 * when no active AI prompt exists for a document's evidence category. Reuses the existing
 * `DocumentsService`/`DocumentsModule` (no new module) and the existing `document`/`review`
 * permission action already granted to both roles in `src/auth/roles.ts`.
 */
@Controller('manual-review')
@UseGuards(PermissionsGuard)
@RequirePermission('document', 'review')
export class ManualReviewController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createManualReview(@CurrentUser() user: SessionUser, @Body() dto: CreateManualReviewDto) {
    return this.documentsService.createManualReview(user.id, dto);
  }

  @Get(':documentId')
  getManualReview(@Param('documentId') documentId: string) {
    return this.documentsService.getManualReviewByDocumentId(documentId);
  }

  @Put(':reviewId')
  updateManualReview(@Param('reviewId') reviewId: string, @Body() dto: UpdateManualReviewDto) {
    return this.documentsService.updateManualReview(reviewId, dto);
  }
}
