import { Alert, Button, Group, Loader, Stack, Text } from '@mantine/core'
import { WarningIcon } from '@phosphor-icons/react/Warning'

import { getApiErrorMessage } from '../../../common/api/client'
import type { AiReviewGateResult } from '../utils/aiReviewEligibility'

interface AiReviewAvailabilityNoticeProps {
  gate: AiReviewGateResult
  onReviewAiReport: () => void
  onManualReview: () => void
  /** True while the real `POST /documents/:id/ai-review` call is in flight. */
  isTriggering?: boolean
  /** Set when the most recent trigger attempt failed (e.g. OpenRouter error). */
  triggerError?: unknown
}

/**
 * Shown in place of the AI Review panel for a document that hasn't had AI review run
 * yet, gating whether "Review AI Report" is offered based on the real
 * `GET /documents/:id/ai-review-eligibility` response (see `useAiReviewGate`).
 */
function AiReviewAvailabilityNotice({
  gate,
  onReviewAiReport,
  onManualReview,
  isTriggering = false,
  triggerError,
}: AiReviewAvailabilityNoticeProps) {
  if (gate.state === 'loading') {
    return (
      <Group gap="xs">
        <Loader size="xs" />
        <Text size="sm" c="dimmed">
          {gate.helperText}
        </Text>
      </Group>
    )
  }

  if (gate.state === 'error') {
    return (
      <Alert color="red" icon={<WarningIcon size={18} />} title="AI Review Unavailable">
        {gate.helperText} Please try again.
      </Alert>
    )
  }

  if (gate.state === 'eligible') {
    return (
      <Stack gap="xs">
        <Group gap="sm">
          <Button size="sm" onClick={onReviewAiReport} loading={isTriggering}>
            Review AI Report
          </Button>
          <Button size="sm" variant="outline" onClick={onManualReview} disabled={isTriggering}>
            Manual Review
          </Button>
        </Group>
        <Text size="xs" c="dimmed">
          {gate.helperText}
        </Text>
        {triggerError ? (
          <Alert color="red" title="AI review failed">
            {getApiErrorMessage(triggerError)}
          </Alert>
        ) : null}
      </Stack>
    )
  }

  // noActivePrompt / ineligible
  return (
    <Stack gap="sm">
      <Alert color="yellow" icon={<WarningIcon size={18} />} title="AI Review Unavailable">
        {gate.helperText}
      </Alert>
      {gate.showManualReview ? (
        <Group>
          <Button size="sm" onClick={onManualReview}>
            Start Manual Review
          </Button>
        </Group>
      ) : null}
    </Stack>
  )
}

export { AiReviewAvailabilityNotice }
