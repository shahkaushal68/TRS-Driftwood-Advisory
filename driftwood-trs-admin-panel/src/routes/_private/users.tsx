import { Alert, Button, Group, LoadingOverlay, Paper, Stack, Text, Title } from '@mantine/core'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

import { getApiErrorMessage } from '../../common/api/client'
import {
  userApi,
  userMutationOptions,
  userQueryKeys,
  userQueryOptions,
  type BanUserRequest,
  type CreateUserRequest,
  type ManagedUser,
  type UpdateAdminUserRequest,
} from '../../common/api/users'
import { hasAnyRole, requireRole } from '../../common/auth/roles'
import { useUserStore } from '../../common/hooks/useUserStore'
import { parsePaginationSearch } from '../../common/pagination'
import { TablePagination } from '../../components/pagination'
import { BanUserModal } from '../../features/users/components/BanUserModal'
import { UserFormModal, type UserFormValues } from '../../features/users/components/UserFormModal'
import { UsersDirectoryTable } from '../../features/users/components/UsersDirectoryTable'

interface UpdateUserVariables {
  id: string
  payload: UpdateAdminUserRequest
}

interface BanUserVariables {
  id: string
  payload: BanUserRequest
}

export const Route = createFileRoute('/_private/users')({
  validateSearch: parsePaginationSearch,
  beforeLoad: () => {
    requireRole(['admin', 'analyst'])
  },
  component: UsersDirectory,
})

