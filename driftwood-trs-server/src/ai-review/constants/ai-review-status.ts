/** Status of an `ai_review_request` row — the lifecycle of a single AI Review attempt. */
export const AI_REQUEST_STATUSES = {
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  NEEDS_RETRY: 'needs_retry',
} as const;

export type AiRequestStatus = (typeof AI_REQUEST_STATUSES)[keyof typeof AI_REQUEST_STATUSES];

export const ALL_AI_REQUEST_STATUSES = Object.values(AI_REQUEST_STATUSES);

/**
 * Analyst workflow status of an `ai_review_response` row. A successful response always
 * starts at `AI_GENERATED`; publication logic (the transition into/out of
 * `PUBLISHED_TO_END_USER`) is out of scope here and implemented elsewhere.
 */
export const ANALYST_REVIEW_STATUSES = {
  AI_GENERATED: 'ai_generated',
  ANALYST_REVIEW_NEEDED: 'analyst_review_needed',
  ANALYST_EDITED: 'analyst_edited',
  ANALYST_ACCEPTED: 'analyst_accepted',
  ANALYST_REJECTED: 'analyst_rejected',
  PUBLISHED_TO_END_USER: 'published_to_end_user',
} as const;

export type AnalystReviewStatus =
  (typeof ANALYST_REVIEW_STATUSES)[keyof typeof ANALYST_REVIEW_STATUSES];

export const ALL_ANALYST_REVIEW_STATUSES = Object.values(ANALYST_REVIEW_STATUSES);
