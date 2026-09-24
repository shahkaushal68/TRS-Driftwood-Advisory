import { ChartLineUpIcon } from '@phosphor-icons/react/ChartLineUp'
import { FolderOpenIcon } from '@phosphor-icons/react/FolderOpen'
import { GearIcon } from '@phosphor-icons/react/Gear'
import { HeartIcon } from '@phosphor-icons/react/Heart'
import { HouseIcon } from '@phosphor-icons/react/House'
import { RobotIcon } from '@phosphor-icons/react/Robot'
import { UploadSimpleIcon } from '@phosphor-icons/react/UploadSimple'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Outlet, redirect, useRouter } from '@tanstack/react-router'

import { authMutationOptions, authQueryKeys } from '../../common/api/auth'
import { getApiErrorMessage } from '../../common/api/client'
import { userQueryKeys } from '../../common/api/users'
import { hasAnyRole } from '../../common/auth/roles'
import { useUserStore } from '../../common/hooks/useUserStore'
import { PrivateShell, type PrivateNavItem } from '../../components/private-shell'

export const Route = createFileRoute('/_private')({
  beforeLoad: ({ location }) => {
    if (useUserStore.getState().user === null) {
      redirect({
        to: '/login',
        search: {
          redirect: location.href,
        },
        replace: true,
        throw: true,
      })
    }
  },
  component: PrivateLayout,
})

function PrivateLayout() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const user = useUserStore((state) => state.user)
  const clearUser = useUserStore((state) => state.clearUser)
  const logoutMutation = useMutation({
    ...authMutationOptions.logout(),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: authQueryKeys.all })
      queryClient.removeQueries({ queryKey: userQueryKeys.all })
      clearUser()
      void router.navigate({ to: '/login', replace: true })
    },
  })

  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ')
  const displayName = user?.name ?? (fullName.length > 0 ? fullName : user?.email) ?? 'Admin'
  const canViewDocumentIntake = hasAnyRole(user?.role, ['user'])
  const canViewUsers = hasAnyRole(user?.role, ['admin', 'analyst'])
  const canReviewDocuments = hasAnyRole(user?.role, ['admin', 'analyst'])
  const canManageAiPrompts = hasAnyRole(user?.role, ['admin'])
  const canManageSettings = hasAnyRole(user?.role, ['admin'])
  const navItems: PrivateNavItem[] = [{ label: 'Dashboard', to: '/dashboard', icon: HouseIcon }]

  if (canViewDocumentIntake) {
    navItems.push({ label: 'Review Progress', to: '/trs-dashboard', icon: ChartLineUpIcon })
    navItems.push({ label: 'Document Intake', to: '/documents', icon: UploadSimpleIcon })
  }

  if (canViewUsers) {
    navItems.push({ label: 'Users', to: '/users', icon: HeartIcon })
  }

  if (canReviewDocuments) {
    navItems.push({ label: 'Document Review', to: '/analyst/documents', icon: FolderOpenIcon })
  }

  if (canManageAiPrompts) {
    navItems.push({ label: 'AI Prompts', to: '/admin/ai-prompts', icon: RobotIcon })
  }

  if (canManageSettings) {
    navItems.push({
      label: 'Settings',
      to: '/admin/settings/ai-provider-config',
      icon: GearIcon,
    })
  }

  return (
    <PrivateShell
      displayName={displayName}
      isLogoutError={logoutMutation.isError}
      isLoggingOut={logoutMutation.isPending}
      logoutErrorMessage={
        logoutMutation.isError
          ? getApiErrorMessage(logoutMutation.error, 'Unable to log out.')
          : undefined
      }
      navItems={navItems}
      onLogout={logoutMutation.mutate}
    >
      <Outlet />
    </PrivateShell>
  )
}
