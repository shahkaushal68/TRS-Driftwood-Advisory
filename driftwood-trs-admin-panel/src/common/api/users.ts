import { mutationOptions, queryOptions } from '@tanstack/react-query'

import { apiClient } from './client'
import type { PaginatedResponse, PaginationParams } from '../pagination/types'
import { DEFAULT_PAGINATION } from '../pagination/types'

type UserRole = 'user' | 'admin' | 'analyst'

interface ManagedUser {
  banExpires?: string | null
  banReason?: string | null
  banned?: boolean | null
  createdAt: string
  deletedAt?: string | null
  email: string
  emailVerified?: boolean
  firstName?: string
  id: string
  image?: string | null
  lastName?: string
  name: string
  role: UserRole | null
  updatedAt: string
}

interface CreateUserRequest {
  email: string
  name: string
  role: UserRole
}

interface UpdateAdminUserRequest {
  email?: string
  name?: string
  role?: UserRole
}

interface BanUserRequest {
  expiresIn?: number
  reason?: string
}

interface UpdateMeRequest {
  currentPassword?: string
  email?: string
  name?: string
  newPassword?: string
}

const userRoutes = {
  me: '/users/me',
  users: '/users',
  user: (id: string) => `/users/${id}`,
  adminUsers: '/admin/users',
  adminUser: (id: string) => `/admin/users/${id}`,
  banAdminUser: (id: string) => `/admin/users/${id}/ban`,
  unbanAdminUser: (id: string) => `/admin/users/${id}/unban`,
} as const

const userQueryKeys = {
  all: ['users'] as const,
  me: () => [...userQueryKeys.all, 'me'] as const,
  directory: (params: PaginationParams) => [...userQueryKeys.all, 'directory', params] as const,
  detail: (id: string) => [...userQueryKeys.all, 'detail', id] as const,
  adminList: (params: PaginationParams) => [...userQueryKeys.all, 'admin', 'list', params] as const,
  adminDetail: (id: string) => [...userQueryKeys.all, 'admin', 'detail', id] as const,
}

const userMutationKeys = {
  all: ['users'] as const,
  updateMe: () => [...userMutationKeys.all, 'update-me'] as const,
  createAdminUser: () => [...userMutationKeys.all, 'admin', 'create'] as const,
  updateAdminUser: (id: string) => [...userMutationKeys.all, 'admin', 'update', id] as const,
  deleteAdminUser: (id: string) => [...userMutationKeys.all, 'admin', 'delete', id] as const,
  banAdminUser: (id: string) => [...userMutationKeys.all, 'admin', 'ban', id] as const,
  unbanAdminUser: (id: string) => [...userMutationKeys.all, 'admin', 'unban', id] as const,
}

