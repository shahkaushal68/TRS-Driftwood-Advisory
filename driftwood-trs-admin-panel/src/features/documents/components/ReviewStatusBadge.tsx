import { Badge } from '@mantine/core'

/** Mock-only review status for the AI Review screen — local state, not persisted. */
export type ReviewStatus = 'draft' | 'under_review' | 'accepted' | 'rejected' | 'review_complete'

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  draft: 'Draft',
  under_review: 'Under Review',
  accepted: 'Accepted',
  rejected: 'Rejected',
  review_complete: 'Review Complete',
}

export const REVIEW_STATUS_COLORS: Record<ReviewStatus, string> = {
  draft: 'gray',
  under_review: 'blue',
  accepted: 'green',
  rejected: 'red',
  review_complete: 'teal',
}

interface ReviewStatusBadgeProps {
  status: ReviewStatus
}

function ReviewStatusBadge({ status }: ReviewStatusBadgeProps) {
  return (
    <Badge color={REVIEW_STATUS_COLORS[status]} variant="filled" size="md">
      {REVIEW_STATUS_LABELS[status]}
    </Badge>
  )
}

export { ReviewStatusBadge }
