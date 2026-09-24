import { Alert, LoadingOverlay, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

import {
  userMutationOptions,
  userQueryKeys,
  userQueryOptions,
  type ManagedUser,
} from '../../common/api/users'
import { authQueryKeys } from '../../common/api/auth'
import { getApiErrorMessage } from '../../common/api/client'
import { getRoleLabel } from '../../common/auth/roles'
import { useUserStore } from '../../common/hooks/useUserStore'
import { AccountProfileForm } from '../../features/users/components/AccountProfileForm'

export const Route = createFileRoute('/_private/profile')({
  component: Profile,
})

function Profile() {
  const queryClient = useQueryClient()
  const profileQuery = useQuery(userQueryOptions.me())
  const updateProfileMutation = useMutation({
    ...userMutationOptions.updateMe(),
    onSuccess: async (profile) => {
      useUserStore.getState().setUser(profile)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: userQueryKeys.me() }),
        queryClient.invalidateQueries({ queryKey: authQueryKeys.profile() }),
      ])
    },
  })

  const profile = profileQuery.data

  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Profile</Title>
        <Text c="dimmed">View and update your account details.</Text>
      </div>

      <Paper withBorder p="md" radius="sm" pos="relative">
        <LoadingOverlay visible={profileQuery.isPending} />
        {profileQuery.isError ? (
          <Alert color="red" title="Unable to load profile">
            {getApiErrorMessage(profileQuery.error)}
          </Alert>
        ) : profile ? (
          <Stack gap="lg">
            <AccountSummary profile={profile} />
            <AccountProfileForm
              key={`${profile.id}:${profile.updatedAt}:${profile.email}:${profile.name}`}
              error={
                updateProfileMutation.isError
                  ? getApiErrorMessage(updateProfileMutation.error)
                  : undefined
              }
              isSubmitting={updateProfileMutation.isPending}
              onSubmit={(values) => {
                updateProfileMutation.mutate(values)
              }}
              profile={profile}
              success={
                updateProfileMutation.isSuccess ? 'Your account details were saved.' : undefined
              }
              onDismissSuccess={() => {
                updateProfileMutation.reset()
              }}
            />
          </Stack>
        ) : null}
      </Paper>
    </Stack>
  )
}

function AccountSummary({ profile }: { profile: ManagedUser }) {
  return (
    <SimpleGrid cols={{ base: 1, sm: 2 }}>
      <div>
        <Text size="sm" c="dimmed">
          User ID
        </Text>
        <Text fw={500}>{profile.id}</Text>
      </div>
      <div>
        <Text size="sm" c="dimmed">
          Role
        </Text>
        <Text fw={500}>{getRoleLabel(profile.role)}</Text>
      </div>
    </SimpleGrid>
  )
}
