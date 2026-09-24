/**
 * The backend has no Customer/Organization entity yet — each end-user account (role
 * `user`) is the closest real unit of evidence review. Until a real Customer model with
 * industry/assignment/completion tracking exists, the operational fields below are
 * deterministically mocked per user id (stable across reloads, not random per render).
 * Replace this module wholesale once that backend model lands.
 */

export type CustomerReviewStatus = 'not_started' | 'in_progress' | 'reviewing' | 'completed'

export interface CustomerMockStats {
  industry: string
  reviewStatus: CustomerReviewStatus
  completionPercentage: number
  documentsSubmitted: number
  documentsRequiringReview: number
  documentsAwaitingResubmission: number
  assignedAnalyst: string | null
  lastActivity: string | null
}

export const CUSTOMER_REVIEW_STATUS_LABELS: Record<CustomerReviewStatus, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  reviewing: 'Reviewing',
  completed: 'Completed',
}

export const CUSTOMER_REVIEW_STATUS_COLORS: Record<CustomerReviewStatus, string> = {
  not_started: 'gray',
  in_progress: 'blue',
  reviewing: 'orange',
  completed: 'green',
}

const INDUSTRIES = [
  'Manufacturing',
  'Professional Services',
  'Technology',
  'Finance',
  'Healthcare',
  'Transportation',
  'Retail',
] as const

const REVIEW_STATUSES: readonly CustomerReviewStatus[] = [
  'not_started',
  'in_progress',
  'reviewing',
  'completed',
]

const ANALYSTS = [
  'Sarah Johnson',
  'Michael Chen',
  'Emily Davis',
  'David Wilson',
  'Amanda Lee',
  'James Taylor',
  'Lisa Martinez',
] as const

function hashString(input: string): number {
  let hash = 2166136261
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function seededInt(seed: number, min: number, max: number): number {
  return min + (seed % (max - min + 1))
}

function pick<T>(items: readonly T[], seed: number): T {
  const item = items[seed % items.length]
  if (item === undefined) throw new Error('pick() called with an empty list')
  return item
}

/** Deterministically derives display-only mock stats for a given (real) user id. */
export function deriveMockCustomerStats(userId: string, now: Date): CustomerMockStats {
  const industry = pick(INDUSTRIES, hashString(`${userId}:industry`))
  const reviewStatus = pick(REVIEW_STATUSES, hashString(`${userId}:status`))

  if (reviewStatus === 'not_started') {
    return {
      industry,
      reviewStatus,
      completionPercentage: 0,
      documentsSubmitted: 0,
      documentsRequiringReview: 0,
      documentsAwaitingResubmission: 0,
      assignedAnalyst: null,
      lastActivity: null,
    }
  }

  const completionPercentage =
    reviewStatus === 'completed'
      ? 100
      : reviewStatus === 'reviewing'
        ? seededInt(hashString(`${userId}:completion`), 70, 95)
        : seededInt(hashString(`${userId}:completion`), 20, 65)

  const documentsSubmitted = seededInt(hashString(`${userId}:submitted`), 8, 32)
  const documentsRequiringReview =
    reviewStatus === 'completed' ? 0 : seededInt(hashString(`${userId}:review`), 0, 6)
  const documentsAwaitingResubmission =
    reviewStatus === 'completed' ? 0 : seededInt(hashString(`${userId}:resubmission`), 0, 3)
  const assignedAnalyst = pick(ANALYSTS, hashString(`${userId}:analyst`))
  const daysAgo = seededInt(hashString(`${userId}:lastActivity`), 0, 10)
  const lastActivity = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString()

  return {
    industry,
    reviewStatus,
    completionPercentage,
    documentsSubmitted,
    documentsRequiringReview,
    documentsAwaitingResubmission,
    assignedAnalyst,
    lastActivity,
  }
}
