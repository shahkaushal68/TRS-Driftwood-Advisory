import { ActionIcon, Badge, Group, Menu, Table, Text, Tooltip } from '@mantine/core'
import { ArrowCounterClockwiseIcon } from '@phosphor-icons/react/ArrowCounterClockwise'
import { ArrowSquareOutIcon } from '@phosphor-icons/react/ArrowSquareOut'
import { ClipboardTextIcon } from '@phosphor-icons/react/ClipboardText'
import { ClockCounterClockwiseIcon } from '@phosphor-icons/react/ClockCounterClockwise'
import { DotsThreeVerticalIcon } from '@phosphor-icons/react/DotsThreeVertical'
import { DownloadSimpleIcon } from '@phosphor-icons/react/DownloadSimple'
import { EyeIcon } from '@phosphor-icons/react/Eye'
import { NotePencilIcon } from '@phosphor-icons/react/NotePencil'
import { FileTextIcon } from '@phosphor-icons/react/FileText'
import { TrashSimpleIcon } from '@phosphor-icons/react/TrashSimple'
import { UserFocusIcon } from '@phosphor-icons/react/UserFocus'
import { WarningIcon } from '@phosphor-icons/react/Warning'

import type { IntakeDocument } from '../../../common/api/documents'
import {
  AI_REVIEW_STATUS_COLORS,
  AI_REVIEW_STATUS_LABELS,
  DOCUMENT_STATUS_COLORS,
  DOCUMENT_STATUS_LABELS,
  EVIDENCE_TYPE_LABELS,
  TRS_DOMAIN_LABELS,
} from '../../../common/api/documents'
import { SortableTh } from '../../../components/pagination'
import { useAiReviewGate } from '../utils/aiReviewEligibility'

interface SortProps {
  sortBy: string
  sortDirection: 'asc' | 'desc'
  onSort: (column: string) => void
}

interface DocumentsTableProps {
  documents: IntakeDocument[]
  onClassify?: (doc: IntakeDocument) => void
  onViewDocument?: (doc: IntakeDocument) => void
  onViewFindings?: (doc: IntakeDocument) => void
  onReview?: (doc: IntakeDocument) => void
  onManualReview?: (doc: IntakeDocument) => void
  onDelete?: (doc: IntakeDocument) => void
  /**
   * Presence of this prop switches the Actions column to the menu-based layout (View
   * Details / Download / Document History / Reset Document) used by the analyst
   * Document Review view. Without it, the legacy per-action icon row renders unchanged —
   * this keeps the end-user Document Intake page's Actions column untouched.
   */
  onResetDocument?: (doc: IntakeDocument) => void
  /** Only Admin/Analyst may see the Reset Document menu item; end users never do. */
  canResetDocument?: boolean
  sort?: SortProps
}

