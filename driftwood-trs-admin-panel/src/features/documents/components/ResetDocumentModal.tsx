import { Alert, Button, Group, Modal, Stack, Text, Textarea } from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { WarningIcon } from '@phosphor-icons/react/Warning'
import { useState } from 'react'

import { getApiErrorMessage } from '../../../common/api/client'
import type { IntakeDocument } from '../../../common/api/documents'

export interface ResetDocumentFormValues {
  reason: string
  requestedCorrection: string
  dueDate: Date | null
}

interface ResetDocumentModalProps {
  document: IntakeDocument | null
  opened: boolean
  isSubmitting?: boolean
  error?: unknown
  onClose: () => void
  onSubmit: (values: ResetDocumentFormValues) => void
}

const REASON_MAX_LENGTH = 500
const CORRECTION_MAX_LENGTH = 500

function ResetDocumentModal({
  document,
  opened,
  isSubmitting = false,
  error,
  onClose,
  onSubmit,
}: ResetDocumentModalProps) {
  const [reason, setReason] = useState('')
  const [requestedCorrection, setRequestedCorrection] = useState('')
  const [dueDate, setDueDate] = useState<Date | null>(null)
  const [reasonTouched, setReasonTouched] = useState(false)

  const reasonError = reasonTouched && reason.trim().length === 0

  const resetLocalState = () => {
    setReason('')
    setRequestedCorrection('')
    setDueDate(null)
    setReasonTouched(false)
  }

  const handleClose = () => {
    resetLocalState()
    onClose()
  }

  const handleSubmit = () => {
    setReasonTouched(true)
    if (reason.trim().length === 0) return

    // Form state is only cleared on close (see handleClose) — if the API call fails,
    // the user's input should still be there to retry with.
    onSubmit({ reason, requestedCorrection, dueDate })
  }

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="Reset Document"
      size="md"
      onExitTransitionEnd={() => {
        // Guards against Mantine's scroll-lock getting stuck open when this modal is
        // conditionally mounted/unmounted by its parent instead of only toggling `opened`.
        window.document.body.style.removeProperty('overflow')
        window.document.body.style.removeProperty('padding-right')
        window.document.documentElement.style.removeProperty('overflow')
        window.document.documentElement.style.removeProperty('padding-right')
      }}
    >
      <Stack gap="md">
        {document !== null ? (
          <Text size="sm" c="dimmed">
            Resetting{' '}
            <Text span fw={600} c="dark">
              {document.fileName}
            </Text>
          </Text>
        ) : null}

        {error !== undefined && error !== null ? (
          <Alert color="red" title="Failed to reset document">
            {getApiErrorMessage(error)}
          </Alert>
        ) : null}

        <Alert color="orange" title="Warning" icon={<WarningIcon size={18} />} variant="light">
          <Stack gap={4}>
            <Text size="sm">
              Resetting this document will require the customer to upload a new version.
            </Text>
            <Text size="sm">
              The previous uploaded document will be preserved for audit history.
            </Text>
            <Text size="sm">
              This action should only be performed when resubmission is required.
            </Text>
          </Stack>
        </Alert>

        <Textarea
          label="Reset Reason / Notes"
          description="Explain why this document is being reset"
          placeholder="Enter reason for reset..."
          required
          value={reason}
          maxLength={REASON_MAX_LENGTH}
          onChange={(event) => {
            setReason(event.currentTarget.value)
          }}
          onBlur={() => {
            setReasonTouched(true)
          }}
          error={reasonError ? 'Reset reason is required.' : undefined}
          autosize
          minRows={3}
        />
        <Text size="xs" c="dimmed" ta="right" mt={-8}>
          {reason.length} / {REASON_MAX_LENGTH}
        </Text>

        <Textarea
          label="Requested Correction / Clarification"
          description="Optional"
          placeholder="Enter requested correction or clarification..."
          value={requestedCorrection}
          maxLength={CORRECTION_MAX_LENGTH}
          onChange={(event) => {
            setRequestedCorrection(event.currentTarget.value)
          }}
          autosize
          minRows={2}
        />
        <Text size="xs" c="dimmed" ta="right" mt={-8}>
          {requestedCorrection.length} / {CORRECTION_MAX_LENGTH}
        </Text>

        <DateInput
          label="Due Date"
          description="Optional"
          placeholder="Select date"
          value={dueDate}
          onChange={(value) => {
            setDueDate(typeof value === 'string' ? new Date(value) : value)
          }}
          clearable
          minDate={new Date()}
        />

        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            color="red"
            loading={isSubmitting}
            disabled={reason.trim().length === 0}
            onClick={handleSubmit}
          >
            Reset Document
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

export { ResetDocumentModal }
