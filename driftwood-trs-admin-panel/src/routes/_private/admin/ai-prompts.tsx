import {
  Alert,
  Badge,
  Button,
  Collapse,
  Group,
  LoadingOverlay,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  UnstyledButton,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { CaretDownIcon } from '@phosphor-icons/react/CaretDown'
import { CaretUpIcon } from '@phosphor-icons/react/CaretUp'
import { ClockIcon } from '@phosphor-icons/react/Clock'
import { FileTextIcon } from '@phosphor-icons/react/FileText'
import { FolderSimpleIcon } from '@phosphor-icons/react/FolderSimple'
import { MagnifyingGlassIcon } from '@phosphor-icons/react/MagnifyingGlass'
import { ShieldCheckIcon } from '@phosphor-icons/react/ShieldCheck'
import { WarningCircleIcon } from '@phosphor-icons/react/WarningCircle'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState, type ReactNode } from 'react'

import { aiPromptsQueryKeys, aiPromptsQueryOptions, type CategoryPromptEntry } from '../../../common/api/aiPrompts'
import { getApiErrorMessage } from '../../../common/api/client'
import { TRS_DOMAIN_LABELS } from '../../../common/api/documents'
import { hasAnyRole, requireRole } from '../../../common/auth/roles'
import { useUserStore } from '../../../common/hooks/useUserStore'
import { MasterReportPromptModal } from '../../../features/ai-prompts/components/MasterReportPromptModal'
import { PromptEditorModal } from '../../../features/ai-prompts/components/PromptEditorModal'

export const Route = createFileRoute('/_private/admin/ai-prompts')({
  beforeLoad: () => {
    requireRole(['admin'])
  },
  component: AiPromptsPage,
})

type PromptStatus = 'active' | 'draft' | 'missing' | 'archived'

const STATUS_FILTER_OPTIONS: { value: 'all' | PromptStatus; label: string }[] = [
  { value: 'all', label: 'All Statuses' },
  { value: 'active', label: 'Active' },
  { value: 'draft', label: 'Draft' },
  { value: 'missing', label: 'Missing Prompt' },
  { value: 'archived', label: 'Archived' },
]

const STATUS_BADGE_COLORS: Record<PromptStatus, string> = {
  active: 'green',
  draft: 'yellow',
  missing: 'red',
  archived: 'gray',
}

const STATUS_BADGE_LABELS: Record<PromptStatus, string> = {
  active: 'Active',
  draft: 'Draft',
  missing: 'Missing Prompt',
  archived: 'Archived',
}

const STATUS_LEGEND_ITEMS: { status: PromptStatus; description: string }[] = [
  { status: 'active', description: 'Prompt has an active version' },
  { status: 'draft', description: 'Prompt exists but no active version' },
  { status: 'missing', description: 'No prompt template exists' },
  { status: 'archived', description: 'Prompt template is archived' },
]

function getEntryStatus(entry: CategoryPromptEntry): PromptStatus {
  if (entry.template === null) return 'missing'
  return (entry.template.status as PromptStatus | undefined) ?? 'draft'
}

function formatCategoryPercent(count: number, total: number): string {
  return `${String(Math.round((count / total) * 100))}% of categories`
}

