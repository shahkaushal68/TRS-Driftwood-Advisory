import { Badge, Table, Text } from '@mantine/core'

import type { CategoryReviewStatus } from '../../../common/api/trsDashboard'
import {
  getEvidenceCategoryStatusColor,
  getEvidenceCategoryStatusLabel,
} from '../utils/statusMappings'

interface EvidenceCategoryTableProps {
  categories: CategoryReviewStatus[]
}

/** Customer-facing evidence category review status table (ticket §5). A plain scrollable
 *  Mantine `Table` — same pattern as `DocumentsTable` — keeps this usable on small screens
 *  without a bespoke responsive layout. */
function EvidenceCategoryTable({ categories }: EvidenceCategoryTableProps) {
  if (categories.length === 0) {
    return (
      <Text c="dimmed" size="sm">
        No evidence categories to show yet.
      </Text>
    )
  }

  return (
    <Table.ScrollContainer minWidth={560}>
      <Table verticalSpacing="sm" highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>TRS Domain</Table.Th>
            <Table.Th>Evidence Category</Table.Th>
            <Table.Th>Review Stage</Table.Th>
            <Table.Th>Last Updated</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {categories.map((category) => (
            <Table.Tr key={`${category.domain}-${category.evidenceCategory}`}>
              <Table.Td>{category.domainLabel}</Table.Td>
              <Table.Td>{category.evidenceCategory}</Table.Td>
              <Table.Td>
                <Badge
                  color={getEvidenceCategoryStatusColor(category.status, category.resetRequired)}
                  variant="light"
                  size="sm"
                >
                  {getEvidenceCategoryStatusLabel(category.status, category.resetRequired)}
                </Badge>
              </Table.Td>
              <Table.Td>
                {category.updatedAt ? new Date(category.updatedAt).toLocaleDateString() : '—'}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  )
}

export { EvidenceCategoryTable }
