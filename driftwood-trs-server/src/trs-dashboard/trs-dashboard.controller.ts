import { Controller, Get, UseGuards } from '@nestjs/common';

import { CurrentUser, SessionUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { TrsDashboardService } from './trs-dashboard.service';

/**
 * The End User's TRS Review Progress Dashboard — a single read-only, self-service endpoint
 * that composes `DocumentsService.getReviewProgress` and
 * `ExecutiveReportService.getReportStatusForEndUser` into one response shaped for that
 * dashboard, rather than making the frontend fan out to multiple endpoints and stitch an
 * "assessment stage" together itself. Identity comes solely from the authenticated session
 * (`@CurrentUser()`), never from a URL param, query string, or request body — same convention
 * as `ExecutiveReportEndUserController` and `DocumentsController`'s self-service routes.
 */
@Controller('end-user/trs-dashboard')
@UseGuards(RolesGuard)
@Roles('user')
export class TrsDashboardController {
  constructor(private readonly trsDashboardService: TrsDashboardService) {}

  @Get()
  getDashboard(@CurrentUser() user: SessionUser) {
    return this.trsDashboardService.getDashboard(user.id, user.name);
  }
}