function DocumentsTable({
  documents,
  onClassify,
  onViewDocument,
  onViewFindings,
  onReview,
  onManualReview,
  onDelete,
  onResetDocument,
  canResetDocument = false,
  sort,
}: DocumentsTableProps) {
  if (documents.length === 0) {
    return (
      <Text c="dimmed" size="sm" p="md">
        No documents uploaded yet.
      </Text>
    )
  }

  return (
    <Table.ScrollContainer minWidth={700}>
      <Table striped highlightOnHover verticalSpacing="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Document</Table.Th>
            {sort ? (
              <SortableTh label="Domain" column="trsDomain" {...sort} />
            ) : (
              <Table.Th>Domain</Table.Th>
            )}
            {sort ? (
              <SortableTh label="Category" column="evidenceCategory" {...sort} />
            ) : (
              <Table.Th>Category</Table.Th>
            )}
            <Table.Th>Type</Table.Th>
            {sort ? (
              <SortableTh label="Uploaded" column="createdAt" {...sort} />
            ) : (
              <Table.Th>Uploaded</Table.Th>
            )}
            <Table.Th>Status</Table.Th>
            <Table.Th>AI Review</Table.Th>
            <Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {documents.map((doc) => (
            <DocumentRow
              key={doc.id}
              doc={doc}
              onClassify={onClassify}
              onViewDocument={onViewDocument}
              onViewFindings={onViewFindings}
              onReview={onReview}
              onManualReview={onManualReview}
              onDelete={onDelete}
              onResetDocument={onResetDocument}
              canResetDocument={canResetDocument}
            />
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  )
}

interface DocumentRowProps {
  doc: IntakeDocument
  // `| undefined` (not just `?:`) because these are forwarded from the parent's own
  // optional props, which under `exactOptionalPropertyTypes` are typed as
  // `T | undefined` locally — passing that value through needs the slot to accept it.
  onClassify?: ((doc: IntakeDocument) => void) | undefined
  onViewDocument?: ((doc: IntakeDocument) => void) | undefined
  onViewFindings?: ((doc: IntakeDocument) => void) | undefined
  onReview?: ((doc: IntakeDocument) => void) | undefined
  onManualReview?: ((doc: IntakeDocument) => void) | undefined
  onDelete?: ((doc: IntakeDocument) => void) | undefined
  onResetDocument?: ((doc: IntakeDocument) => void) | undefined
  canResetDocument: boolean
}

/**
 * Pulled out of `DocumentsTable`'s `.map()` so `useAiReviewGate` — which needs to fetch
 * eligibility per document — can be called per row (hooks can't be called inside a loop
 * in the parent). `enabled: onReview !== undefined` skips the request entirely for table
 * instances that never show AI Review actions (e.g. the end-user Document Intake page).
 */
function DocumentRow({
  doc,
  onClassify,
  onViewDocument,
  onViewFindings,
  onReview,
  onManualReview,
  onDelete,
  onResetDocument,
  canResetDocument,
}: DocumentRowProps) {
  const canClassify =
    onClassify !== undefined && (doc.status === 'uploaded' || doc.status === 'classified')
  const hasPublishedFindings = doc.status === 'published_to_end_user'
  const isReset = doc.resetRequired

  const gate = useAiReviewGate(doc, { enabled: onReview !== undefined })
  const canReview = onReview !== undefined && gate.reviewEnabled
  // Manual Review is always offered as an independent, parallel path to AI Review — not
  // gated on `gate.showManualReview` (which only covers "no active prompt" fallback) —
  // since the backend treats `manual_review` and `ai_review_response` as coexisting
  // reviews on the same document, not mutually exclusive alternatives. A reset/awaiting
  // resubmission document is the one exception: its current file is about to be replaced.
  const canManualReview = onManualReview !== undefined && !isReset

  return (
    <Table.Tr>
      <Table.Td>
        <Text size="sm" fw={500} lineClamp={1} maw={200}>
          {doc.fileName}
        </Text>
        <Text size="xs" c="dimmed">
          {doc.fileType.split('/').pop()?.toUpperCase()}
        </Text>
      </Table.Td>

      <Table.Td>
        {doc.trsDomain ? (
          <Text size="sm" lineClamp={1} maw={160}>
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
          <Text size="sm" lineClamp={1} maw={160}>
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
        <Text size="xs" c="dimmed">
          {new Date(doc.createdAt).toLocaleDateString()}
        </Text>
      </Table.Td>

      <Table.Td>
        {isReset ? (
          <Badge
            color="red"
            variant="filled"
            size="sm"
            leftSection={<WarningIcon size={12} weight="fill" />}
          >
            Reset / Resubmission Required
          </Badge>
        ) : (
          <Badge color={DOCUMENT_STATUS_COLORS[doc.status] ?? 'gray'} variant="light" size="sm">
            {DOCUMENT_STATUS_LABELS[doc.status] ?? doc.status}
          </Badge>
        )}
      </Table.Td>

      <Table.Td>
        {isReset ? (
          <Badge color="gray" variant="light" size="sm">
            Pending Resubmission
          </Badge>
        ) : (
          <Badge
            color={AI_REVIEW_STATUS_COLORS[doc.aiReviewStatus] ?? 'gray'}
            variant="light"
            size="sm"
          >
            {AI_REVIEW_STATUS_LABELS[doc.aiReviewStatus] ?? doc.aiReviewStatus}
          </Badge>
        )}
      </Table.Td>

      <Table.Td>
        {onResetDocument !== undefined ? (
          <Group gap={4} wrap="nowrap">
            {onReview !== undefined ? (
              <Tooltip label="View Details">
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="sm"
                  onClick={() => {
                    onReview(doc)
                  }}
                >
                  <EyeIcon size={16} />
                </ActionIcon>
              </Tooltip>
            ) : null}

            {onReview !== undefined ? (
              <Tooltip label={gate.helperText} multiline w={220}>
                <Badge size="xs" variant="light" color={gate.badgeColor}>
                  {gate.badgeLabel}
                </Badge>
              </Tooltip>
            ) : null}

            {canManualReview ? (
              <Tooltip label="Manual Review">
                <ActionIcon
                  variant="subtle"
                  color="orange"
                  size="sm"
                  onClick={() => {
                    onManualReview(doc)
                  }}
                >
                  <UserFocusIcon size={16} />
                </ActionIcon>
              </Tooltip>
            ) : null}

            <Menu position="bottom-end" withinPortal shadow="md">
              <Menu.Target>
                <ActionIcon variant="subtle" color="gray" size="sm">
                  <DotsThreeVerticalIcon size={16} weight="bold" />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                {onReview !== undefined ? (
                  <Menu.Item
                    leftSection={<EyeIcon size={14} />}
                    onClick={() => {
                      onReview(doc)
                    }}
                  >
                    View Details
                  </Menu.Item>
                ) : null}
                {onViewDocument !== undefined ? (
                  <Menu.Item
                    leftSection={<DownloadSimpleIcon size={14} />}
                    onClick={() => {
                      onViewDocument(doc)
                    }}
                  >
                    Download
                  </Menu.Item>
                ) : null}
                {hasPublishedFindings && onViewFindings !== undefined ? (
                  <Menu.Item
                    leftSection={<FileTextIcon size={14} />}
                    onClick={() => {
                      onViewFindings(doc)
                    }}
                  >
                    View Report
                  </Menu.Item>
                ) : null}
                {canClassify ? (
                  <Menu.Item
                    leftSection={<NotePencilIcon size={14} />}
                    onClick={() => {
                      onClassify(doc)
                    }}
                  >
                    Edit classification
                  </Menu.Item>
                ) : null}
                <Menu.Item leftSection={<ClockCounterClockwiseIcon size={14} />} disabled>
                  Document History
                </Menu.Item>
                {canResetDocument && !isReset ? (
                  <>
                    <Menu.Divider />
                    <Menu.Item
                      color="red"
                      leftSection={<ArrowCounterClockwiseIcon size={14} />}
                      onClick={() => {
                        onResetDocument(doc)
                      }}
                    >
                      Reset Document
                    </Menu.Item>
                  </>
                ) : null}
              </Menu.Dropdown>
            </Menu>
          </Group>
        ) : (
          <Group gap="xs" wrap="nowrap">
            {onViewDocument !== undefined ? (
              <Tooltip label="Download Evidence Document">
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
            ) : null}

            {canClassify ? (
              <Tooltip label="Edit classification">
                <ActionIcon
                  variant="subtle"
                  color="blue"
                  size="sm"
                  onClick={() => {
                    onClassify(doc)
                  }}
                >
                  <NotePencilIcon size={16} />
                </ActionIcon>
              </Tooltip>
            ) : null}

            {onReview !== undefined ? (
              <Badge size="xs" variant="light" color={gate.badgeColor}>
                {gate.badgeLabel}
              </Badge>
            ) : null}

            {onReview !== undefined ? (
              <Tooltip label={gate.helperText} multiline w={220}>
                <span style={{ display: 'inline-flex' }}>
                  <ActionIcon
                    variant="subtle"
                    color="violet"
                    size="sm"
                    aria-disabled={!canReview}
                    style={canReview ? undefined : { opacity: 0.5, pointerEvents: 'none' }}
                    onClick={() => {
                      if (canReview) onReview(doc)
                    }}
                  >
                    <ClipboardTextIcon size={16} />
                  </ActionIcon>
                </span>
              </Tooltip>
            ) : null}

            {canManualReview ? (
              <Tooltip label="Manual Review">
                <ActionIcon
                  variant="subtle"
                  color="orange"
                  size="sm"
                  onClick={() => {
                    onManualReview(doc)
                  }}
                >
                  <UserFocusIcon size={16} />
                </ActionIcon>
              </Tooltip>
            ) : null}

            {hasPublishedFindings && onViewFindings !== undefined ? (
              <Tooltip label="View Report">
                <ActionIcon
                  variant="subtle"
                  color="green"
                  size="sm"
                  onClick={() => {
                    onViewFindings(doc)
                  }}
                >
                  <FileTextIcon size={16} />
                </ActionIcon>
              </Tooltip>
            ) : null}

            {onDelete !== undefined ? (
              <Tooltip label="Delete document">
                <ActionIcon
                  variant="subtle"
                  color="red"
                  size="sm"
                  onClick={() => {
                    onDelete(doc)
                  }}
                >
                  <TrashSimpleIcon size={16} />
                </ActionIcon>
              </Tooltip>
            ) : null}
          </Group>
        )}
      </Table.Td>
    </Table.Tr>
  )
}

export { DocumentsTable }
