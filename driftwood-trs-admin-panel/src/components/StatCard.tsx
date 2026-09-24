import { Group, Paper, Text, ThemeIcon, Title } from '@mantine/core'
import type { ReactNode } from 'react'

interface StatCardProps {
  icon: ReactNode
  color: string
  label: string
  value: string | number
  detail?: string | undefined
}

export function StatCard({ icon, color, label, value, detail }: StatCardProps) {
  return (
    <Paper withBorder p="md" radius="sm">
      <Group justify="space-between" align="flex-start" mb="xs">
        <Text size="sm" c="dimmed">
          {label}
        </Text>
        <ThemeIcon color={color} variant="light" size="md" radius="sm">
          {icon}
        </ThemeIcon>
      </Group>
      <Title order={3}>{value}</Title>
      {detail !== undefined ? (
        <Text size="xs" c="dimmed">
          {detail}
        </Text>
      ) : null}
    </Paper>
  )
}
