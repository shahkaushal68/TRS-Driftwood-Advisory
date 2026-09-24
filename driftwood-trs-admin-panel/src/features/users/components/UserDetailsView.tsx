import { Badge, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core'

import { getRoleLabel } from '../../../common/auth/roles'
import type { ManagedUser } from '../../../common/api/users'

interface UserDetailsViewProps {
  user: ManagedUser
}

const formatDate = (value: string | null | undefined) => {
  if (!value) {
    return 'Not provided'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Not provided'
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function UserDetailsView({ user }: UserDetailsViewProps) {
  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>{user.name.length > 0 ? user.name : 'User details'}</Title>
        <Text c="dimmed">{user.email}</Text>
      </div>

      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <Paper withBorder p="md" radius="sm">
          <Text size="sm" c="dimmed">
            Role
          </Text>
          <Text fw={500}>{getRoleLabel(user.role)}</Text>
        </Paper>
        <Paper withBorder p="md" radius="sm">
          <Text size="sm" c="dimmed">
            Status
          </Text>
          <Badge color={user.banned ? 'red' : 'green'} variant="light">
            {user.banned ? 'Banned' : 'Active'}
          </Badge>
        </Paper>
        <Paper withBorder p="md" radius="sm">
          <Text size="sm" c="dimmed">
            Created
          </Text>
          <Text fw={500}>{formatDate(user.createdAt)}</Text>
        </Paper>
        <Paper withBorder p="md" radius="sm">
          <Text size="sm" c="dimmed">
            Updated
          </Text>
          <Text fw={500}>{formatDate(user.updatedAt)}</Text>
        </Paper>
      </SimpleGrid>

      {user.banned ? (
        <Paper withBorder p="md" radius="sm">
          <Text size="sm" c="dimmed">
            Ban details
          </Text>
          <Text fw={500}>{user.banReason ?? 'No reason provided'}</Text>
          <Text size="sm" c="dimmed">
            Expires {formatDate(user.banExpires)}
          </Text>
        </Paper>
      ) : null}
    </Stack>
  )
}

export { UserDetailsView }
