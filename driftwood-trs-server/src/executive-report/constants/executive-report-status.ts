/** Status of an `executive_report` row. A row is only ever inserted once generation has
 *  started, so there is no persisted row for 'not_ready'/'ready_to_generate' — those two
 *  only ever appear in the eligibility check's response (see `ExecutiveReportService.getEligibility`),
 *  never as a `reportStatus` value. Kept here anyway so every status this feature can be in
 *  — persisted or transient — has one shared vocabulary. */
export const EXECUTIVE_REPORT_STATUSES = {
  NOT_READY: 'not_ready',
  READY_TO_GENERATE: 'ready_to_generate',
  GENERATING: 'generating',
  DRAFT: 'draft',
  UNDER_REVIEW: 'under_review',
  APPROVED: 'approved',
  PUBLISHED: 'published',
  GENERATION_FAILED: 'generation_failed',
  NEEDS_REGENERATION: 'needs_regeneration',
} as const;

export type ExecutiveReportStatus =
  (typeof EXECUTIVE_REPORT_STATUSES)[keyof typeof EXECUTIVE_REPORT_STATUSES];

export const ALL_EXECUTIVE_REPORT_STATUSES = Object.values(EXECUTIVE_REPORT_STATUSES);

/** Human-readable labels for a persisted `reportStatus` value — used anywhere a status is
 *  shown to a person (e.g. the PDF header/banner in `ExecutiveReportPdfService`). Mirrors
 *  the equivalent map already used on the frontend (`common/api/executiveReport.ts`). */
export const EXECUTIVE_REPORT_STATUS_LABELS: Record<string, string> = {
  not_ready: 'Not Ready',
  ready_to_generate: 'Ready to Generate',
  generating: 'Generating',
  draft: 'Draft / Internal Review Required',
  under_review: 'Under Review',
  approved: 'Approved',
  published: 'Published',
  generation_failed: 'Generation Failed',
  needs_regeneration: 'Needs Regeneration',
};

/** Human-readable labels for the eligibility check's `status` field — matches the ticket's
 *  exact wording ("Ready to Generate" / "Not Ready"), distinct from the persisted
 *  `reportStatus` enum values above. */
export const ELIGIBILITY_STATUS_LABELS = {
  READY: 'Ready to Generate',
  NOT_READY: 'Not Ready',
} as const;
