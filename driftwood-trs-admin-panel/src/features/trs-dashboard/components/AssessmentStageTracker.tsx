import { Group, Text } from '@mantine/core'
import { CheckCircleIcon } from '@phosphor-icons/react/CheckCircle'
import { CircleIcon } from '@phosphor-icons/react/Circle'

import type { AssessmentStage } from '../../../common/api/trsDashboard'
import { ASSESSMENT_STAGE_LABELS, ASSESSMENT_STAGE_ORDER } from '../utils/statusMappings'

interface AssessmentStageTrackerProps {
  currentStage: AssessmentStage
}

/**
 * A simple horizontal milestone tracker — deliberately not a chart or a multi-axis
 * visualization (ticket §3/§12: "Do NOT create an overly complex dashboard visualization").
 * `currentStage` always comes from the backend (`TrsDashboard.assessmentStage`); this
 * component only decides how to render the seven known stages relative to it.
 */
function AssessmentStageTracker({ currentStage }: AssessmentStageTrackerProps) {
  const currentIndex = ASSESSMENT_STAGE_ORDER.indexOf(currentStage)

  return (
    <Group gap="xs" wrap="wrap">
      {ASSESSMENT_STAGE_ORDER.map((stage, index) => {
        const isComplete = currentIndex >= 0 && index < currentIndex
        const isCurrent = stage === currentStage

        return (
          <Group key={stage} gap={6} wrap="nowrap">
            {isComplete ? (
              <CheckCircleIcon size={16} weight="fill" color="var(--mantine-color-green-6)" />
            ) : (
              <CircleIcon
                size={16}
                weight={isCurrent ? 'fill' : 'regular'}
                color={isCurrent ? 'var(--mantine-color-blue-6)' : 'var(--mantine-color-gray-5)'}
              />
            )}
            <Text size="sm" fw={isCurrent ? 700 : 400} c={isCurrent ? 'inherit' : 'dimmed'}>
              {ASSESSMENT_STAGE_LABELS[stage]}
            </Text>
            {index < ASSESSMENT_STAGE_ORDER.length - 1 ? (
              <Text c="dimmed" size="sm">
                &rarr;
              </Text>
            ) : null}
          </Group>
        )
      })}
    </Group>
  )
}

export { AssessmentStageTracker }
