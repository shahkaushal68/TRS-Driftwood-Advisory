import { Badge, Group, Paper, RingProgress, Stack, Text } from '@mantine/core'
import { ArrowCounterClockwiseIcon } from '@phosphor-icons/react/ArrowCounterClockwise'
import { CalendarBlankIcon } from '@phosphor-icons/react/CalendarBlank'
import { FileTextIcon } from '@phosphor-icons/react/FileText'
import { UserIcon } from '@phosphor-icons/react/User'
import { WarningIcon } from '@phosphor-icons/react/Warning'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'

import {
  CUSTOMER_REVIEW_STATUS_COLORS,
  CUSTOMER_REVIEW_STATUS_LABELS,
  type CustomerReviewStatus,
} from '../../../common/mocks/customerStats'
import { DEFAULT_PAGINATION } from '../../../common/pagination'

export interface CustomerCardData {
  id: string
  name: string
  industry: string
  reviewStatus: CustomerReviewStatus
  completionPercentage: number
  documentsSubmitted: number
  documentsRequiringReview: number
  documentsAwaitingResubmission: number
  assignedAnalyst: string | null
  lastActivity: string | null
}

interface CustomerCardProps {
  customer: CustomerCardData
}

const RING_COLOR_BY_STATUS: Record<CustomerReviewStatus, string> = {
  not_started: 'gray',
  in_progress: 'blue',
  reviewing: 'orange',
  completed: 'green',
}

export function CustomerCard({ customer }: CustomerCardProps) {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <Link
      to="/analyst/documents"
      search={{ selectedUserId: customer.id, ...DEFAULT_PAGINATION }}
      style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
    >
      <Paper
        withBorder
        p="md"
        radius="md"
        onMouseEnter={() => {
          setIsHovered(true)
        }}
        onMouseLeave={() => {
          setIsHovered(false)
        }}
        style={{
          cursor: 'pointer',
          transition: 'transform 150ms ease, box-shadow 150ms ease',
          transform: isHovered ? 'translateY(-4px)' : 'translateY(0)',
          boxShadow: isHovered
            ? '0 8px 20px rgba(0, 0, 0, 0.10)'
            : '0 1px 3px rgba(0, 0, 0, 0.06)',
        }}
      >
        <Stack gap="sm">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <div>
            <Text fw={600}>{customer.name}</Text>
            <Text size="xs" c="dimmed">
              {customer.industry}
            </Text>
          </div>
          <Badge color={CUSTOMER_REVIEW_STATUS_COLORS[customer.reviewStatus]} variant="light">
            {CUSTOMER_REVIEW_STATUS_LABELS[customer.reviewStatus]}
          </Badge>
        </Group>

        <Group gap="lg" wrap="nowrap" align="center">
          <RingProgress
            size={72}
            thickness={6}
            roundCaps
            sections={[
              { value: customer.completionPercentage, color: RING_COLOR_BY_STATUS[customer.reviewStatus] },
            ]}
            label={
              <Text size="xs" fw={700} ta="center">
                {customer.completionPercentage}%
              </Text>
            }
          />

          <Stack gap={4} style={{ flex: 1 }}>
            <Group gap={6} wrap="nowrap">
              <FileTextIcon size={14} />
              <Text size="xs" c="dimmed" style={{ flex: 1 }}>
                Documents Submitted
              </Text>
              <Text size="xs" fw={600}>
                {customer.documentsSubmitted}
              </Text>
            </Group>
            <Group gap={6} wrap="nowrap">
              <WarningIcon size={14} />
              <Text size="xs" c="dimmed" style={{ flex: 1 }}>
                Requires Review
              </Text>
              <Text size="xs" fw={600}>
                {customer.documentsRequiringReview}
              </Text>
            </Group>
            <Group gap={6} wrap="nowrap">
              <ArrowCounterClockwiseIcon size={14} />
              <Text size="xs" c="dimmed" style={{ flex: 1 }}>
                Awaiting Resubmission
              </Text>
              <Text size="xs" fw={600}>
                {customer.documentsAwaitingResubmission}
              </Text>
            </Group>
          </Stack>
        </Group>

        <Group gap={6} wrap="nowrap">
          <UserIcon size={14} />
          <Text size="xs" c="dimmed">
            Analyst:
          </Text>
          <Text
            size="xs"
            fw={500}
            {...(customer.assignedAnalyst === null ? { c: 'orange' } : {})}
          >
            {customer.assignedAnalyst ?? 'Unassigned'}
          </Text>
        </Group>
        <Group gap={6} wrap="nowrap">
          <CalendarBlankIcon size={14} />
          <Text size="xs" c="dimmed">
            Last Activity:
          </Text>
          <Text size="xs" fw={500}>
            {customer.lastActivity !== null
              ? new Date(customer.lastActivity).toLocaleDateString()
              : '—'}
          </Text>
        </Group>
        </Stack>
      </Paper>
    </Link>
  )
}
