import { Group, Pagination, Text } from '@mantine/core'

export interface TablePaginationProps {
  total: number
  page: number
  perPage: number
  onChange: (page: number) => void
}

function TablePagination({ total, page, perPage, onChange }: TablePaginationProps) {
  const totalPages = Math.ceil(total / perPage)
  const from = total === 0 ? 0 : (page - 1) * perPage + 1
  const to = Math.min(page * perPage, total)

  return (
    <Group justify="space-between" mt="md" wrap="wrap" gap="xs">
      <Text size="sm" c="dimmed">
        {total === 0 ? 'No results' : `Showing ${String(from)}–${String(to)} of ${String(total)}`}
      </Text>
      {totalPages > 1 ? (
        <Pagination
          total={totalPages}
          value={page}
          onChange={onChange}
          size="sm"
          withEdges={totalPages > 7}
        />
      ) : null}
    </Group>
  )
}

export { TablePagination }
