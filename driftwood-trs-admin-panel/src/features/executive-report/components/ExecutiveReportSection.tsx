import MDEditor from '@uiw/react-md-editor'
import '@uiw/react-md-editor/markdown-editor.css'
import {
  Alert,
  Badge,
  Button,
  Divider,
  Group,
  LoadingOverlay,
  Paper,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { getApiErrorMessage } from '../../../common/api/client'
import type { ExecutiveReport } from '../../../common/api/executiveReport'
import {
  DOWNLOADABLE_REPORT_STATUSES,
  EXECUTIVE_REPORT_STATUS_COLORS,
  EXECUTIVE_REPORT_STATUS_LABELS,
  executiveReportMutationOptions,
  executiveReportQueryKeys,
  executiveReportQueryOptions,
} from '../../../common/api/executiveReport'
import { hasAnyRole } from '../../../common/auth/roles'
import { useUserStore } from '../../../common/hooks/useUserStore'
import { triggerFileDownload } from '../../../common/pdf/triggerFileDownload'

interface ExecutiveReportSectionProps {
  customerId: string
  customerName: string
  /** Resolves a user id (`generatedByUserId`, `approvedByUserId`, ...) to a display name.
   *  Reuses whatever user directory data the parent page already has loaded (e.g. the
   *  Document Review page's customer/user Autocomplete data) instead of a second fetch. */
  resolveUserName: (userId: string) => string
}

function formatDateTime(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString()
}

/**
 * Executive Transformation Readiness Report section of the customer workspace. Reuses the
 * existing Document Review page's data/customer context (see `AnalystDocumentsPage`) — this
 * is one more stacked `Paper` section alongside "Evidence Summary" and "Uploaded Documents",
 * not a separate page.
 *
 * Backend contract note: `GET .../eligibility`, `POST .../generate`, `GET .../executive-report`,
 * `PATCH .../:reportId` (Save Draft), `POST .../:reportId/approve` (Approve Report), and
 * `POST .../:reportId/publish` (Publish to End User) all exist today (see
 * `driftwood-trs-server/src/executive-report`).
 */
function ExecutiveReportSection({
  customerId,
  customerName,
  resolveUserName,
}: ExecutiveReportSectionProps) {
  const queryClient = useQueryClient()

  const eligibilityQuery = useQuery(executiveReportQueryOptions.eligibility(customerId))
  const reportQuery = useQuery(executiveReportQueryOptions.latest(customerId))

  const generateMutation = useMutation({
    ...executiveReportMutationOptions.generate(customerId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: executiveReportQueryKeys.eligibility(customerId),
      })
      void queryClient.invalidateQueries({ queryKey: executiveReportQueryKeys.latest(customerId) })
    },
  })

  const eligibility = eligibilityQuery.data
  const report = reportQuery.data ?? null

  const handleGenerate = () => {
    if (!eligibility?.eligible || generateMutation.isPending) return
    generateMutation.mutate()
  }

  return (
    <Paper withBorder p="md" radius="sm" pos="relative">
      <Group justify="space-between" align="flex-start" mb="md">
        <div>
          <Title order={5}>Executive Report</Title>
          <Text c="dimmed" size="xs">
            {customerName}
          </Text>
        </div>
        {eligibility ? (
          <Badge color={eligibility.eligible ? 'green' : 'gray'} variant="light">
            {eligibility.status}
          </Badge>
        ) : null}
      </Group>

      <LoadingOverlay visible={eligibilityQuery.isPending || reportQuery.isPending} />

      {eligibilityQuery.isError ? (
        <Alert color="red" title="Unable to load Executive Report eligibility" mb="md">
          {getApiErrorMessage(eligibilityQuery.error)}
        </Alert>
      ) : eligibility ? (
        <Alert
          color={eligibility.eligible ? 'green' : 'yellow'}
          variant="light"
          mb="md"
          title={
            eligibility.eligible
              ? 'Executive Report is ready to generate.'
              : 'Executive Report is not ready to generate.'
          }
        >
          <Stack gap={4}>
            <Text size="sm">
              {eligibility.approvedCategories} of {eligibility.requiredCategories} required evidence
              categories have completed review.
            </Text>
            <Text size="sm" c="dimmed">
              {eligibility.reason}
            </Text>
            {eligibility.missingCategories.length > 0 ? (
              <div>
                <Text size="xs" fw={600} mt={4}>
                  Missing:
                </Text>
                {eligibility.missingCategories.map((category) => (
                  <Text key={category} size="xs" c="red">
                    • {category}
                  </Text>
                ))}
              </div>
            ) : null}
            {eligibility.pendingCategories.length > 0 ? (
              <div>
                <Text size="xs" fw={600} mt={4}>
                  Pending:
                </Text>
                {eligibility.pendingCategories.map((category) => (
                  <Text key={category} size="xs" c="orange">
                    • {category}
                  </Text>
                ))}
              </div>
            ) : null}
          </Stack>
        </Alert>
      ) : null}

      <Group mb="md">
        <Button
          onClick={handleGenerate}
          disabled={!eligibility?.eligible || generateMutation.isPending}
          loading={generateMutation.isPending}
        >
          {report ? 'Regenerate Report' : 'Generate Report'}
        </Button>
      </Group>

      {generateMutation.isPending ? (
        <Alert color="blue" variant="light" mb="md">
          Generating Executive Report...
        </Alert>
      ) : null}

      {generateMutation.isError ? (
        <Alert color="red" title="Executive Report generation failed" mb="md">
          {getApiErrorMessage(generateMutation.error)} You can try generating again once the
          underlying issue is resolved.
        </Alert>
      ) : null}

      {reportQuery.isError ? (
        <Alert color="red" title="Unable to load Executive Report">
          {getApiErrorMessage(reportQuery.error)}
        </Alert>
      ) : report ? (
        <ExecutiveReportDetail
          report={report}
          customerId={customerId}
          resolveUserName={resolveUserName}
        />
      ) : !generateMutation.isPending && !eligibilityQuery.isPending ? (
        <Text c="dimmed" size="sm">
          No Executive Report has been generated yet.
        </Text>
      ) : null}
    </Paper>
  )
}

