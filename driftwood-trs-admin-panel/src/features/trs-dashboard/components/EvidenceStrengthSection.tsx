import { Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core'

import type { EvidenceStrengthByDomain } from '../../../common/api/trsDashboard'

interface EvidenceStrengthSectionProps {
  evidenceStrength: EvidenceStrengthByDomain
}

/**
 * "Evidence Strength by TRS Domain" (ticket §7). Renders nothing at all — not a placeholder,
 * not an empty-state card — whenever `evidenceStrength` is `null`, which today is always,
 * since there is no evidence-strength data anywhere in the backend yet (see
 * `TrsDashboardResult.evidenceStrength` in `trs-dashboard.service.ts`). This component exists
 * so the dashboard route only needs a single, future-proof call site once that data does
 * exist — it never computes a strength rating itself.
 */
function EvidenceStrengthSection({ evidenceStrength }: EvidenceStrengthSectionProps) {
  if (evidenceStrength === null) return null

  return (
    <Stack gap="sm">
      <Title order={5}>Evidence Strength by TRS Domain</Title>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        {evidenceStrength.map((item) => (
          <Paper key={item.domain} withBorder p="md" radius="sm">
            <Stack gap={4}>
              <Text fw={600} size="sm">
                {item.domainLabel}
              </Text>
              <Text fw={700}>{item.strengthLabel}</Text>
              <Text size="sm" c="dimmed">
                {item.summary}
              </Text>
            </Stack>
          </Paper>
        ))}
      </SimpleGrid>
    </Stack>
  )
}

export { EvidenceStrengthSection }
