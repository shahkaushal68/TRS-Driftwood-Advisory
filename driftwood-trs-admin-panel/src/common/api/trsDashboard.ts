import { queryOptions } from '@tanstack/react-query'

import { apiClient } from './client'

/**
 * Mirrors `AssessmentStage` in `driftwood-trs-server/src/trs-dashboard/trs-dashboard.service.ts`.
 * A display-only key — always map it through `ASSESSMENT_STAGE_LABELS`
 * (`features/trs-dashboard/utils/statusMappings.ts`) rather than showing it directly.
 */
export type AssessmentStage =
  | 'evidence_collection'
  | 'evidence_submitted'
  | 'ai_review_in_progress'
  | 'analyst_review_in_progress'
  | 'executive_report_in_progress'
  | 'executive_report_approved'
  | 'executive_report_published'

/**
 * Mirrors `EndUserExecutiveReportStatusResult` in
 * `driftwood-trs-server/src/executive-report/executive-report.service.ts`. `status` is the
 * raw internal report status (or `'not_ready'`) — map it through
 * `EXECUTIVE_REPORT_CUSTOMER_STATUS_LABELS` for display, never show it verbatim.
 */
export interface EndUserExecutiveReportStatus {
  status: string
  published: boolean
  publishedAt: string | null
  viewReportAvailable: boolean
  downloadPdfAvailable: boolean
}

/**
 * Mirrors `DomainReviewProgress` in
 * `driftwood-trs-server/src/documents/documents.service.ts`. Every count is computed
 * server-side from real document rows — never re-derived here.
 */
export interface DomainReviewProgress {
  domain: string
  domainLabel: string
  requiredTotal: number
  submittedCount: number
  aiReviewedCount: number
  analystReviewedCount: number
  approvedCount: number
  status: 'not_started' | 'in_progress' | 'complete'
}

/**
 * Mirrors `CategoryReviewStatus` in
 * `driftwood-trs-server/src/documents/documents.service.ts`. `status` is the raw internal
 * `DOCUMENT_STATUSES` value (or `null` before a submission exists) — map it through
 * `EVIDENCE_CATEGORY_STATUS_LABELS` for display.
 */
export interface CategoryReviewStatus {
  domain: string
  domainLabel: string
  evidenceCategory: string
  documentId: string | null
  status: string | null
  resetRequired: boolean
  updatedAt: string | null
}

/**
 * Reserved for a future qualitative, per-domain evidence-strength rating. The backend
 * (`TrsDashboardResult.evidenceStrength` in `trs-dashboard.service.ts`) always sends `null`
 * today, since no such data exists anywhere in the backend yet — there is no strength/scoring
 * model, column, or table for it. The non-null shape is written out here so the eventual real
 * backend field only needs a schema change on this one type, not a redesign of the component
 * that renders it (`EvidenceStrengthSection`).
 */
export interface EvidenceStrengthDomainRating {
  domain: string
  domainLabel: string
  /** Qualitative only — e.g. "Strong Evidence" / "Moderate Evidence" — never a number. */
  strengthLabel: string
  summary: string
}

export type EvidenceStrengthByDomain = EvidenceStrengthDomainRating[] | null

/** Mirrors `TrsDashboardResult` in
 *  `driftwood-trs-server/src/trs-dashboard/trs-dashboard.service.ts`. */
export interface TrsDashboard {
  customerName: string
  assessmentStage: AssessmentStage
  lastUpdatedAt: string | null
  executiveReport: EndUserExecutiveReportStatus
  domains: DomainReviewProgress[]
  categories: CategoryReviewStatus[]
  evidenceStrength: EvidenceStrengthByDomain
}

const trsDashboardRoutes = {
  dashboard: '/end-user/trs-dashboard',
} as const

const trsDashboardQueryKeys = {
  all: ['trs-dashboard'] as const,
  dashboard: () => [...trsDashboardQueryKeys.all, 'dashboard'] as const,
}

const trsDashboardApi = {
  async getDashboard(): Promise<TrsDashboard> {
    const response = await apiClient.get<TrsDashboard>(trsDashboardRoutes.dashboard)
    return response.data
  },
}

const trsDashboardQueryOptions = {
  dashboard: () =>
    queryOptions({
      queryKey: trsDashboardQueryKeys.dashboard(),
      queryFn: () => trsDashboardApi.getDashboard(),
    }),
}

export { trsDashboardApi, trsDashboardQueryKeys, trsDashboardQueryOptions, trsDashboardRoutes }
