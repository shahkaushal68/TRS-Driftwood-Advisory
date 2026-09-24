export interface PaginationParams {
  pageNumber: number
  perPage: number
  sortBy: string
  sortDirection: 'asc' | 'desc'
}

export interface PaginationMeta {
  total: number
  page: number
  perPage: number
  totalPages: number
}

export interface PaginatedResponse<T> {
  data: T[]
  meta: PaginationMeta
}

export const DEFAULT_PAGINATION: PaginationParams = {
  pageNumber: 1,
  perPage: 20,
  sortBy: 'createdAt',
  sortDirection: 'desc',
}
