import { Injectable } from '@nestjs/common';

import { DocumentsService } from '../documents/documents.service';
import type { CategoryReviewStatus, DomainReviewProgress } from '../documents/documents.service';
import {
  ExecutiveReportService,
  type EndUserExecutiveReportStatusResult,
} from '../executive-report/executive-report.service';
import { EXECUTIVE_REPORT_STATUSES } from '../executive-report/constants/executive-report-status';

/**
 * Customer-facing assessment milestones for the TRS Review Progress Dashboard overview. This
 * is a display-only enum key — the frontend owns mapping it to the exact wording shown to the
 * End User (mirrors how every other status in this feature is handled: backend returns a
 * stable key, one frontend utility maps it to a label).
 *
 * There is no persisted `assessment` entity in this codebase (see the doc comment on
 * `ExecutiveReportService`), so this is derived from the same signals the dashboard's other
 * sections already expose — it is not a new source of truth, just a single ordered summary of
 * the furthest stage reached across them.
 */
export const ASSESSMENT_STAGES = {
  EVIDENCE_COLLECTION: 'evidence_collection',
  EVIDENCE_SUBMITTED: 'evidence_submitted',
  AI_REVIEW_IN_PROGRESS: 'ai_review_in_progress',
  ANALYST_REVIEW_IN_PROGRESS: 'analyst_review_in_progress',
  EXECUTIVE_REPORT_IN_PROGRESS: 'executive_report_in_progress',
  EXECUTIVE_REPORT_APPROVED: 'executive_report_approved',
  EXECUTIVE_REPORT_PUBLISHED: 'executive_report_published',
} as const;

export type AssessmentStage = (typeof ASSESSMENT_STAGES)[keyof typeof ASSESSMENT_STAGES];

export interface TrsDashboardResult {
  customerName: string;
  assessmentStage: AssessmentStage;
  lastUpdatedAt: Date | null;
  executiveReport: EndUserExecutiveReportStatusResult;
  domains: DomainReviewProgress[];
  categories: CategoryReviewStatus[];
  /**
   * Reserved for a future qualitative, per-domain evidence-strength rating. There is no
   * strength/readiness-scoring model anywhere in this codebase yet (no column, no table, no
   * computation) — this is deliberately always `null` rather than a frontend-invented value.
   * Only once a real backend source exists should this ever be populated, and only for a
   * published report (see ticket §7/§9). The frontend must treat `null` as "not available"
   * and render nothing for this section, never a placeholder.
   */
  evidenceStrength: null;
}

const REPORT_IN_PROGRESS_STATUSES: readonly string[] = [
  EXECUTIVE_REPORT_STATUSES.DRAFT,
  EXECUTIVE_REPORT_STATUSES.UNDER_REVIEW,
  EXECUTIVE_REPORT_STATUSES.GENERATING,
  EXECUTIVE_REPORT_STATUSES.NEEDS_REGENERATION,
];

@Injectable()
export class TrsDashboardService {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly executiveReportService: ExecutiveReportService,
  ) {}

  async getDashboard(userId: string, userName: string): Promise<TrsDashboardResult> {
    const [reviewProgress, executiveReport, aiReviewStatus] = await Promise.all([
      this.documentsService.getReviewProgress(userId),
      this.executiveReportService.getReportStatusForEndUser(userId),
      this.documentsService.getUserAiReviewStatus(userId),
    ]);

    const { domains, categories } = reviewProgress;

    const totalSubmitted = domains.reduce((sum, d) => sum + d.submittedCount, 0);
    const totalAiReviewed = domains.reduce((sum, d) => sum + d.aiReviewedCount, 0);
    const totalAnalystReviewed = domains.reduce((sum, d) => sum + d.analystReviewedCount, 0);

    const assessmentStage = this.deriveStage({
      executiveReportStatus: executiveReport.status,
      totalSubmitted,
      totalAiReviewed,
      totalAnalystReviewed,
      aiReviewSubmitted: aiReviewStatus.status === 'completed',
    });

    const categoryTimestamps = categories
      .map((c) => c.updatedAt)
      .filter((d): d is Date => d !== null);
    const lastUpdatedAt = [
      ...categoryTimestamps,
      ...(executiveReport.publishedAt ? [executiveReport.publishedAt] : []),
    ].reduce<Date | null>((latest, current) => {
      if (!latest || current.getTime() > latest.getTime()) return current;
      return latest;
    }, null);

    return {
      customerName: userName,
      assessmentStage,
      lastUpdatedAt,
      executiveReport,
      domains,
      categories,
      evidenceStrength: null,
    };
  }

  private deriveStage(input: {
    executiveReportStatus: string;
    totalSubmitted: number;
    totalAiReviewed: number;
    totalAnalystReviewed: number;
    aiReviewSubmitted: boolean;
  }): AssessmentStage {
    const {
      executiveReportStatus,
      totalSubmitted,
      totalAiReviewed,
      totalAnalystReviewed,
      aiReviewSubmitted,
    } = input;

    if (executiveReportStatus === EXECUTIVE_REPORT_STATUSES.PUBLISHED) {
      return ASSESSMENT_STAGES.EXECUTIVE_REPORT_PUBLISHED;
    }
    if (executiveReportStatus === EXECUTIVE_REPORT_STATUSES.APPROVED) {
      return ASSESSMENT_STAGES.EXECUTIVE_REPORT_APPROVED;
    }
    if (REPORT_IN_PROGRESS_STATUSES.includes(executiveReportStatus)) {
      return ASSESSMENT_STAGES.EXECUTIVE_REPORT_IN_PROGRESS;
    }
    if (totalAnalystReviewed > 0) {
      return ASSESSMENT_STAGES.ANALYST_REVIEW_IN_PROGRESS;
    }
    if (aiReviewSubmitted || totalAiReviewed > 0) {
      return ASSESSMENT_STAGES.AI_REVIEW_IN_PROGRESS;
    }
    if (totalSubmitted > 0) {
      return ASSESSMENT_STAGES.EVIDENCE_SUBMITTED;
    }
    return ASSESSMENT_STAGES.EVIDENCE_COLLECTION;
  }
}
