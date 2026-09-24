import { Alert, Button, Group, Paper, Skeleton, Stack, Text, Title } from '@mantine/core'
import { ArrowClockwiseIcon } from '@phosphor-icons/react/ArrowClockwise'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

import { getApiErrorMessage } from '../../common/api/client'
import { trsDashboardQueryOptions } from '../../common/api/trsDashboard'
import { requireRole } from '../../common/auth/roles'
import { AssessmentStageTracker } from '../../features/trs-dashboard/components/AssessmentStageTracker'
import { DomainReviewProgressCards } from '../../features/trs-dashboard/components/DomainReviewProgressCards'
import { EvidenceCategoryTable } from '../../features/trs-dashboard/components/EvidenceCategoryTable'
import { EvidenceStrengthSection } from '../../features/trs-dashboard/components/EvidenceStrengthSection'
import { ExecutiveReportStatusSection } from '../../features/trs-dashboard/components/ExecutiveReportStatusSection'
import { getAssessmentStageLabel } from '../../features/trs-dashboard/utils/statusMappings'

export const Route = createFileRoute('/_private/trs-dashboard')({
  beforeLoad: () => {
    requireRole(['user'])
  },
  component: TrsReviewProgressDashboard,
})

/**
 * The End User's read-only TRS Review Progress Dashboard. Every value on this page comes from
 * `GET /end-user/trs-dashboard` (`TrsDashboardService.getDashboard`) — the customer's own
 * assessment, resolved from the authenticated session, never from a URL param or client
 * state. This page has no upload, resubmission, or review controls; those live on the
 * existing Document Intake page (`/documents`).
 */
function TrsReviewProgressDashboard() {
  const dashboardQuery = useQuery(trsDashboardQueryOptions.dashboard())

  if (dashboardQuery.isPending) {
    return (
      <Stack gap="lg">
        <DashboardSkeleton />
      </Stack>
    )
  }

  if (dashboardQuery.isError) {
    return (
      <Stack gap="lg">
        <div>
          <Title order={2}>TRS Review Progress</Title>
        </div>
        <Alert color="red" title="Unable to load your review progress">
          <Stack gap="sm">
            <Text size="sm">{getApiErrorMessage(dashboardQuery.error)}</Text>
            <Group>
              <Button
                size="xs"
                variant="light"
                leftSection={<ArrowClockwiseIcon size={14} />}
                onClick={() => {
                  void dashboardQuery.refetch()
                }}
              >
                Retry
              </Button>
            </Group>
          </Stack>
        </Alert>
      </Stack>
    )
  }

  const dashboard = dashboardQuery.data

  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>TRS Review Progress</Title>
        <Text c="dimmed" size="sm">
          Track where your Transformation Readiness assessment currently stands.
        </Text>
      </div>

      <Paper withBorder p="md" radius="sm">
        <Stack gap="md">
          <Group justify="space-between" align="flex-start" wrap="wrap">
            <div>
              <Text size="sm" c="dimmed">
                Customer
              </Text>
              <Text fw={600}>{dashboard.customerName}</Text>
            </div>
            {dashboard.lastUpdatedAt ? (
              <div>
                <Text size="sm" c="dimmed">
                  Last Updated
                </Text>
                <Text fw={500}>{new Date(dashboard.lastUpdatedAt).toLocaleString()}</Text>
              </div>
            ) : null}
            <div>
              <Text size="sm" c="dimmed">
                Current Stage
              </Text>
              <Text fw={500}>{getAssessmentStageLabel(dashboard.assessmentStage)}</Text>
            </div>
          </Group>

          <AssessmentStageTracker currentStage={dashboard.assessmentStage} />
        </Stack>
      </Paper>

      <Paper withBorder p="md" radius="sm">
        <ExecutiveReportStatusSection report={dashboard.executiveReport} />
      </Paper>

      <div>
        <Title order={5} mb="md">
          TRS Domain Review Progress
        </Title>
        {dashboard.domains.length > 0 ? (
          <DomainReviewProgressCards domains={dashboard.domains} />
        ) : (
          <Text c="dimmed" size="sm">
            No TRS domains have been configured yet.
          </Text>
        )}
      </div>

      <Paper withBorder p="md" radius="sm">
        <Title order={5} mb="md">
          Evidence Category Review Status
        </Title>
        <EvidenceCategoryTable categories={dashboard.categories} />
      </Paper>

      <EvidenceStrengthSection evidenceStrength={dashboard.evidenceStrength} />
    </Stack>
  )
}

function DashboardSkeleton() {
  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>TRS Review Progress</Title>
        <Text c="dimmed" size="sm">
          Loading your review progress…
        </Text>
      </div>
      {[1, 2, 3].map((key) => (
        <Skeleton key={key} height={96} radius="sm" />
      ))}
    </Stack>
  )
}