function AiPromptsPage() {
  const queryClient = useQueryClient()
  const currentUser = useUserStore((state) => state.user)
  const canManagePrompts = hasAnyRole(currentUser?.role, ['admin'])

  // editingEntry drives the modal's `opened` state; displayedEntry holds the last entry
  // shown so the modal content survives its own close transition instead of being
  // unmounted mid-animation, which otherwise leaves Mantine's scroll lock stuck open.
  const [editingEntry, setEditingEntry] = useState<CategoryPromptEntry | null>(null)
  const [displayedEntry, setDisplayedEntry] = useState<CategoryPromptEntry | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | PromptStatus>('all')
  const [domainFilter, setDomainFilter] = useState<string>('all')

  const promptsQuery = useQuery(aiPromptsQueryOptions.listTemplates({}))
  const masterReportQuery = useQuery(aiPromptsQueryOptions.masterReportPrompt())
  const [masterReportModalOpened, { open: openMasterReportModal, close: closeMasterReportModal }] =
    useDisclosure(false)

  const openEditor = (entry: CategoryPromptEntry) => {
    setDisplayedEntry(entry)
    setEditingEntry(entry)
  }

  const closeEditor = () => {
    setEditingEntry(null)
  }

  const handleSaved = () => {
    void queryClient.invalidateQueries({ queryKey: aiPromptsQueryKeys.all })
  }

  const domains = useMemo(() => promptsQuery.data ?? {}, [promptsQuery.data])
  const allEntries = useMemo(() => Object.values(domains).flat(), [domains])

  const summary = useMemo(() => {
    const totalCategories = allEntries.length
    const promptsCreated = allEntries.filter((entry) => entry.template !== null).length
    const activePrompts = allEntries.filter((entry) => getEntryStatus(entry) === 'active').length
    const missingPrompts = totalCategories - promptsCreated
    const lastUpdated = allEntries.reduce<string | null>((latest, entry) => {
      if (entry.template === null) return latest
      if (latest === null || new Date(entry.template.updatedAt) > new Date(latest)) {
        return entry.template.updatedAt
      }
      return latest
    }, null)

    return { totalCategories, promptsCreated, activePrompts, missingPrompts, lastUpdated }
  }, [allEntries])

  const domainOptions = [
    { value: 'all', label: 'All Domains' },
    ...Object.keys(domains).map((domain) => ({
      value: domain,
      label: TRS_DOMAIN_LABELS[domain] ?? domain,
    })),
  ]

  const matchesFilters = (entry: CategoryPromptEntry) => {
    const query = searchQuery.trim().toLowerCase()
    const matchesSearch =
      query.length === 0 ||
      entry.evidenceCategoryId.toLowerCase().includes(query) ||
      (entry.template?.promptName ?? '').toLowerCase().includes(query)
    const matchesStatus = statusFilter === 'all' || getEntryStatus(entry) === statusFilter
    return matchesSearch && matchesStatus
  }

  const visibleDomains = Object.entries(domains).filter(
    ([domain]) => domainFilter === 'all' || domainFilter === domain,
  )

  const handleClearFilters = () => {
    setSearchQuery('')
    setStatusFilter('all')
    setDomainFilter('all')
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={2}>AI Prompt Templates</Title>
          <Text c="dimmed">
            Manage AI prompt templates, evidence category mappings, and active prompt versions for
            TRS analysis.
          </Text>
        </div>
      </Group>

      <Paper withBorder p="md" radius="sm">
        <Group justify="space-between" align="center" wrap="wrap">
          <div>
            <Group gap="sm" mb={4}>
              <Title order={5}>Master Report Prompt</Title>
              {masterReportQuery.isSuccess ? (
                <Badge
                  color={masterReportQuery.data?.template.activeVersionId ? 'green' : 'red'}
                  variant="light"
                >
                  {masterReportQuery.data?.template
                    ? masterReportQuery.data.template.activeVersionId
                      ? 'Active'
                      : 'No Active Version'
                    : 'Not Created'}
                </Badge>
              ) : null}
            </Group>
            <Text size="sm" c="dimmed">
              The single customer-level prompt used to generate every Executive Transformation
              Readiness Report — required before any report can be generated.
            </Text>
          </div>
          {canManagePrompts ? (
            <Button
              variant={masterReportQuery.data ? 'default' : 'filled'}
              onClick={openMasterReportModal}
              loading={masterReportQuery.isPending}
            >
              {masterReportQuery.data ? 'Manage' : 'Create Master Report Prompt'}
            </Button>
          ) : null}
        </Group>
        {masterReportQuery.isError ? (
          <Alert color="red" title="Unable to load Master Report prompt status" mt="sm">
            {getApiErrorMessage(masterReportQuery.error)}
          </Alert>
        ) : null}
      </Paper>

      <SimpleGrid cols={{ base: 1, sm: 3, lg: 5 }}>
        <SummaryCard
          icon={<FolderSimpleIcon size={18} />}
          color="blue"
          label="Total Evidence Categories"
          value={summary.totalCategories}
          detail="Across all domains"
        />
        <SummaryCard
          icon={<FileTextIcon size={18} />}
          color="green"
          label="Prompts Created"
          value={summary.promptsCreated}
          detail={
            summary.totalCategories > 0
              ? formatCategoryPercent(summary.promptsCreated, summary.totalCategories)
              : undefined
          }
        />
        <SummaryCard
          icon={<ShieldCheckIcon size={18} />}
          color="violet"
          label="Active Prompts"
          value={summary.activePrompts}
          detail={
            summary.totalCategories > 0
              ? formatCategoryPercent(summary.activePrompts, summary.totalCategories)
              : undefined
          }
        />
        <SummaryCard
          icon={<WarningCircleIcon size={18} />}
          color="orange"
          label="Missing Prompts"
          value={summary.missingPrompts}
          detail={
            summary.totalCategories > 0
              ? formatCategoryPercent(summary.missingPrompts, summary.totalCategories)
              : undefined
          }
        />
        <SummaryCard
          icon={<ClockIcon size={18} />}
          color="gray"
          label="Last Updated"
          value={summary.lastUpdated !== null ? new Date(summary.lastUpdated).toLocaleDateString() : '—'}
          detail={summary.lastUpdated !== null ? new Date(summary.lastUpdated).toLocaleTimeString() : undefined}
        />
      </SimpleGrid>

      <Paper withBorder p="md" radius="sm">
        <Group justify="space-between" wrap="wrap">
          <TextInput
            placeholder="Search evidence categories or prompt names..."
            leftSection={<MagnifyingGlassIcon size={16} />}
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.currentTarget.value)
            }}
            w={320}
          />
          <Group gap="sm">
            <Select
              label="Domain"
              data={domainOptions}
              value={domainFilter}
              onChange={(value) => {
                setDomainFilter(value ?? 'all')
              }}
              allowDeselect={false}
              w={200}
            />
            <Select
              label="Status"
              data={STATUS_FILTER_OPTIONS}
              value={statusFilter}
              onChange={(value) => {
                const nextStatus = STATUS_FILTER_OPTIONS.find((option) => option.value === value)
                setStatusFilter(nextStatus?.value ?? 'all')
              }}
              allowDeselect={false}
              w={180}
            />
            <Button variant="default" onClick={handleClearFilters} mt={24}>
              Clear Filters
            </Button>
          </Group>
        </Group>
      </Paper>

      {promptsQuery.isError ? (
        <Alert color="red" title="Unable to load prompts">
          {getApiErrorMessage(promptsQuery.error)}
        </Alert>
      ) : null}

      {promptsQuery.isSuccess && allEntries.length === 0 ? (
        <Alert color="gray" title="No evidence categories found">
          There are no evidence categories configured yet.
        </Alert>
      ) : null}

      {visibleDomains.map(([domain, entries]) => (
        <DomainSection
          key={domain}
          domain={domain}
          entries={entries}
          filteredEntries={entries.filter(matchesFilters)}
          isLoading={promptsQuery.isFetching}
          canManagePrompts={canManagePrompts}
          onEdit={openEditor}
        />
      ))}

      <StatusLegend />

      {displayedEntry !== null ? (
        <PromptEditorModal
          key={`${displayedEntry.trsDomainId}:${displayedEntry.evidenceCategoryId}`}
          entry={displayedEntry}
          opened={editingEntry !== null}
          onClose={closeEditor}
          onSaved={handleSaved}
        />
      ) : null}

      {masterReportModalOpened ? (
        <MasterReportPromptModal
          detail={masterReportQuery.data ?? null}
          opened={masterReportModalOpened}
          onClose={closeMasterReportModal}
        />
      ) : null}
    </Stack>
  )
}

