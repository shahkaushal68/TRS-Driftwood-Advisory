/**
 * `promptTemplate.promptType` is a free-text column (callers may still register their own
 * values, e.g. the existing `'evidence_review'` used by category-scoped templates) — these
 * are just the values the server itself gives special handling to.
 */
export const PROMPT_TYPES = {
  /** The single customer-level prompt used to generate the Executive Transformation
   *  Readiness Report — see `AiPromptsService.getActiveMasterReportPrompt`. Unlike every
   *  other prompt template, a template of this type has no `trsDomainId`/`evidenceCategoryId`. */
  MASTER_TRANSFORMATION_READINESS_REPORT: 'master_transformation_readiness_report',
} as const;

export type PromptType = (typeof PROMPT_TYPES)[keyof typeof PROMPT_TYPES];