const userApi = {
  async me(): Promise<ManagedUser> {
    const response = await apiClient.get<ManagedUser>(userRoutes.me)
    return response.data
  },

  async updateMe(payload: UpdateMeRequest): Promise<ManagedUser> {
    const response = await apiClient.patch<ManagedUser>(userRoutes.me, payload)
    return response.data
  },

  async listUsers(params: PaginationParams): Promise<PaginatedResponse<ManagedUser>> {
    const response = await apiClient.get<PaginatedResponse<ManagedUser>>(userRoutes.users, {
      params: {
        pageNumber: params.pageNumber,
        perPage: params.perPage,
        sortBy: params.sortBy,
        sortDirection: params.sortDirection,
      },
    })
    return response.data
  },

  async getUser(id: string): Promise<ManagedUser> {
    const response = await apiClient.get<ManagedUser>(userRoutes.user(id))
    return response.data
  },

  async listAdminUsers(params: PaginationParams): Promise<PaginatedResponse<ManagedUser>> {
    const response = await apiClient.get<PaginatedResponse<ManagedUser>>(userRoutes.adminUsers, {
      params: {
        pageNumber: params.pageNumber,
        perPage: params.perPage,
        sortBy: params.sortBy,
        sortDirection: params.sortDirection,
      },
    })
    return response.data
  },

  async getAdminUser(id: string): Promise<ManagedUser> {
    const response = await apiClient.get<ManagedUser>(userRoutes.adminUser(id))
    return response.data
  },

  async createAdminUser(payload: CreateUserRequest): Promise<ManagedUser> {
    const response = await apiClient.post<ManagedUser>(userRoutes.adminUsers, payload)
    return response.data
  },

  async updateAdminUser(id: string, payload: UpdateAdminUserRequest): Promise<ManagedUser> {
    const response = await apiClient.patch<ManagedUser>(userRoutes.adminUser(id), payload)
    return response.data
  },

  async deleteAdminUser(id: string): Promise<void> {
    await apiClient.delete(userRoutes.adminUser(id))
  },

  async banAdminUser(id: string, payload: BanUserRequest): Promise<ManagedUser> {
    const response = await apiClient.post<ManagedUser>(userRoutes.banAdminUser(id), payload)
    return response.data
  },

  async unbanAdminUser(id: string): Promise<ManagedUser> {
    const response = await apiClient.post<ManagedUser>(userRoutes.unbanAdminUser(id))
    return response.data
  },
}

const userQueryOptions = {
  me: () =>
    queryOptions({
      queryKey: userQueryKeys.me(),
      queryFn: () => userApi.me(),
    }),

  directory: (params: PaginationParams = DEFAULT_PAGINATION) =>
    queryOptions({
      queryKey: userQueryKeys.directory(params),
      queryFn: () => userApi.listUsers(params),
    }),

  detail: (id: string) =>
    queryOptions({
      queryKey: userQueryKeys.detail(id),
      queryFn: () => userApi.getUser(id),
      enabled: id.length > 0,
    }),

  adminList: (params: PaginationParams = DEFAULT_PAGINATION) =>
    queryOptions({
      queryKey: userQueryKeys.adminList(params),
      queryFn: () => userApi.listAdminUsers(params),
    }),

  adminDetail: (id: string) =>
    queryOptions({
      queryKey: userQueryKeys.adminDetail(id),
      queryFn: () => userApi.getAdminUser(id),
      enabled: id.length > 0,
    }),
}

const userMutationOptions = {
  updateMe: () =>
    mutationOptions({
      mutationKey: userMutationKeys.updateMe(),
      mutationFn: (payload: UpdateMeRequest) => userApi.updateMe(payload),
    }),

  createAdminUser: () =>
    mutationOptions({
      mutationKey: userMutationKeys.createAdminUser(),
      mutationFn: (payload: CreateUserRequest) => userApi.createAdminUser(payload),
    }),

  updateAdminUser: (id: string) =>
    mutationOptions({
      mutationKey: userMutationKeys.updateAdminUser(id),
      mutationFn: (payload: UpdateAdminUserRequest) => userApi.updateAdminUser(id, payload),
    }),

  deleteAdminUser: (id: string) =>
    mutationOptions({
      mutationKey: userMutationKeys.deleteAdminUser(id),
      mutationFn: () => userApi.deleteAdminUser(id),
    }),

  banAdminUser: (id: string) =>
    mutationOptions({
      mutationKey: userMutationKeys.banAdminUser(id),
      mutationFn: (payload: BanUserRequest) => userApi.banAdminUser(id, payload),
    }),

  unbanAdminUser: (id: string) =>
    mutationOptions({
      mutationKey: userMutationKeys.unbanAdminUser(id),
      mutationFn: () => userApi.unbanAdminUser(id),
    }),
}

export {
  userApi,
  userMutationKeys,
  userMutationOptions,
  userQueryKeys,
  userQueryOptions,
  userRoutes,
  type BanUserRequest,
  type CreateUserRequest,
  type ManagedUser,
  type UpdateAdminUserRequest,
  type UpdateMeRequest,
  type UserRole,
}
