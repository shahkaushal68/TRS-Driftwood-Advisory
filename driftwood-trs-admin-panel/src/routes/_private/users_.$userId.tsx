import { Alert, LoadingOverlay, Paper, Stack } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { Link as RouterLink, createFileRoute } from '@tanstack/react-router'

import { userQueryOptions } from '../../common/api/users'
import { getApiErrorMessage } from '../../common/api/client'
import { requireRole } from '../../common/auth/roles'
import { DEFAULT_PAGINATION } from '../../common/pagination/types'
import { UserDetailsView } from '../../features/users/components/UserDetailsView'

export const Route = createFileRoute('/_private/users_/$userId')({
  beforeLoad: () => {
    requireRole(['admin', 'analyst'])
  },
  component: UserDetails,
})

function UserDetails() {
  const { userId } = Route.useParams()
  const userQuery = useQuery(userQueryOptions.adminDetail(userId))

  return (
    <Stack gap="lg">
      <RouterLink to="/users" search={DEFAULT_PAGINATION}>
        Back to users
      </RouterLink>

      <Paper withBorder p="md" radius="sm" pos="relative">
        <LoadingOverlay visible={userQuery.isPending} />
        {userQuery.isError ? (
          <Alert color="red" title="Unable to load user">
            {getApiErrorMessage(userQuery.error)}
          </Alert>
        ) : userQuery.data ? (
          <UserDetailsView user={userQuery.data} />
        ) : null}
      </Paper>
    </Stack>
  )
}
