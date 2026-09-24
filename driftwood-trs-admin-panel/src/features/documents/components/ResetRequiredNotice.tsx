import { Badge, Divider, Group, Paper, Stack, Text } from '@mantine/core'
import { WarningIcon } from '@phosphor-icons/react/Warning'

import type { IntakeDocument } from '../../../common/api/documents'
import { DocumentUploadArea } from './DocumentUploadArea'

interface ResetRequiredNoticeProps {
  document: IntakeDocument
  onResubmitted: (updatedDocument: IntakeDocument) => void
}

/**
 * Shown above an uploaded document while it is `resetRequired`. Uploading a new version
 * calls `POST /documents/:id/resubmit` (via `DocumentUploadArea`'s `resubmitDocumentId`),
 * which flips `resetRequired` to false on the backend — once the parent refetches, this
 * document naturally drops out of the "requires resubmission" list and this card
 * disappears on its own; there is no local "resubmitted" success state to manage here.
 */
function ResetRequiredNotice({ document, onResubmitted }: ResetRequiredNoticeProps) {
  return (
    <Paper withBorder radius="sm" p="md" style={{ borderColor: 'var(--mantine-color-red-4)' }}>
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start">
          <Group gap="xs">
            <WarningIcon size={20} color="var(--mantine-color-red-6)" weight="fill" />
            <Text fw={600} c="red">
              Reset / Resubmission Required
            </Text>
          </Group>
          <Badge color="red" variant="filled" size="sm">
            {document.fileName}
          </Badge>
        </Group>

        <Stack gap={4}>
          {document.resetByName ? (
            <Text size="sm">
              <Text span fw={500}>
                Reset By:{' '}
              </Text>
              {document.resetByName}
            </Text>
          ) : null}
          {document.resetAt ? (
            <>
              <Text size="sm">
                <Text span fw={500}>
                  Reset Date:{' '}
                </Text>
                {new Date(document.resetAt).toLocaleDateString()}
              </Text>
              <Text size="sm">
                <Text span fw={500}>
                  Reset Time:{' '}
                </Text>
                {new Date(document.resetAt).toLocaleTimeString()}
              </Text>
            </>
          ) : null}
          {document.resetReason ? (
            <Text size="sm">
              <Text span fw={500}>
                Reset Reason:{' '}
              </Text>
              {document.resetReason}
            </Text>
          ) : null}
          {document.requestedCorrection ? (
            <Text size="sm">
              <Text span fw={500}>
                Requested Correction:{' '}
              </Text>
              {document.requestedCorrection}
            </Text>
          ) : null}
        </Stack>

        <Divider />

        <Stack gap={4}>
          <Text size="sm" fw={500}>
            Upload New Version
          </Text>
          <DocumentUploadArea
            onUploaded={onResubmitted}
            resubmitDocumentId={document.id}
            buttonLabel="Upload New Version"
          />
        </Stack>
      </Stack>
    </Paper>
  )
}

export { ResetRequiredNotice }
