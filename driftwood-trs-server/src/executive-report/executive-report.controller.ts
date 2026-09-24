import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import { CurrentUser, SessionUser } from '../auth/current-user.decorator';
import { isAppRole } from '../auth/roles';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UpdateExecutiveReportDto } from './dto/update-executive-report.dto';
import { ExecutiveReportService } from './executive-report.service';

/**
 * Every route here is Admin/Analyst-only — the Executive Report is internal/draft and must
 * never be reachable by the `user` role (see ticket §13). `RolesGuard`/`@Roles` at the class
 * level, same pattern as `AiPromptsController`.
 */
@Controller('customers/:customerId/executive-report')
@UseGuards(RolesGuard)
@Roles('admin', 'analyst')
export class ExecutiveReportController {
  constructor(private readonly executiveReportService: ExecutiveReportService) {}

  @Get('eligibility')
  getEligibility(@Param('customerId') customerId: string) {
    return this.executiveReportService.getEligibility(customerId);
  }

  @Post('generate')
  @HttpCode(HttpStatus.OK)
  generate(@Param('customerId') customerId: string, @CurrentUser() user: SessionUser) {
    const role = isAppRole(user.role) ? user.role : 'user';
    return this.executiveReportService.generateReport(customerId, user.id, role);
  }

  /** The latest generated Executive Report for a customer, or `null` if one has never been
   *  generated — not an error, mirroring `AiReviewController.getLatestAiReview`. Wrapped in
   *  `{ report }` rather than returned bare, because a controller handler that resolves to
   *  `null` makes Nest send a completely empty response body (not the JSON text "null"),
   *  which a JSON client can't reliably distinguish from no body at all — see
   *  `AiPromptsController.getMasterReportPrompt` for the same fix and full reasoning. */
  @Get()
  async getReport(@Param('customerId') customerId: string) {
    const report = await this.executiveReportService.getLatestReport(customerId);
    return { report };
  }

  /**
   * Saves edits to a draft Executive Report's markdown content. Only the `draft` status may
   * be edited — see `ExecutiveReportService.updateReport` for the 409 enforcement. The DTO
   * whitelists `generatedReportMarkdown` as the only settable field; every protected/system
   * field (status, audit timestamps/user ids, prompt/version/source-review lineage, ...) is
   * simply absent from it, so the global `ValidationPipe({ forbidNonWhitelisted: true })`
   * rejects a request body that tries to set one.
   */
  @Patch(':reportId')
  update(
    @Param('customerId') customerId: string,
    @Param('reportId') reportId: string,
    @Body() dto: UpdateExecutiveReportDto,
    @CurrentUser() user: SessionUser,
  ) {
    const role = isAppRole(user.role) ? user.role : 'user';
    return this.executiveReportService.updateReport(
      customerId,
      reportId,
      dto.generatedReportMarkdown,
      user.id,
      role,
    );
  }

  /** Draft -> Approved. Does not publish it — see `publish` below. */
  @Post(':reportId/approve')
  @HttpCode(HttpStatus.OK)
  approve(
    @Param('customerId') customerId: string,
    @Param('reportId') reportId: string,
    @CurrentUser() user: SessionUser,
  ) {
    const role = isAppRole(user.role) ? user.role : 'user';
    return this.executiveReportService.approveReport(customerId, reportId, user.id, role);
  }

  /** Approved -> Published. Only an already-approved report can be published — enforced in
   *  `ExecutiveReportService.publishReport`, not by whether the frontend shows this button. */
  @Post(':reportId/publish')
  @HttpCode(HttpStatus.OK)
  publish(
    @Param('customerId') customerId: string,
    @Param('reportId') reportId: string,
    @CurrentUser() user: SessionUser,
  ) {
    const role = isAppRole(user.role) ? user.role : 'user';
    return this.executiveReportService.publishReport(customerId, reportId, user.id, role);
  }

  /**
   * Downloads a draft/approved/published report as a PDF, rendered server-side from the
   * already-stored `generatedReportMarkdown` — never calls OpenRouter, never re-generates
   * anything (see `ExecutiveReportPdfService`). `@Res({ passthrough: true })` keeps Nest's
   * normal exception handling intact (a bare `@Res()` would bypass it), so
   * `ExecutiveReportService.downloadReportPdf`'s NotFoundException/ConflictException still
   * serialize as the usual JSON error bodies instead of a raw empty response.
   */
  @Get(':reportId/download-pdf')
  @Header('Content-Type', 'application/pdf')
  async downloadPdf(
    @Param('customerId') customerId: string,
    @Param('reportId') reportId: string,
    @CurrentUser() user: SessionUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const role = isAppRole(user.role) ? user.role : 'user';
    const { buffer, filename } = await this.executiveReportService.downloadReportPdf(
      customerId,
      reportId,
      role,
    );
    res.set({
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.length),
    });
    return new StreamableFile(buffer);
  }
}
