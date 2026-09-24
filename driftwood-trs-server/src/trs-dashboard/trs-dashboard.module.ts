import { Module } from '@nestjs/common';

import { DocumentsModule } from '../documents/documents.module';
import { ExecutiveReportModule } from '../executive-report/executive-report.module';
import { TrsDashboardController } from './trs-dashboard.controller';
import { TrsDashboardService } from './trs-dashboard.service';

/**
 * The End User TRS Review Progress Dashboard. Deliberately owns no persistence of its own —
 * it only composes `DocumentsService` (evidence/review progress) and `ExecutiveReportService`
 * (report status), both already exported by their modules for exactly this kind of reuse.
 */
@Module({
  imports: [DocumentsModule, ExecutiveReportModule],
  controllers: [TrsDashboardController],
  providers: [TrsDashboardService],
})
export class TrsDashboardModule {}