function ExecutiveReportDetail({
  report,
  customerId,
  resolveUserName,
}: {
  report: ExecutiveReport
  customerId: string
  resolveUserName: (userId: string) => string
}) {
  const queryClient = useQueryClient()
  const currentUser = useUserStore((state) => state.user)
  const canEditReport = hasAnyRole(currentUser?.role, ['admin', 'analyst'])

  const statusLabel = EXECUTIVE_REPORT_STATUS_LABELS[report.reportStatus] ?? report.reportStatus
  const statusColor = EXECUTIVE_REPORT_STATUS_COLORS[report.reportStatus] ?? 'gray'
  const isDownloadable = DOWNLOADABLE_REPORT_STATUSES.includes(report.reportStatus)
  const isDraft = report.reportStatus === 'draft'

  // Only a `draft` report's content may be edited — approving/publishing it locks the
  // content down (see `ExecutiveReportService.updateReport`'s 409 for any other status).
  // Local edit buffer is keyed to `report.id`/`reportStatus` via the effect below so it
  // always resets when a new report version loads or the status changes out from under it
  // (e.g. after Approve succeeds).
  const [editedContent, setEditedContent] = useState(report.generatedReportMarkdown ?? '')
  const [editedReportId, setEditedReportId] = useState(report.id)
  if (editedReportId !== report.id) {
    // A different report row loaded (e.g. after regeneration) — reset the edit buffer to
    // match it rather than carrying over stale edits from the previous version.
    setEditedReportId(report.id)
    setEditedContent(report.generatedReportMarkdown ?? '')
  }
  const hasUnsavedChanges = isDraft && editedContent !== (report.generatedReportMarkdown ?? '')

  const downloadMutation = useMutation({
    ...executiveReportMutationOptions.downloadPdf(customerId, report.id),
    onSuccess: ({ blob, filename }) => {
      triggerFileDownload(blob, filename)
    },
  })

  const updateMutation = useMutation({
    ...executiveReportMutationOptions.update(customerId, report.id),
    onSuccess: (updated) => {
      queryClient.setQueryData(executiveReportQueryKeys.latest(customerId), updated)
      setEditedContent(updated.generatedReportMarkdown ?? '')
    },
  })

  const approveMutation = useMutation({
    ...executiveReportMutationOptions.approve(customerId, report.id),
    onSuccess: (updated) => {
      queryClient.setQueryData(executiveReportQueryKeys.latest(customerId), updated)
    },
  })

  const publishMutation = useMutation({
    ...executiveReportMutationOptions.publish(customerId, report.id),
    onSuccess: (updated) => {
      queryClient.setQueryData(executiveReportQueryKeys.latest(customerId), updated)
    },
  })

  const isApproved = report.reportStatus === 'approved'

  const handleSaveDraft = () => {
    if (!canEditReport || !isDraft || !hasUnsavedChanges || updateMutation.isPending) return
    updateMutation.mutate(editedContent)
  }

  const handleApprove = () => {
    if (!canEditReport || !isDraft || hasUnsavedChanges || approveMutation.isPending) return
    if (!editedContent.trim()) return
    approveMutation.mutate()
  }

  const handlePublish = () => {
    if (!canEditReport || !isApproved || publishMutation.isPending) return
    publishMutation.mutate()
  }

  return (
    <Stack gap="md">
      <Group gap="sm" justify="space-between" wrap="wrap">
        <Group gap="sm">
          <Badge color={statusColor} variant="filled" size="md">
            {statusLabel}
          </Badge>
          <Text size="sm" c="dimmed">
            Version {report.reportVersion}
          </Text>
        </Group>
        <Button
          variant="default"
          size="sm"
          loading={downloadMutation.isPending}
          disabled={!isDownloadable || downloadMutation.isPending}
          onClick={() => {
            if (!isDownloadable || downloadMutation.isPending) return
            downloadMutation.mutate()
          }}
        >
          Download PDF
        </Button>
      </Group>

      {downloadMutation.isError ? (
        <Alert color="red" title="Unable to download the PDF">
          {getApiErrorMessage(downloadMutation.error)}
        </Alert>
      ) : null}

      {report.reportStatus === 'draft' ? (
        <Alert color="yellow" variant="light">
          This report is a draft — internal review is required before it can be approved or
          published to the End User.
        </Alert>
      ) : null}

      {report.reportStatus === 'generation_failed' && report.generationErrorMessage ? (
        <Alert color="red" title="Generation failed">
          {report.generationErrorMessage}
        </Alert>
      ) : null}

      {report.reportStatus === 'needs_regeneration' ? (
        <Alert color="orange" title="Newer evidence available">
          New evidence or review changes are available. This report may require regeneration.
        </Alert>
      ) : null}

      <AuditGrid report={report} resolveUserName={resolveUserName} />

      {report.generatedReportMarkdown ? (
        <div>
          <Text size="sm" fw={500} mb={4}>
            Report Content
          </Text>
          {isDraft && canEditReport ? (
            <div data-color-mode="light">
              <MDEditor
                value={editedContent}
                onChange={(val) => {
                  setEditedContent(val ?? '')
                }}
                height={400}
              />
            </div>
          ) : (
            <div
              data-color-mode="light"
              style={{ border: '1px solid var(--mantine-color-gray-3)' }}
            >
              <MDEditor.Markdown
                source={report.generatedReportMarkdown}
                style={{ padding: 16, maxHeight: 480, overflowY: 'auto' }}
              />
            </div>
          )}
        </div>
      ) : null}

      {updateMutation.isError ? (
        <Alert color="red" title="Unable to save draft">
          {getApiErrorMessage(updateMutation.error)}
        </Alert>
      ) : null}

      {approveMutation.isError ? (
        <Alert color="red" title="Unable to approve report">
          {getApiErrorMessage(approveMutation.error)}
        </Alert>
      ) : null}

      {publishMutation.isError ? (
        <Alert color="red" title="Unable to publish report">
          {getApiErrorMessage(publishMutation.error)}
        </Alert>
      ) : null}

      <Divider />

      <div>
        <Group gap="sm" mb={4}>
          <Button
            variant="default"
            size="sm"
            loading={updateMutation.isPending}
            disabled={!canEditReport || !isDraft || !hasUnsavedChanges || updateMutation.isPending}
            onClick={handleSaveDraft}
          >
            Save Draft
          </Button>
          <Button
            variant="default"
            size="sm"
            loading={approveMutation.isPending}
            disabled={
              !canEditReport ||
              !isDraft ||
              hasUnsavedChanges ||
              !editedContent.trim() ||
              approveMutation.isPending
            }
            onClick={handleApprove}
          >
            Approve Report
          </Button>
          <Button
            variant="default"
            size="sm"
            loading={publishMutation.isPending}
            disabled={!canEditReport || !isApproved || publishMutation.isPending}
            onClick={handlePublish}
          >
            Publish to End User
          </Button>
        </Group>
        <Text size="xs" c="dimmed">
          {hasUnsavedChanges
            ? 'Save your draft edits before approving this report.'
            : !isApproved
              ? 'Approve the report before it can be published to the End User.'
              : null}
        </Text>
      </div>
    </Stack>
  )
}

