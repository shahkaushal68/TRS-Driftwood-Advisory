import { Badge, Button, Group, Table, Text } from '@mantine/core'
import { Link } from '@tanstack/react-router'

import { getRoleLabel } from '../../../common/auth/roles'
import type { ManagedUser } from '../../../common/api/users'
import { SortableTh } from '../../../components/pagination'

interface SortProps {
  sortBy: string
  sortDirection: 'asc' | 'desc'
  onSort: (column: string) => void
}

interface UsersDirectoryTableProps {
  actionUserId?: string | undefined
  currentUserId?: string | undefined
  onBan?: ((user: ManagedUser) => void) | undefined
  onEdit?: ((user: ManagedUser) => void) | undefined
  onUnban?: ((user: ManagedUser) => void) | undefined
  sort?: SortProps
  users: ManagedUser[]
}

const getStatus = (user: ManagedUser) => {
  if (user.deletedAt) {
    return { color: 'gray', label: 'Deleted' }
  }

  if (user.banned) {
    return { color: 'red', label: 'Banned' }
  }

  return { color: 'green', label: 'Active' }
}

function UsersDirectoryTable({
  actionUserId,
  currentUserId,
  onBan,
  onEdit,
  onUnban,
  sort,
  users,
}: UsersDirectoryTableProps) {
  if (users.length === 0) {
    return <Text c="dimmed">No users found.</Text>
  }

  return (
    <Table.ScrollContainer minWidth={700}>
      <Table striped highlightOnHover withTableBorder verticalSpacing="sm">
        <Table.Thead>
          <Table.Tr>
            {sort ? <SortableTh label="Name" column="name" {...sort} /> : <Table.Th>Name</Table.Th>}
            {sort ? (
              <SortableTh label="Email" column="email" {...sort} />
            ) : (
              <Table.Th>Email</Table.Th>
            )}
            <Table.Th>Role</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {users.map((user) => {
            const status = getStatus(user)
            const isSelf = user.id === currentUserId
            const isLoading = actionUserId === user.id
            const canBan = onBan !== undefined && onUnban !== undefined

            return (
              <Table.Tr key={user.id}>
                <Table.Td>
                  <Text fw={500}>{user.name || 'Not provided'}</Text>
                  {isSelf ? (
                    <Text size="xs" c="dimmed">
                      Current user
                    </Text>
                  ) : null}
                </Table.Td>
                <Table.Td>{user.email}</Table.Td>
                <Table.Td>{getRoleLabel(user.role)}</Table.Td>
                <Table.Td>
                  <Badge color={status.color} variant="light">
                    {status.label}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    <Link to="/users/$userId" params={{ userId: user.id }}>
                      View
                    </Link>
                    {onEdit === undefined ? null : (
                      <Button
                        size="xs"
                        variant="default"
                        disabled={isSelf}
                        onClick={() => {
                          onEdit(user)
                        }}
                      >
                        Edit
                      </Button>
                    )}
                    {canBan ? (
                      user.banned ? (
                        <Button
                          size="xs"
                          variant="light"
                          loading={isLoading}
                          disabled={isSelf}
                          onClick={() => {
                            onUnban(user)
                          }}
                        >
                          Unban
                        </Button>
                      ) : (
                        <Button
                          size="xs"
                          color="red"
                          variant="light"
                          loading={isLoading}
                          disabled={isSelf}
                          onClick={() => {
                            onBan(user)
                          }}
                        >
                          Ban
                        </Button>
                      )
                    ) : null}
                  </Group>
                </Table.Td>
              </Table.Tr>
            )
          })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  )
}

export { UsersDirectoryTable }
