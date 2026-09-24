import type { DefaultMantineColor } from '@mantine/core'

import type { AssessmentStage } from '../../../common/api/trsDashboard'

/**
 * Single source of truth for every internal → customer-facing status label the TRS Review
 * Progress Dashboard shows. Per the ticket's requirement to "keep the mapping in one reusable
 * frontend utility rather than duplicating it across components" — every dashboard component
 * imports from here instead of hard-coding its own copy.
 *
 * All maps fall back to the raw backend value when it isn't one this file knows about, so an
 * unrecognised status never renders as blank.
 */

// ---------------------------------------------------------------------------
// Assessment stage (overview) — mirrors `ASSESSMENT_STAGES` in the server's
// `trs-dashboard.service.ts`.
// ---------------------------------------------------------------------------

export const ASSESSMENT_STAGE_LABELS: Record<AssessmentStage, string> = {
  evidence_collection: 'Evidence Collection',
  evidence_submitted: 'Evidence Submitted',
  ai_review_in_progress: 'AI Review In Progress',
  analyst_review_in_progress: 'Analyst Review In Progress',
  executive_report_in_progress: 'Executive Report In Progress',
  executive_report_approved: 'Executive Report Approved',
  executive_report_published: 'Executive Report Published',
}

export const ASSESSMENT_STAGE_ORDER: AssessmentStage[] = [
  'evidence_collection',
  'evidence_submitted',
  'ai_review_in_progress',
  'analyst_review_in_progress',
  'executive_report_in_progress',
  'executive_report_approved',
  'executive_report_published',
]

export function getAssessmentStageLabel(stage: string): string {
  return (ASSESSMENT_STAGE_LABELS as Record<string, string>)[stage] ?? stage
}

// ---------------------------------------------------------------------------
// Executive Report status — mirrors the backend's raw `EXECUTIVE_REPORT_STATUSES` value
// (plus the synthetic `not_ready`) returned by `GET /end-user/trs-dashboard` /
// `GET /end-user/executive-report/status`. Deliberately a *separate* map from
// `EXECUTIVE_REPORT_STATUS_LABELS` in `common/api/executiveReport.ts` — that one is the
// Admin/Analyst-facing wording; this is the customer-facing wording from the ticket (§6),
// which never mentions drafts, AI, or internal review by name.
// ---------------------------------------------------------------------------

export const EXECUTIVE_REPORT_CUSTOMER_STATUS_LABELS: Record<string, string> = {
  not_ready: 'Report Not Ready',
  ready_to_generate: 'Report Preparation Pending',
  generating: 'Report Being Prepared',
  draft: 'Report Under Internal Review',
  under_review: 'Report Under Internal Review',
  approved: 'Report Approved',
  published: 'Report Published',
  generation_failed: 'Report Being Updated',
  needs_regeneration: 'Report Being Updated',
}

export const EXECUTIVE_REPORT_CUSTOMER_STATUS_COLORS: Record<string, DefaultMantineColor> = {
  not_ready: 'gray',
  ready_to_generate: 'gray',
  generating: 'blue',
  draft: 'blue',
  under_review: 'blue',
  approved: 'teal',
  published: 'green',
  generation_failed: 'orange',
  needs_regeneration: 'orange',
}

export function getExecutiveReportCustomerStatusLabel(status: string): string {
  return EXECUTIVE_REPORT_CUSTOMER_STATUS_LABELS[status] ?? status
}

export function getExecutiveReportCustomerStatusColor(status: string): DefaultMantineColor {
  return EXECUTIVE_REPORT_CUSTOMER_STATUS_COLORS[status] ?? 'gray'
}

// ---------------------------------------------------------------------------
// Evidence category review stage — mirrors the raw `DOCUMENT_STATUSES` value returned per
// category by `GET /end-user/trs-dashboard` (`categories[].status`). Suggested mapping per
// the ticket (§5).
// ---------------------------------------------------------------------------

export const EVIDENCE_CATEGORY_STATUS_LABELS: Record<string, string> = {
  uploaded: 'Pending Review',
  classified: 'Pending Review',
  ai_review_in_progress: 'AI Review In Progress',
  ai_reviewed: 'AI Review Complete',
  analyst_reviewed: 'Approved for Report',
  published_to_end_user: 'Included in Executive Report',
  insufficient_evidence: 'Review In Progress',
  ai_review_failed: 'Review In Progress',
  reset_required: 'Resubmission Required',
  resubmitted: 'Pending Review',
}

export const EVIDENCE_CATEGORY_STATUS_COLORS: Record<string, DefaultMantineColor> = {
  uploaded: 'gray',
  classified: 'gray',
  ai_review_in_progress: 'yellow',
  ai_reviewed: 'blue',
  analyst_reviewed: 'teal',
  published_to_end_user: 'green',
  insufficient_evidence: 'orange',
  ai_review_failed: 'orange',
  reset_required: 'red',
  resubmitted: 'gray',
}

/** `null` (no submission yet for this category) always reads as "Not Submitted", and a
 *  `resetRequired` flag always wins over the raw status — a document sitting at any status
 *  while flagged for resubmission must never read as "Approved" or "Included". */
export function getEvidenceCategoryStatusLabel(
  status: string | null,
  resetRequired: boolean,
): string {
  if (resetRequired) return 'Resubmission Required'
  if (status === null) return 'Not Submitted'
  return EVIDENCE_CATEGORY_STATUS_LABELS[status] ?? status
}

export function getEvidenceCategoryStatusColor(
  status: string | null,
  resetRequired: boolean,
): DefaultMantineColor {
  if (resetRequired) return 'red'
  if (status === null) return 'gray'
  return EVIDENCE_CATEGORY_STATUS_COLORS[status] ?? 'gray'
}

// ---------------------------------------------------------------------------
// Domain review status — mirrors `DomainReviewProgress.status` from the server.
// ---------------------------------------------------------------------------

export const DOMAIN_REVIEW_STATUS_LABELS: Record<string, string> = {
  not_started: 'Evidence Collection',
  in_progress: 'Review In Progress',
  complete: 'Review Complete',
}

export const DOMAIN_REVIEW_STATUS_COLORS: Record<string, DefaultMantineColor> = {
  not_started: 'gray',
  in_progress: 'blue',
  complete: 'green',
}

export function getDomainReviewStatusLabel(status: string): string {
  return DOMAIN_REVIEW_STATUS_LABELS[status] ?? status
}

export function getDomainReviewStatusColor(status: string): DefaultMantineColor {
  return DOMAIN_REVIEW_STATUS_COLORS[status] ?? 'gray'
}
