import { Badge, Group, Paper, SimpleGrid, Stack, Text } from '@mantine/core'

import type { DomainReviewProgress } from '../../../common/api/trsDashboard'
import { getDomainReviewStatusColor, getDomainReviewStatusLabel } from '../utils/statusMappings'

interface DomainReviewProgressCardsProps {
  domains: DomainReviewProgress[]
}

/**
 * Renders whatever domains the backend returns — the ticket's two current POC domains today,
 * but nothing here assumes exactly two; a future third domain in the API response renders
 * automatically without a component change (ticket §4).
 */
function DomainReviewProgressCards({ domains }: DomainReviewProgressCardsProps) {
  return (
    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
      {domains.map((domain) => (
        <Paper key={domain.domain} withBorder p="md" radius="sm">
          <Stack gap="sm">
            <Group justify="space-between" align="flex-start">
              <Text fw={600} size="sm">
                {domain.domainLabel}
              </Text>
              <Badge color={getDomainReviewStatusColor(domain.status)} size="sm" variant="light">
                {getDomainReviewStatusLabel(domain.status)}
              </Badge>
            </Group>

            <Stack gap={4}>
              <Text size="sm">
                <Text component="span" fw={700}>
                  {domain.submittedCount} of {domain.requiredTotal}
                </Text>{' '}
                categories submitted
              </Text>
              <Text size="sm">
                <Text component="span" fw={700}>
                  {domain.aiReviewedCount}
                </Text>{' '}
                AI {domain.aiReviewedCount === 1 ? 'review' : 'reviews'} complete
              </Text>
              <Text size="sm">
                <Text component="span" fw={700}>
                  {domain.analystReviewedCount}
                </Text>{' '}
                Analyst {domain.analystReviewedCount === 1 ? 'review' : 'reviews'} complete
              </Text>
              <Text size="sm">
                <Text component="span" fw={700}>
                  {domain.approvedCount}
                </Text>{' '}
                approved
              </Text>
            </Stack>
          </Stack>
        </Paper>
      ))}
    </SimpleGrid>
  )
}

export { DomainReviewProgressCards }
