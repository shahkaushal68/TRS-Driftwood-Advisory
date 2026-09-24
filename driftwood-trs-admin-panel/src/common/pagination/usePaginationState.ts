import { useState } from 'react'
import { DEFAULT_PAGINATION, type PaginationParams } from './types'

export interface PaginationStateResult {
  page: number
  perPage: number
  sortBy: string
  sortDirection: 'asc' | 'desc'
  params: PaginationParams
  setPage: (page: number) => void
  setPerPage: (perPage: number) => void
  setSortBy: (sortBy: string) => void
  setSortDirection: (dir: 'asc' | 'desc') => void
  setSort: (sortBy: string, sortDirection: 'asc' | 'desc') => void
}

export function usePaginationState(initial?: Partial<PaginationParams>): PaginationStateResult {
  const [page, setPage] = useState(initial?.pageNumber ?? DEFAULT_PAGINATION.pageNumber)
  const [perPage, setPerPageRaw] = useState(initial?.perPage ?? DEFAULT_PAGINATION.perPage)
  const [sortBy, setSortByRaw] = useState(initial?.sortBy ?? DEFAULT_PAGINATION.sortBy)
  const [sortDirection, setSortDirectionRaw] = useState<'asc' | 'desc'>(
    initial?.sortDirection ?? DEFAULT_PAGINATION.sortDirection,
  )

  const setPerPage = (v: number) => {
    setPerPageRaw(v)
    setPage(1)
  }

  const setSortBy = (v: string) => {
    setSortByRaw(v)
    setPage(1)
  }

  const setSortDirection = (v: 'asc' | 'desc') => {
    setSortDirectionRaw(v)
    setPage(1)
  }

  const setSort = (by: string, direction: 'asc' | 'desc') => {
    setSortByRaw(by)
    setSortDirectionRaw(direction)
    setPage(1)
  }

  return {
    page,
    perPage,
    sortBy,
    sortDirection,
    params: { pageNumber: page, perPage, sortBy, sortDirection },
    setPage,
    setPerPage,
    setSortBy,
    setSortDirection,
    setSort,
  }
}
