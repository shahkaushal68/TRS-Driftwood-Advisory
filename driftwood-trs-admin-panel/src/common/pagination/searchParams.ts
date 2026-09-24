import { DEFAULT_PAGINATION, type PaginationParams } from './types'

export function parsePaginationSearch(search: Record<string, unknown>): PaginationParams {
  const pageNumber = Number(search['pageNumber'])
  const perPage = Number(search['perPage'])
  const sortBy = search['sortBy']
  const sortDirection = search['sortDirection']
  return {
    pageNumber:
      Number.isInteger(pageNumber) && pageNumber > 0 ? pageNumber : DEFAULT_PAGINATION.pageNumber,
    perPage: Number.isInteger(perPage) && perPage > 0 ? perPage : DEFAULT_PAGINATION.perPage,
    sortBy: typeof sortBy === 'string' && sortBy.length > 0 ? sortBy : DEFAULT_PAGINATION.sortBy,
    sortDirection: sortDirection === 'asc' ? 'asc' : DEFAULT_PAGINATION.sortDirection,
  }
}
