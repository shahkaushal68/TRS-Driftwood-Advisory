import { mutationOptions, queryOptions } from '@tanstack/react-query'

import { apiClient } from './client'
import type { ManagedUser } from './users'

interface LoginRequest {
  email: string
  password: string
  rememberMe: boolean
}

interface ForgotPasswordRequest {
  email: string
  redirectTo?: string
}

interface ResetPasswordRequest {
  newPassword: string
  token: string
}

type UserProfile = ManagedUser

const authRoutes = {
  profile: '/users/me',
  login: '/auth/sign-in/email',
  logout: '/auth/sign-out',
  forgotPassword: '/auth/request-password-reset',
  resetPassword: '/auth/reset-password',
} as const

const authQueryKeys = {
  all: ['auth'] as const,
  profile: () => [...authQueryKeys.all, 'profile'] as const,
}

const authMutationKeys = {
  all: ['auth'] as const,
  login: () => [...authMutationKeys.all, 'login'] as const,
  logout: () => [...authMutationKeys.all, 'logout'] as const,
  forgotPassword: () => [...authMutationKeys.all, 'forgot-password'] as const,
  resetPassword: () => [...authMutationKeys.all, 'reset-password'] as const,
}

const authApi = {
  async profile(): Promise<UserProfile> {
    const response = await apiClient.get<UserProfile>(authRoutes.profile)

    return response.data
  },

  async login(payload: LoginRequest): Promise<void> {
    await apiClient.post(authRoutes.login, payload)
  },

  async logout(): Promise<void> {
    await apiClient.post(authRoutes.logout)
  },

  async forgotPassword(payload: ForgotPasswordRequest): Promise<void> {
    await apiClient.post(authRoutes.forgotPassword, payload)
  },

  async resetPassword(payload: ResetPasswordRequest): Promise<void> {
    await apiClient.post(authRoutes.resetPassword, payload)
  },
}

const authQueryOptions = {
  profile: () =>
    queryOptions({
      queryKey: authQueryKeys.profile(),
      queryFn: () => authApi.profile(),
      retry: false,
    }),
}

const authMutationOptions = {
  login: () =>
    mutationOptions({
      mutationKey: authMutationKeys.login(),
      mutationFn: (payload: LoginRequest) => authApi.login(payload),
    }),

  logout: () =>
    mutationOptions({
      mutationKey: authMutationKeys.logout(),
      mutationFn: () => authApi.logout(),
    }),

  forgotPassword: () =>
    mutationOptions({
      mutationKey: authMutationKeys.forgotPassword(),
      mutationFn: (payload: ForgotPasswordRequest) => authApi.forgotPassword(payload),
    }),

  resetPassword: () =>
    mutationOptions({
      mutationKey: authMutationKeys.resetPassword(),
      mutationFn: (payload: ResetPasswordRequest) => authApi.resetPassword(payload),
    }),
}

export {
  authApi,
  authMutationKeys,
  authMutationOptions,
  authQueryKeys,
  authQueryOptions,
  authRoutes,
  type ForgotPasswordRequest,
  type LoginRequest,
  type ResetPasswordRequest,
  type UserProfile,
}
