import { useQuery } from '@tanstack/react-query'

import type { IntakeDocument } from '../../../common/api/documents'
import { documentQueryOptions } from '../../../common/api/documents'

export type AiReviewGateState =
  | 'reset'
  | 'completed'
  | 'loading'
  | 'error'
  | 'eligible'
  | 'noActivePrompt'
  | 'ineligible'

export interface AiReviewGateResult {
  state: AiReviewGateState
  /** Whether the primary review action ("Review AI Report" / "Review Report") is clickable. */
  reviewEnabled: boolean
  /** Label for the primary review action button. */
  reviewLabel: string
  /** Status/helper text to surface next to the action. */
  helperText: string
  /** Whether to offer "Start Manual Review" as a fallback action. */
  showManualReview: boolean
  badgeLabel: string
  badgeColor: string
}

/**
 * Backend `reason` strings (from `GET /documents/:id/ai-review-eligibility`) that mean
 * "no usable active prompt exists for this domain/category" — see
 * `AiReviewEligibilityResult.reason` in the server's `DocumentsService`.
 */
const NO_ACTIVE_PROMPT_REASONS = new Set([
  'No active prompt exists for this evidence category',
  'Prompt is inactive',
  'Prompt exists but has no active version',
])

/**
 * Single source of truth for whether "Review AI Report" is available for a document, and
 * what to show instead when it isn't. This hook fetches and *interprets* the backend's
 * eligibility response — it never recomputes eligibility itself. The `reset`/`completed`
 * states are derived from fields the app already tracks on the document (`resetRequired`,
 * `aiReviewStatus`), same as before; only the "is there an active prompt" check now comes
 * from the real endpoint instead of a mock.
 *
 * Pass `enabled: false` when the caller doesn't need eligibility at all (e.g. a table
 * instance that never renders AI Review actions) to avoid firing the request.
 */
export function useAiReviewGate(
  doc: IntakeDocument,
  options?: { enabled?: boolean },
): AiReviewGateResult {
  const isReset = doc.resetRequired
  const isCompleted = doc.aiReviewStatus === 'completed'
  const shouldFetch = (options?.enabled ?? true) && !isReset && !isCompleted

  const eligibilityQuery = useQuery({
    ...documentQueryOptions.aiReviewEligibility(doc.id),
    enabled: shouldFetch,
  })

  if (isReset) {
    return {
      state: 'reset',
      reviewEnabled: false,
      reviewLabel: 'Review AI Report',
      helperText: 'Document reset. Resubmission required before review.',
      showManualReview: false,
      badgeLabel: 'Reset Required',
      badgeColor: 'orange',
    }
  }

  if (isCompleted) {
    return {
      state: 'completed',
      reviewEnabled: true,
      reviewLabel: 'Review Report',
      helperText: 'AI review complete. Review report.',
      showManualReview: false,
      badgeLabel: 'AI Review Complete',
      badgeColor: 'teal',
    }
  }

  if (eligibilityQuery.isError) {
    return {
      state: 'error',
      reviewEnabled: false,
      reviewLabel: 'Review AI Report',
      helperText: 'Unable to determine AI review availability.',
      showManualReview: false,
      badgeLabel: 'Unavailable',
      badgeColor: 'red',
    }
  }

  if (eligibilityQuery.isPending) {
    return {
      state: 'loading',
      reviewEnabled: false,
      reviewLabel: 'Review AI Report',
      helperText: 'Checking AI review availability...',
      showManualReview: false,
      badgeLabel: 'Checking…',
      badgeColor: 'gray',
    }
  }

  const eligibility = eligibilityQuery.data

  if (eligibility.aiReviewEligible) {
    return {
      state: 'eligible',
      reviewEnabled: true,
      reviewLabel: 'Review AI Report',
      helperText: 'AI review available.',
      showManualReview: false,
      badgeLabel: 'AI Review Available',
      badgeColor: 'blue',
    }
  }

  if (NO_ACTIVE_PROMPT_REASONS.has(eligibility.reason)) {
    return {
      state: 'noActivePrompt',
      reviewEnabled: false,
      reviewLabel: 'Review AI Report',
      helperText: 'AI review unavailable. No active prompt exists for this evidence category.',
      showManualReview: true,
      badgeLabel: 'No Active Prompt',
      badgeColor: 'gray',
    }
  }

  return {
    state: 'ineligible',
    reviewEnabled: false,
    reviewLabel: 'Review AI Report',
    helperText: `AI review unavailable: ${eligibility.reason}`,
    showManualReview: true,
    badgeLabel: 'AI Review Unavailable',
    badgeColor: 'gray',
  }
}