function AuditGrid({
  report,
  resolveUserName,
}: {
  report: ExecutiveReport
  resolveUserName: (userId: string) => string
}) {
  return (
    <Group gap="xl" align="flex-start" wrap="wrap">
      <AuditEntry
        label="Generated"
        at={report.generatedAt}
        byUserId={report.generatedByUserId}
        resolveUserName={resolveUserName}
      />
      <AuditEntry
        label="Last Updated"
        at={report.lastUpdatedAt}
        byUserId={report.lastUpdatedByUserId}
        resolveUserName={resolveUserName}
      />
      <AuditEntry
        label="Approved"
        at={report.approvedAt}
        byUserId={report.approvedByUserId}
        resolveUserName={resolveUserName}
      />
      <AuditEntry
        label="Published"
        at={report.publishedAt}
        byUserId={report.publishedByUserId}
        resolveUserName={resolveUserName}
      />
    </Group>
  )
}

function AuditEntry({
  label,
  at,
  byUserId,
  resolveUserName,
}: {
  label: string
  at: string | null
  byUserId: string | null
  resolveUserName: (userId: string) => string
}) {
  return (
    <Stack gap={2}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text size="sm">{formatDateTime(at)}</Text>
      <Text size="xs" c="dimmed">
        {byUserId ? `by ${resolveUserName(byUserId)}` : '—'}
      </Text>
    </Stack>
  )
}

export { ExecutiveReportSection }
