import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, SessionUser } from '../auth/current-user.decorator';
import { isAppRole } from '../auth/roles';
import { RequirePermission } from '../auth/permission.decorator';
import { PermissionsGuard } from '../auth/permission.guard';
import { RegisterDocumentDto } from './dto/register-document.dto';
import { ClassifyDocumentDto } from './dto/classify-document.dto';
import { ResetDocumentDto } from './dto/reset-document.dto';
import { ResubmitDocumentDto } from './dto/resubmit-document.dto';
import { DocumentsService } from './documents.service';
import { PaginationQueryDto } from '../libs/pagination';

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get('evidence-categories')
  getEvidenceCategories() {
    return this.documentsService.getEvidenceCategories();
  }

  @Get('evidence-summary')
  getEvidenceSummary(@CurrentUser() user: SessionUser) {
    return this.documentsService.getEvidenceSummary(user.id);
  }

  @Get('review-progress')
  getReviewProgress(@CurrentUser() user: SessionUser) {
    return this.documentsService.getReviewProgress(user.id);
  }

  @Get('ai-review-summary')
  getAiReviewSummary(@CurrentUser() user: SessionUser) {
    return this.documentsService.getAiReviewSummary(user.id);
  }

  @Get('ai-review-status')
  getAiReviewStatus(@CurrentUser() user: SessionUser) {
    return this.documentsService.getUserAiReviewStatus(user.id);
  }

  @Post('trigger-ai-review')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermissionsGuard)
  @RequirePermission('document', 'submitAiReview')
  triggerAiReview(@CurrentUser() user: SessionUser) {
    return this.documentsService.batchTriggerAiReview(user.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(PermissionsGuard)
  @RequirePermission('document', 'upload')
  registerDocument(@CurrentUser() user: SessionUser, @Body() dto: RegisterDocumentDto) {
    return this.documentsService.registerDocument(user.id, dto);
  }

  @Get()
  listDocuments(@CurrentUser() user: SessionUser, @Query() query: PaginationQueryDto) {
    return this.documentsService.listMyDocuments(user.id, query);
  }

  @Get(':id')
  getDocument(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    const role = isAppRole(user.role) ? user.role : 'user';
    return this.documentsService.getDocument(id, user.id, role);
  }

  @Get(':id/signed-url')
  getSignedUrl(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    const role = isAppRole(user.role) ? user.role : 'user';
    return this.documentsService.getDocumentSignedUrl(id, user.id, role);
  }

  @Get(':id/findings')
  getFindings(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    const role = isAppRole(user.role) ? user.role : 'user';
    return this.documentsService.getDocumentFindings(id, user.id, role);
  }

  @Get(':id/ai-analysis')
  getAiAnalysis(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    const role = isAppRole(user.role) ? user.role : 'user';
    return this.documentsService.getAiAnalysis(id, user.id, role);
  }

  @Get(':id/ai-review-eligibility')
  getAiReviewEligibility(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    const role = isAppRole(user.role) ? user.role : 'user';
    return this.documentsService.getAiReviewEligibility(id, user.id, role);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteDocument(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.documentsService.deleteDocument(id, user.id);
  }

  @Patch(':id/classify')
  @UseGuards(PermissionsGuard)
  @RequirePermission('document', 'classify')
  classifyDocument(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @Body() dto: ClassifyDocumentDto,
  ) {
    const role = isAppRole(user.role) ? user.role : 'user';
    return this.documentsService.classifyDocument(id, user.id, role, dto);
  }

  @Post(':id/reset')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermissionsGuard)
  @RequirePermission('document', 'reset')
  resetDocument(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @Body() dto: ResetDocumentDto,
  ) {
    return this.documentsService.resetDocument(id, user.id, user.name, dto);
  }

  @Post(':id/resubmit')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermissionsGuard)
  @RequirePermission('document', 'upload')
  resubmitDocument(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @Body() dto: ResubmitDocumentDto,
  ) {
    return this.documentsService.resubmitDocument(id, user.id, dto);
  }
}
