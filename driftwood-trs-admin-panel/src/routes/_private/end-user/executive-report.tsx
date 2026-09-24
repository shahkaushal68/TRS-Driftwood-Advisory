import MDEditor from '@uiw/react-md-editor'
import '@uiw/react-md-editor/markdown-editor.css'
import { Alert, Button, Group, Paper, Skeleton, Stack, Text, Title } from '@mantine/core'
import { ArrowLeftIcon } from '@phosphor-icons/react/ArrowLeft'
import { ArrowClockwiseIcon } from '@phosphor-icons/react/ArrowClockwise'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'

import { getApiErrorMessage } from '../../../common/api/client'
import { executiveReportQueryOptions } from '../../../common/api/executiveReport'
import { trsDashboardQueryOptions } from '../../../common/api/trsDashboard'
import { requireRole } from '../../../common/auth/roles'

export const Route = createFileRoute('/_private/end-user/executive-report')({
  beforeLoad: () => {
    requireRole(['user'])
  },
  component: ExecutiveReportPage,
})

/**
 * The End User's read-only Executive Report viewer. All content comes from
 * `GET /end-user/executive-report` (`ExecutiveReportService.getPublishedReportForEndUser`),
 * which resolves the customer from the authenticated session and only ever returns a
 * `published` report — never draft, under-review, approved-but-unpublished, or rejected
 * content. The customer name shown in the header comes from the existing
 * `GET /end-user/trs-dashboard` endpoint (same session-scoped identity), since the report
 * endpoint itself deliberately omits it. There is no edit/approve/publish/regenerate control
 * anywhere on this page — the Markdown is rendered as static content, not an editable field.
 */
function ExecutiveReportPage() {
  const reportQuery = useQuery(executiveReportQueryOptions.endUserLatest())
  const dashboardQuery = useQuery(trsDashboardQueryOptions.dashboard())

  return (
    <Stack gap="lg">
      <div>
        <Button
          component={Link}
          to="/trs-dashboard"
          variant="subtle"
          size="xs"
          px={0}
          leftSection={<ArrowLeftIcon size={14} />}
        >
          Back to Dashboard
        </Button>
      </div>

      {reportQuery.isPending ? (
        <ExecutiveReportSkeleton />
      ) : reportQuery.isError ? (
        <Alert color="red" title="Unable to load the Executive Report">
          <Stack gap="sm">
            <Text size="sm">{getApiErrorMessage(reportQuery.error)}</Text>
            <Group>
              <Button
                size="xs"
                variant="light"
                leftSection={<ArrowClockwiseIcon size={14} />}
                onClick={() => {
                  void reportQuery.refetch()
                }}
              >
                Try Again
              </Button>
            </Group>
          </Stack>
        </Alert>
      ) : reportQuery.data === null ? (
        <div>
          <Title order={2} mb="xs">
            Executive Report
          </Title>
          <Text c="dimmed" size="sm">
            Your Executive Report is not yet available. The review team is completing the
            assessment and report preparation.
          </Text>
        </div>
      ) : (
        <>
          <div>
            <Title order={2}>TRS Master Transformation Readiness Report</Title>
          </div>

          <Paper withBorder p="md" radius="sm">
            <Group gap="xl" wrap="wrap">
              <div>
                <Text size="sm" c="dimmed">
                  Customer
                </Text>
                <Text fw={600}>
                  {dashboardQuery.isPending ? '—' : (dashboardQuery.data?.customerName ?? '—')}
                </Text>
              </div>
              <div>
                <Text size="sm" c="dimmed">
                  Report Version
                </Text>
                <Text fw={600}>{reportQuery.data.reportVersion}</Text>
              </div>
              <div>
                <Text size="sm" c="dimmed">
                  Published
                </Text>
                <Text fw={600}>
                  {reportQuery.data.publishedAt
                    ? new Date(reportQuery.data.publishedAt).toLocaleDateString()
                    : '—'}
                </Text>
              </div>
            </Group>
          </Paper>

          <Paper withBorder radius="sm">
            {reportQuery.data.reportMarkdown ? (
              <div data-color-mode="light" style={{ overflowX: 'auto' }}>
                <MDEditor.Markdown
                  source={reportQuery.data.reportMarkdown}
                  style={{ padding: 24, background: 'transparent' }}
                />
              </div>
            ) : (
              <Text c="dimmed" size="sm" p="md">
                Report content is not available.
              </Text>
            )}
          </Paper>
        </>
      )}
    </Stack>
  )
}

function ExecutiveReportSkeleton() {
  return (
    <Stack gap="lg">
      <Skeleton height={32} width="60%" radius="sm" />
      <Skeleton height={80} radius="sm" />
      <Skeleton height={320} radius="sm" />
    </Stack>
  )
}
