import { Alert, Button, Group, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core'
import { useMutation, useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

import { getApiErrorMessage } from '../../common/api/client'
import { executiveReportMutationOptions, executiveReportQueryOptions } from '../../common/api/executiveReport'
import { hasAnyRole } from '../../common/auth/roles'
import { useUserStore } from '../../common/hooks/useUserStore'
import { triggerFileDownload } from '../../common/pdf/triggerFileDownload'

export const Route = createFileRoute('/_private/dashboard')({
  component: Dashboard,
})

function Dashboard() {
  const currentUser = useUserStore((state) => state.user)
  const isEndUser = hasAnyRole(currentUser?.role, ['user'])

  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Dashboard</Title>
        <Text c="dimmed">Operational overview for the admin panel.</Text>
      </div>

      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <Paper withBorder p="md" radius="sm">
          <Text size="sm" c="dimmed">
            Active trips
          </Text>
          <Title order={3}>0</Title>
        </Paper>
        <Paper withBorder p="md" radius="sm">
          <Text size="sm" c="dimmed">
            Pending reviews
          </Text>
          <Title order={3}>0</Title>
        </Paper>
        <Paper withBorder p="md" radius="sm">
          <Text size="sm" c="dimmed">
            Open tickets
          </Text>
          <Title order={3}>0</Title>
        </Paper>
      </SimpleGrid>

      {isEndUser ? <EndUserExecutiveReportCard /> : null}
    </Stack>
  )
}

/**
 * Only ever shows a Published report — the backend's `/end-user/executive-report` route
 * only ever returns a report whose status is `published` (a draft, approved-but-unpublished,
 * or failed report is never reachable through this endpoint at all, regardless of what this
 * component does), and returns 404/`null` when nothing has been published yet, in which case
 * this renders nothing (no card, no button) rather than an empty/broken state.
 */
function EndUserExecutiveReportCard() {
  const reportQuery = useQuery(executiveReportQueryOptions.endUserLatest())
  const report = reportQuery.data ?? null

  const downloadMutation = useMutation({
    ...executiveReportMutationOptions.endUserDownloadPdf(),
    onSuccess: ({ blob, filename }) => {
      triggerFileDownload(blob, filename)
    },
  })

  if (reportQuery.isPending || report === null) return null

  return (
    <Paper withBorder p="md" radius="sm">
      <Group justify="space-between" align="center" wrap="wrap">
        <div>
          <Title order={5}>Executive Transformation Readiness Report</Title>
          <Text size="sm" c="dimmed">
            Version {report.reportVersion}
            {report.publishedAt ? ` · Published ${new Date(report.publishedAt).toLocaleDateString()}` : ''}
          </Text>
        </div>
        <Button
          loading={downloadMutation.isPending}
          disabled={downloadMutation.isPending}
          onClick={() => {
            downloadMutation.mutate()
          }}
        >
          Download Executive Report
        </Button>
      </Group>
      {downloadMutation.isError ? (
        <Alert color="red" title="Unable to download the report" mt="sm">
          {getApiErrorMessage(downloadMutation.error)}
        </Alert>
      ) : null}
    </Paper>
  )
}
