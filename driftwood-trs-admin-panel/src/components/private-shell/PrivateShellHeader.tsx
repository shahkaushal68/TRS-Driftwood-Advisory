import { Button, Burger, Group, Text } from '@mantine/core'
import { Link as RouterLink } from '@tanstack/react-router'

interface PrivateShellHeaderProps {
  displayName: string
  navbarExpanded: boolean
  onToggleNavbar: () => void
}

function PrivateShellHeader({
  displayName,
  navbarExpanded,
  onToggleNavbar,
}: PrivateShellHeaderProps) {
  return (
    <Group h="100%" justify="space-between">
      <Group gap="sm">
        <Burger
          opened={navbarExpanded}
          onClick={onToggleNavbar}
          size="sm"
          aria-label={navbarExpanded ? 'Collapse navigation' : 'Expand navigation'}
        />
        <Text fw={700}>TRS</Text>
      </Group>

      <Group gap="md">
        <Text c="dimmed" size="sm">
          {displayName}
        </Text>
        <Button variant="light" color="gray" component={RouterLink} to="/profile">
          Profile
        </Button>
      </Group>
    </Group>
  )
}

export { PrivateShellHeader }
