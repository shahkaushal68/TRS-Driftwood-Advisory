import { Group, Table, UnstyledButton } from '@mantine/core'
import { ArrowDownIcon } from '@phosphor-icons/react/ArrowDown'
import { ArrowUpIcon } from '@phosphor-icons/react/ArrowUp'
import { ArrowsDownUpIcon } from '@phosphor-icons/react/ArrowsDownUp'

export interface SortableThProps {
  label: string
  column: string
  sortBy: string
  sortDirection: 'asc' | 'desc'
  onSort: (column: string) => void
}

function SortableTh({ label, column, sortBy, sortDirection, onSort }: SortableThProps) {
  const isActive = sortBy === column

  const Icon = isActive ? (sortDirection === 'asc' ? ArrowUpIcon : ArrowDownIcon) : ArrowsDownUpIcon

  return (
    <Table.Th>
      <UnstyledButton
        onClick={() => {
          onSort(column)
        }}
        style={{ display: 'flex', alignItems: 'center' }}
      >
        <Group gap={4} wrap="nowrap">
          <span
            style={{
              fontSize: 'var(--mantine-font-size-sm)',
              fontWeight: isActive ? 600 : undefined,
              color: isActive ? 'var(--mantine-color-blue-6)' : undefined,
            }}
          >
            {label}
          </span>
          <Icon
            size={13}
            weight={isActive ? 'bold' : 'regular'}
            style={{ opacity: isActive ? 1 : 0.35, flexShrink: 0 }}
            {...(isActive ? { color: 'var(--mantine-color-blue-6)' } : {})}
          />
        </Group>
      </UnstyledButton>
    </Table.Th>
  )
}

export { SortableTh }
