import { Badge, Group, Paper, Progress, SimpleGrid, Stack, Text } from '@mantine/core'
import type { DefaultMantineColor } from '@mantine/core'
import type { EvidenceDomainSummary } from '../../../common/api/documents'

interface DomainEvidenceSummaryProps {
  summaries: EvidenceDomainSummary[]
}

const STATUS_COLORS: Record<string, DefaultMantineColor> = {
  missing: 'red',
  partial: 'yellow',
  complete: 'green',
}

const STATUS_LABELS: Record<string, string> = {
  missing: 'Missing',
  partial: 'Partial',
  complete: 'Complete',
}

function DomainEvidenceSummary({ summaries }: DomainEvidenceSummaryProps) {
  return (
    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
      {summaries.map((summary) => {
        const uploadedCount = summary.uploadedRequired.length
        const progress =
          summary.requiredTotal > 0 ? (uploadedCount / summary.requiredTotal) * 100 : 0

        return (
          <Paper key={summary.domain} withBorder p="md" radius="sm">
            <Stack gap="sm">
              <Group justify="space-between" align="flex-start">
                <Text fw={600} size="sm">
                  {summary.domainLabel}
                </Text>
                <Badge color={STATUS_COLORS[summary.status] ?? 'gray'} size="sm" variant="light">
                  {STATUS_LABELS[summary.status]}
                </Badge>
              </Group>

              <Progress
                value={progress}
                color={STATUS_COLORS[summary.status] ?? 'gray'}
                size="sm"
                radius="xs"
              />

              <Group gap="xl">
                <Stack gap={2}>
                  <Text size="xs" c="dimmed">
                    Required
                  </Text>
                  <Text fw={700} size="lg">
                    {summary.requiredTotal}
                  </Text>
                </Stack>
                <Stack gap={2}>
                  <Text size="xs" c="dimmed">
                    Uploaded
                  </Text>
                  <Text fw={700} size="lg" c="green">
                    {uploadedCount}
                  </Text>
                </Stack>
                <Stack gap={2}>
                  <Text size="xs" c="dimmed">
                    Missing
                  </Text>
                  <Text fw={700} size="lg" c={summary.missingRequired.length > 0 ? 'red' : 'green'}>
                    {summary.missingRequired.length}
                  </Text>
                </Stack>
              </Group>

              {summary.uploadedRequired.length > 0 || summary.missingRequired.length > 0 ? (
                <Stack gap={4}>
                  <Text size="xs" c="dimmed" fw={500}>
                    Documents:
                  </Text>
                  {summary.uploadedRequired.map((item) => (
                    <Text key={item} size="xs" c="green" td="line-through">
                      • {item}
                    </Text>
                  ))}
                  {summary.missingRequired.map((item) => (
                    <Text key={item} size="xs" c="red">
                      • {item}
                    </Text>
                  ))}
                </Stack>
              ) : null}
            </Stack>
          </Paper>
        )
      })}
    </SimpleGrid>
  )
}

export { DomainEvidenceSummary }