interface SummaryCardProps {
  icon: ReactNode
  color: string
  label: string
  value: string | number
  detail?: string | undefined
}

function SummaryCard({ icon, color, label, value, detail }: SummaryCardProps) {
  return (
    <Paper withBorder p="md" radius="sm">
      <Group justify="space-between" align="flex-start" mb="xs">
        <Text size="sm" c="dimmed">
          {label}
        </Text>
        <ThemeIcon color={color} variant="light" size="md" radius="sm">
          {icon}
        </ThemeIcon>
      </Group>
      <Title order={3}>{value}</Title>
      {detail !== undefined ? (
        <Text size="xs" c="dimmed">
          {detail}
        </Text>
      ) : null}
    </Paper>
  )
}

function StatusLegend() {
  return (
    <Stack gap="xs">
      <Text size="sm" fw={600}>
        Status Legend:
      </Text>
      <Group gap="lg">
        {STATUS_LEGEND_ITEMS.map((item) => (
          <Group key={item.status} gap="xs" wrap="nowrap">
            <Badge variant="light" color={STATUS_BADGE_COLORS[item.status]}>
              {STATUS_BADGE_LABELS[item.status]}
            </Badge>
            <Text size="sm" c="dimmed">
              {item.description}
            </Text>
          </Group>
        ))}
      </Group>
    </Stack>
  )
}

