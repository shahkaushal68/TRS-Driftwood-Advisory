import { Alert, Badge, Button, Group, Stack, Text } from '@mantine/core'
import { DownloadSimpleIcon } from '@phosphor-icons/react/DownloadSimple'
import { EyeIcon } from '@phosphor-icons/react/Eye'
import { useMutation } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'

import { getApiErrorMessage } from '../../../common/api/client'
import { executiveReportMutationOptions } from '../../../common/api/executiveReport'
import type { EndUserExecutiveReportStatus } from '../../../common/api/trsDashboard'
import { triggerFileDownload } from '../../../common/pdf/triggerFileDownload'
import {
  getExecutiveReportCustomerStatusColor,
  getExecutiveReportCustomerStatusLabel,
} from '../utils/statusMappings'

interface ExecutiveReportStatusSectionProps {
  report: EndUserExecutiveReportStatus
}

/**
 * Customer-facing Executive Report status (ticket §6/§9). `report.viewReportAvailable` /
 * `downloadPdfAvailable` are the sole source of truth for whether the actions below render —
 * both are backend-decided (`ExecutiveReportService.getReportStatusForEndUser`), never
 * inferred from `report.status` here. "View Executive Report" navigates to the dedicated
 * `/end-user/executive-report` page, which independently fetches and renders the published
 * report (only ever a published report — see that endpoint's own doc comment).
 */
function ExecutiveReportStatusSection({ report }: ExecutiveReportStatusSectionProps) {
  const downloadMutation = useMutation({
    ...executiveReportMutationOptions.endUserDownloadPdf(),
    onSuccess: ({ blob, filename }) => {
      triggerFileDownload(blob, filename)
    },
  })

  return (
    <Stack gap="sm">
      <Group justify="space-between" align="flex-start" wrap="wrap">
        <Text fw={500}>Executive Report Status</Text>
        <Badge color={getExecutiveReportCustomerStatusColor(report.status)} variant="filled">
          {getExecutiveReportCustomerStatusLabel(report.status)}
        </Badge>
      </Group>

      {report.published ? (
        <Text size="sm" c="dimmed">
          Your Executive Report is available.
          {report.publishedAt
            ? ` Published ${new Date(report.publishedAt).toLocaleDateString()}.`
            : ''}
        </Text>
      ) : (
        <Text size="sm" c="dimmed">
          Your Executive Report is not yet available. The Driftwood review team is completing
          evidence review and report preparation.
        </Text>
      )}

      {report.viewReportAvailable || report.downloadPdfAvailable ? (
        <Group gap="sm">
          {report.viewReportAvailable ? (
            <Button
              size="xs"
              variant="light"
              component={Link}
              to="/end-user/executive-report"
              leftSection={<EyeIcon size={14} />}
            >
              View Executive Report
            </Button>
          ) : null}
          {report.downloadPdfAvailable ? (
            <Button
              size="xs"
              leftSection={<DownloadSimpleIcon size={14} />}
              loading={downloadMutation.isPending}
              disabled={downloadMutation.isPending}
              onClick={() => {
                downloadMutation.mutate()
              }}
            >
              Download PDF
            </Button>
          ) : null}
        </Group>
      ) : null}

      {downloadMutation.isError ? (
        <Alert color="red" title="Unable to download the report">
          {getApiErrorMessage(downloadMutation.error)}
        </Alert>
      ) : null}
    </Stack>
  )
}

export { ExecutiveReportStatusSection }
