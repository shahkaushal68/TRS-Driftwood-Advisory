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
import { CreateFindingDto } from './dto/create-finding.dto';
import { SetSufficiencyDto } from './dto/set-sufficiency.dto';
import { UpdateFindingDto } from './dto/update-finding.dto';
import { UpdateAiAnalysisDto } from './dto/update-ai-analysis.dto';
import { ResetUserDocumentsDto } from './dto/reset-user-documents.dto';
import { AnalystDocumentsQueryDto } from './dto/analyst-documents-query.dto';
import { DocumentsService } from './documents.service';

@Controller('analyst/documents')
@UseGuards(PermissionsGuard)
@RequirePermission('document', 'review')
export class AnalystDocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  getAllDocuments(@Query() query: AnalystDocumentsQueryDto) {
    return this.documentsService.getAllDocuments(query.userId, query);
  }

  @Get('evidence-summary')
  getEvidenceSummary(@Query('userId') userId: string) {
    return this.documentsService.getEvidenceSummary(userId);
  }

  @Post('reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('document', 'review')
  resetUserDocuments(@Body() dto: ResetUserDocumentsDto) {
    return this.documentsService.resetUserDocuments(dto.userId);
  }

  @Post(':id/ai-review')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('document', 'submitAiReview')
  submitForAiReview(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.documentsService.submitForAiReview(id, user.id);
  }

  @Get(':id/findings')
  getFindings(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    const role = isAppRole(user.role) ? user.role : 'analyst';
    return this.documentsService.getDocumentFindings(id, user.id, role);
  }

  @Post(':id/findings')
  @HttpCode(HttpStatus.CREATED)
  createFinding(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @Body() dto: CreateFindingDto,
  ) {
    return this.documentsService.createFinding(id, user.id, dto);
  }

  @Patch(':id/findings/:findingId')
  updateFinding(
    @Param('id') id: string,
    @Param('findingId') findingId: string,
    @Body() dto: UpdateFindingDto,
  ) {
    return this.documentsService.updateFinding(id, findingId, dto);
  }

  @Delete(':id/findings/:findingId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteFinding(@Param('id') id: string, @Param('findingId') findingId: string) {
    return this.documentsService.deleteFinding(id, findingId);
  }

  @Patch(':id/sufficiency')
  @RequirePermission('document', 'setSufficiency')
  setSufficiency(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @Body() dto: SetSufficiencyDto,
  ) {
    return this.documentsService.setSufficiency(id, user.id, dto);
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('document', 'publish')
  publishFindings(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.documentsService.publishFindings(id, user.id);
  }

  @Get(':id/ai-analysis')
  getAiAnalysis(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    const role = isAppRole(user.role) ? user.role : 'analyst';
    return this.documentsService.getAiAnalysis(id, user.id, role);
  }

  /**
   * PATCH /analyst/documents/:id/ai-analysis
   *
   * Accepts `{ rawOutput?: AiRawOutput, aiVerdict?: string }`.
   * `rawOutput` replaces the entire jsonb blob — send the full updated object, not a partial patch.
   * See `AiRawOutput` in db/schema/documents.ts for the expected shape.
   */
  @Patch(':id/ai-analysis')
  @RequirePermission('document', 'review')
  updateAiAnalysis(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @Body() dto: UpdateAiAnalysisDto,
  ) {
    return this.documentsService.updateAiAnalysis(id, user.id, dto);
  }

  @Post(':id/ai-analysis/publish')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('document', 'publish')
  publishAiAnalysisReport(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.documentsService.publishAiAnalysisReport(id, user.id);
  }
}