interface DomainSectionProps {
  domain: string
  entries: CategoryPromptEntry[]
  filteredEntries: CategoryPromptEntry[]
  isLoading: boolean
  canManagePrompts: boolean
  onEdit: (entry: CategoryPromptEntry) => void
}

function DomainSection({
  domain,
  entries,
  filteredEntries,
  isLoading,
  canManagePrompts,
  onEdit,
}: DomainSectionProps) {
  const [isOpen, { toggle }] = useDisclosure(true)

  const activeCount = entries.filter((entry) => getEntryStatus(entry) === 'active').length
  const missingCount = entries.filter((entry) => getEntryStatus(entry) === 'missing').length

  return (
    <Paper withBorder radius="sm">
      <UnstyledButton onClick={toggle} w="100%" p="md">
        <Group justify="space-between">
          <Group gap="sm">
            {isOpen ? <CaretUpIcon size={16} /> : <CaretDownIcon size={16} />}
            <ThemeIcon color="blue" variant="light" size="sm" radius="sm">
              <ShieldCheckIcon size={14} />
            </ThemeIcon>
            <Title order={4}>{TRS_DOMAIN_LABELS[domain] ?? domain}</Title>
          </Group>
          <Text size="sm" c="dimmed">
            {entries.length} {entries.length === 1 ? 'category' : 'categories'} · {activeCount}{' '}
            active {activeCount === 1 ? 'prompt' : 'prompts'} · {missingCount} missing{' '}
            {missingCount === 1 ? 'prompt' : 'prompts'}
          </Text>
        </Group>
      </UnstyledButton>

      <Collapse expanded={isOpen}>
        <Paper radius="sm" pos="relative">
          <LoadingOverlay visible={isLoading} />
          <Table withColumnBorders>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Evidence Category</Table.Th>
                <Table.Th>Prompt Name</Table.Th>
                <Table.Th w={140}>Active Version</Table.Th>
                <Table.Th w={140}>Status</Table.Th>
                <Table.Th w={180}>Last Updated</Table.Th>
                <Table.Th w={140}>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filteredEntries.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={6}>
                    <Text c="dimmed" size="sm" ta="center" py="md">
                      No evidence categories match the current filters.
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                filteredEntries.map((entry) => {
                  const status = getEntryStatus(entry)
                  const template = entry.template
                  return (
                    <Table.Tr key={entry.evidenceCategoryId}>
                      <Table.Td>{entry.evidenceCategoryId}</Table.Td>
                      <Table.Td>
                        {template !== null ? (
                          <Text size="sm">{template.promptName}</Text>
                        ) : (
                          <Text c="dimmed" size="sm">
                            Not Created
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        {template?.activeVersion ? (
                          <Badge variant="light" color="green">
                            {template.activeVersion.versionLabel} Active
                          </Badge>
                        ) : (
                          <Text c="dimmed" size="sm">
                            {template !== null ? 'No active version' : 'Not Created'}
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Badge variant="light" color={STATUS_BADGE_COLORS[status]}>
                          {STATUS_BADGE_LABELS[status]}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        {template !== null ? (
                          <Text size="sm">{new Date(template.updatedAt).toLocaleString()}</Text>
                        ) : (
                          <Text c="dimmed" size="sm">
                            —
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        {canManagePrompts ? (
                          <Button
                            size="xs"
                            variant={template !== null ? 'default' : 'filled'}
                            onClick={() => {
                              onEdit(entry)
                            }}
                          >
                            {template !== null ? 'Edit Prompt' : 'Create Prompt'}
                          </Button>
                        ) : (
                          <Text c="dimmed" size="sm">
                            —
                          </Text>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  )
                })
              )}
            </Table.Tbody>
          </Table>
        </Paper>
      </Collapse>
    </Paper>
  )
}
