import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import { CurrentUser, SessionUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ExecutiveReportService } from './executive-report.service';

/**
 * The End User's own published Executive Report — deliberately a separate controller from
 * `ExecutiveReportController` (which is Admin/Analyst-only for a given `customerId`), not an
 * additional route on it, so there is no path in this controller that ever accepts a
 * customerId from the caller. Customer identity comes solely from the authenticated
 * session (`@CurrentUser()`), matching the existing self-service convention already used by
 * `DocumentsController`'s own routes (e.g. `getEvidenceSummary(user.id)`), never from a URL
 * param, query string, or request body — see `ExecutiveReportService.getPublishedReportForEndUser`.
 */
@Controller('end-user/executive-report')
@UseGuards(RolesGuard)
@Roles('user')
export class ExecutiveReportEndUserController {
  constructor(private readonly executiveReportService: ExecutiveReportService) {}

  /**
   * The End User's Executive Report *status* — safe to poll at any stage of the report
   * lifecycle (unlike `getPublishedReport` below, this never 404s once a report has been
   * generated) since it only ever returns a status string plus availability flags, never
   * report content. Backs the TRS Review Progress Dashboard's Executive Report section.
   */
  @Get('status')
  getReportStatus(@CurrentUser() user: SessionUser) {
    return this.executiveReportService.getReportStatusForEndUser(user.id);
  }

  @Get()
  async getPublishedReport(@CurrentUser() user: SessionUser) {
    const report = await this.executiveReportService.getPublishedReportForEndUser(user.id);
    if (!report) {
      throw new NotFoundException('No published Executive Report is available yet');
    }
    return report;
  }

  /**
   * Downloads the End User's own published report as a PDF — identity comes solely from
   * `@CurrentUser()`, same as `getPublishedReport` above; there is no path here that ever
   * accepts a customerId, so `?customerId=another-customer` on this route has no effect.
   * `ExecutiveReportService.downloadPublishedReportPdfForEndUser` reuses the same
   * published-only lookup as the JSON route — a draft/approved-but-unpublished report can
   * never be the one rendered here.
   */
  @Get('download-pdf')
  @Header('Content-Type', 'application/pdf')
  async downloadPublishedReportPdf(
    @CurrentUser() user: SessionUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { buffer, filename } = await this.executiveReportService.downloadPublishedReportPdfForEndUser(
      user.id,
    );
    res.set({
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.length),
    });
    return new StreamableFile(buffer);
  }
}
