import { ActionIcon, Badge, Group, Table, Text, Tooltip } from '@mantine/core'
import { ArrowSquareOutIcon } from '@phosphor-icons/react/ArrowSquareOut'
import { FolderOpenIcon } from '@phosphor-icons/react/FolderOpen'

import type { IntakeDocumentWithUser } from '../../../common/api/documents'
import {
  DOCUMENT_STATUS_COLORS,
  DOCUMENT_STATUS_LABELS,
  EVIDENCE_TYPE_LABELS,
  SUFFICIENCY_COLORS,
  SUFFICIENCY_LABELS,
  TRS_DOMAIN_LABELS,
} from '../../../common/api/documents'

interface AnalystDocumentQueueProps {
  documents: IntakeDocumentWithUser[]
  onReview: (doc: IntakeDocumentWithUser) => void
  onViewDocument: (doc: IntakeDocumentWithUser) => void
}

function AnalystDocumentQueue({ documents, onReview, onViewDocument }: AnalystDocumentQueueProps) {
  if (documents.length === 0) {
    return (
      <Text c="dimmed" size="sm" p="md">
        No documents submitted for review.
      </Text>
    )
  }

  return (
    <Table.ScrollContainer minWidth={900}>
      <Table striped highlightOnHover verticalSpacing="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Document</Table.Th>
            <Table.Th>Uploaded By</Table.Th>
            <Table.Th>Domain</Table.Th>
            <Table.Th>Category</Table.Th>
            <Table.Th>Type</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th>Sufficiency</Table.Th>
            <Table.Th>Uploaded</Table.Th>
            <Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {documents.map((doc) => (
            <Table.Tr key={doc.id}>
              <Table.Td>
                <Text size="sm" fw={500} lineClamp={1} maw={180}>
                  {doc.fileName}
                </Text>
                <Text size="xs" c="dimmed">
                  {doc.fileType.split('/').pop()?.toUpperCase()}
                </Text>
              </Table.Td>

              <Table.Td>
                <Text size="sm" lineClamp={1} maw={120}>
                  {doc.uploadedByUser.name}
                </Text>
                <Text size="xs" c="dimmed" lineClamp={1} maw={120}>
                  {doc.uploadedByUser.email}
                </Text>
              </Table.Td>

              <Table.Td>
                {doc.trsDomain ? (
                  <Text size="xs" lineClamp={2} maw={120}>
                    {TRS_DOMAIN_LABELS[doc.trsDomain] ?? doc.trsDomain}
                  </Text>
                ) : (
                  <Text size="sm" c="dimmed">
                    —
                  </Text>
                )}
              </Table.Td>

              <Table.Td>
                {doc.evidenceCategory ? (
                  <Text size="xs" lineClamp={2} maw={140}>
                    {doc.evidenceCategory}
                  </Text>
                ) : (
                  <Text size="sm" c="dimmed">
                    —
                  </Text>
                )}
              </Table.Td>

              <Table.Td>
                {doc.evidenceType ? (
                  <Badge variant="outline" size="xs" color="gray">
                    {EVIDENCE_TYPE_LABELS[doc.evidenceType] ?? doc.evidenceType}
                  </Badge>
                ) : (
                  <Text size="sm" c="dimmed">
                    —
                  </Text>
                )}
              </Table.Td>

              <Table.Td>
                <Badge
                  color={DOCUMENT_STATUS_COLORS[doc.status] ?? 'gray'}
                  variant="light"
                  size="sm"
                >
                  {DOCUMENT_STATUS_LABELS[doc.status] ?? doc.status}
                </Badge>
              </Table.Td>

              <Table.Td>
                {doc.sufficiencyRating ? (
                  <Badge
                    color={SUFFICIENCY_COLORS[doc.sufficiencyRating] ?? 'gray'}
                    variant="light"
                    size="sm"
                  >
                    {SUFFICIENCY_LABELS[doc.sufficiencyRating] ?? doc.sufficiencyRating}
                  </Badge>
                ) : (
                  <Text size="sm" c="dimmed">
                    —
                  </Text>
                )}
              </Table.Td>

              <Table.Td>
                <Text size="xs" c="dimmed">
                  {new Date(doc.createdAt).toLocaleDateString()}
                </Text>
              </Table.Td>

              <Table.Td>
                <Group gap="xs">
                  <Tooltip label="View document">
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      size="sm"
                      onClick={() => {
                        onViewDocument(doc)
                      }}
                    >
                      <ArrowSquareOutIcon size={16} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Review">
                    <ActionIcon
                      variant="subtle"
                      color="blue"
                      size="sm"
                      onClick={() => {
                        onReview(doc)
                      }}
                    >
                      <FolderOpenIcon size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  )
}

export { AnalystDocumentQueue }
