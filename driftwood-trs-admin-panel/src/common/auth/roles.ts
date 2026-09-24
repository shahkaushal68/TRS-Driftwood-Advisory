import { redirect } from '@tanstack/react-router'

import { useUserStore } from '../hooks/useUserStore'
import type { UserRole } from '../api/users'

const roleLabels: Record<UserRole, string> = {
  admin: 'Admin',
  analyst: 'Analyst',
  user: 'User',
}

const userRoles = ['user', 'admin', 'analyst'] as const satisfies readonly UserRole[]

const isUserRole = (role: string | null | undefined): role is UserRole =>
  userRoles.some((allowedRole) => allowedRole === role)

const getRoleLabel = (role: string | null | undefined) => {
  if (!isUserRole(role)) {
    return 'Unknown'
  }

  return roleLabels[role]
}

const hasAnyRole = (role: string | null | undefined, allowedRoles: readonly UserRole[]) => {
  return isUserRole(role) && allowedRoles.includes(role)
}

const requireRole = (allowedRoles: readonly UserRole[]) => {
  const user = useUserStore.getState().user

  if (user === null) {
    return redirect({
      to: '/login',
      replace: true,
      throw: true,
    })
  }

  if (!hasAnyRole(user.role, allowedRoles)) {
    return redirect({
      to: '/dashboard',
      replace: true,
      throw: true,
    })
  }

  return
}

export { getRoleLabel, hasAnyRole, isUserRole, requireRole, roleLabels, userRoles }