function UsersDirectory() {
  const queryClient = useQueryClient()
  const navigate = Route.useNavigate()
  const params = Route.useSearch()
  const currentUser = useUserStore((state) => state.user)

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null)
  const [banningUser, setBanningUser] = useState<ManagedUser | null>(null)
  const [actionUserId, setActionUserId] = useState<string | null>(null)

  const canManageUsers = hasAnyRole(currentUser?.role, ['admin'])

  const setPage = (pageNumber: number) => {
    void navigate({ search: (prev) => ({ ...prev, pageNumber }), resetScroll: false })
  }

  const handleSort = (column: string) => {
    const sortDirection =
      params.sortBy === column && params.sortDirection === 'asc' ? 'desc' : 'asc'
    void navigate({
      search: (prev) => ({ ...prev, sortBy: column, sortDirection, pageNumber: 1 }),
      resetScroll: false,
    })
  }

  const usersQuery = useQuery({
    ...userQueryOptions.directory(params),
    placeholderData: keepPreviousData,
  })

  const invalidateUsers = () => {
    void queryClient.invalidateQueries({ queryKey: userQueryKeys.all })
  }

  const createUserMutation = useMutation({
    ...userMutationOptions.createAdminUser(),
    onSuccess: () => {
      setIsCreateModalOpen(false)
      setPage(1)
      invalidateUsers()
    },
  })

  const updateUserMutation = useMutation({
    mutationFn: ({ id, payload }: UpdateUserVariables) => userApi.updateAdminUser(id, payload),
    onSuccess: () => {
      setEditingUser(null)
      invalidateUsers()
    },
  })

  const banUserMutation = useMutation({
    mutationFn: ({ id, payload }: BanUserVariables) => userApi.banAdminUser(id, payload),
    onMutate: ({ id }) => {
      setActionUserId(id)
    },
    onSuccess: () => {
      setBanningUser(null)
      invalidateUsers()
    },
    onSettled: () => {
      setActionUserId(null)
    },
  })

  const unbanUserMutation = useMutation({
    mutationFn: (userId: string) => userApi.unbanAdminUser(userId),
    onMutate: (userId) => {
      setActionUserId(userId)
    },
    onSuccess: () => {
      invalidateUsers()
    },
    onSettled: () => {
      setActionUserId(null)
    },
  })

  // Derive success message from whichever mutation last succeeded
  const successMessage: string | null = createUserMutation.isSuccess
    ? `Created ${createUserMutation.data.email}. The backend sends a setup email so the user can finish account access.`
    : updateUserMutation.isSuccess
      ? `Updated ${updateUserMutation.data.email}.`
      : banUserMutation.isSuccess
        ? `Banned ${banUserMutation.data.email}.`
        : unbanUserMutation.isSuccess
          ? `Unbanned ${unbanUserMutation.data.email}.`
          : null

  const dismissSuccess = () => {
    createUserMutation.reset()
    updateUserMutation.reset()
    banUserMutation.reset()
    unbanUserMutation.reset()
  }

  const handleCreateUser = (values: UserFormValues) => {
    createUserMutation.mutate(values satisfies CreateUserRequest)
  }

  const handleUpdateUser = (values: UserFormValues) => {
    if (editingUser === null || editingUser.id === currentUser?.id) {
      return
    }
    updateUserMutation.mutate({
      id: editingUser.id,
      payload: values satisfies UpdateAdminUserRequest,
    })
  }

  const handleBanUser = (values: BanUserRequest) => {
    if (banningUser === null || banningUser.id === currentUser?.id) {
      return
    }
    banUserMutation.mutate({ id: banningUser.id, payload: values })
  }

  const handleUnbanUser = (user: ManagedUser) => {
    if (user.id === currentUser?.id) {
      return
    }
    unbanUserMutation.mutate(user.id)
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={2}>Users</Title>
          <Text c="dimmed">
            {canManageUsers
              ? 'Account directory and user management.'
              : 'Account directory for analysts and admins.'}
          </Text>
        </div>
        {canManageUsers ? (
          <Button
            onClick={() => {
              setIsCreateModalOpen(true)
            }}
          >
            Add user
          </Button>
        ) : null}
      </Group>

      {successMessage !== null ? (
        <Alert
          color="green"
          title="User management updated"
          onClose={dismissSuccess}
          withCloseButton
        >
          {successMessage}
        </Alert>
      ) : null}

      <Paper radius="sm" pos="relative">
        <LoadingOverlay visible={usersQuery.isFetching} />
        {usersQuery.isError ? (
          <Alert color="red" title="Unable to load users">
            {getApiErrorMessage(usersQuery.error)}
          </Alert>
        ) : (
          <>
            <UsersDirectoryTable
              users={usersQuery.data?.data ?? []}
              currentUserId={currentUser?.id}
              actionUserId={actionUserId ?? undefined}
              sort={{
                sortBy: params.sortBy,
                sortDirection: params.sortDirection,
                onSort: handleSort,
              }}
              onEdit={
                canManageUsers
                  ? (user) => {
                      setEditingUser(user)
                    }
                  : undefined
              }
              onBan={
                canManageUsers
                  ? (user) => {
                      setBanningUser(user)
                    }
                  : undefined
              }
              onUnban={canManageUsers ? handleUnbanUser : undefined}
            />
            <TablePagination
              total={usersQuery.data?.meta.total ?? 0}
              page={params.pageNumber}
              perPage={params.perPage}
              onChange={setPage}
            />
          </>
        )}
      </Paper>

      {canManageUsers ? (
        <>
          <UserFormModal
            mode="create"
            opened={isCreateModalOpen}
            isSubmitting={createUserMutation.isPending}
            error={createUserMutation.isError ? createUserMutation.error : undefined}
            onClose={() => {
              setIsCreateModalOpen(false)
            }}
            onSubmit={handleCreateUser}
          />

          <UserFormModal
            mode="edit"
            opened={editingUser !== null}
            initialUser={editingUser ?? undefined}
            isSubmitting={updateUserMutation.isPending}
            error={updateUserMutation.isError ? updateUserMutation.error : undefined}
            onClose={() => {
              setEditingUser(null)
            }}
            onSubmit={handleUpdateUser}
          />

          <BanUserModal
            opened={banningUser !== null}
            user={banningUser}
            isSubmitting={banUserMutation.isPending}
            error={banUserMutation.isError ? banUserMutation.error : undefined}
            onClose={() => {
              setBanningUser(null)
            }}
            onSubmit={handleBanUser}
          />
        </>
      ) : null}
    </Stack>
  )
}
