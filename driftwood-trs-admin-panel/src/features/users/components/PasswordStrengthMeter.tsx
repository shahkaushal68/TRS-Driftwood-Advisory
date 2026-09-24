import { List, Progress, Stack, Text } from '@mantine/core'

import { getPasswordStrength, passwordRequirements } from '../utils/passwordStrength'

interface PasswordStrengthMeterProps {
  value: string
}

function PasswordStrengthMeter({ value }: PasswordStrengthMeterProps) {
  if (value.length === 0) {
    return null
  }

  const strength = getPasswordStrength(value)
  const progress = (strength.score / passwordRequirements.length) * 100

  return (
    <Stack gap="xs">
      <Progress value={progress} color={strength.isStrong ? 'green' : 'yellow'} size="sm" />
      <List size="sm" c="dimmed">
        {passwordRequirements.map((requirement) => (
          <List.Item key={requirement.label}>
            <Text span c={requirement.test(value) ? 'green' : 'dimmed'}>
              {requirement.label}
            </Text>
          </List.Item>
        ))}
      </List>
    </Stack>
  )
}

export { PasswordStrengthMeter }
