import {
  Alert,
  Autocomplete,
  Badge,
  Button,
  Divider,
  Group,
  LoadingOverlay,
  Modal,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { ArrowCounterClockwiseIcon } from '@phosphor-icons/react/ArrowCounterClockwise'
import { ChartLineUpIcon } from '@phosphor-icons/react/ChartLineUp'
import { CheckCircleIcon } from '@phosphor-icons/react/CheckCircle'
import { ClockIcon } from '@phosphor-icons/react/Clock'
import { MagnifyingGlassIcon } from '@phosphor-icons/react/MagnifyingGlass'
import { UsersFourIcon } from '@phosphor-icons/react/UsersFour'
import { WarningCircleIcon } from '@phosphor-icons/react/WarningCircle'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'

import { getApiErrorMessage } from '../../../common/api/client'
import type { IntakeDocument, IntakeDocumentFinding } from '../../../common/api/documents'
import {
  documentMutationOptions,
  documentQueryKeys,
  documentQueryOptions,
  SUFFICIENCY_COLORS,
  SUFFICIENCY_LABELS,
  TRS_DOMAIN_LABELS,
} from '../../../common/api/documents'
import { hasAnyRole, requireRole } from '../../../common/auth/roles'
import { userQueryOptions } from '../../../common/api/users'
import { useUserStore } from '../../../common/hooks/useUserStore'
import { deriveMockCustomerStats } from '../../../common/mocks/customerStats'
import { parsePaginationSearch, type PaginationParams } from '../../../common/pagination'
import { TablePagination } from '../../../components/pagination'
import { StatCard } from '../../../components/StatCard'
import { AnalystDocumentDrawer } from '../../../features/documents/components/AnalystDocumentDrawer'
import { CustomerCard, type CustomerCardData } from '../../../features/documents/components/CustomerCard'
import { DocumentsTable } from '../../../features/documents/components/DocumentsTable'
import { DomainEvidenceSummary } from '../../../features/documents/components/DomainEvidenceSummary'
import {
  ResetDocumentModal,
  type ResetDocumentFormValues,
} from '../../../features/documents/components/ResetDocumentModal'
import { ExecutiveReportSection } from '../../../features/executive-report/components/ExecutiveReportSection'

// Fetch all users for the dropdown — higher perPage, sort by name
const USERS_DROPDOWN_PARAMS = {
  pageNumber: 1,
  perPage: 200,
  sortBy: 'name',
  sortDirection: 'asc' as const,
}

type AnalystDocumentsSearch = PaginationParams & { selectedUserId: string | null }

function parseAnalystDocumentsSearch(search: Record<string, unknown>): AnalystDocumentsSearch {
  return {
    ...parsePaginationSearch(search),
    selectedUserId: typeof search['selectedUserId'] === 'string' ? search['selectedUserId'] : null,
  }
}

export const Route = createFileRoute('/_private/analyst/documents')({
  validateSearch: parseAnalystDocumentsSearch,
  beforeLoad: () => {
    requireRole(['analyst', 'admin'])
  },
  component: AnalystDocumentsPage,
})

function AnalystDocumentsPage() {
  const queryClient = useQueryClient()
  const navigate = Route.useNavigate()
  const { selectedUserId, ...docParams } = Route.useSearch()
  const currentUser = useUserStore((state) => state.user)
  const canResetDocument = hasAnyRole(currentUser?.role, ['admin', 'analyst'])

  // Controlled autocomplete text — kept local since it's ephemeral typing state.
  // lastInitializedUserId tracks which user's display text has been populated so we
  // only overwrite the field when the URL's selectedUserId actually changes.
  const [autocompleteValue, setAutocompleteValue] = useState('')
  const [lastInitializedUserId, setLastInitializedUserId] = useState<string | null>(null)
  const [findingsModalOpened, { open: openFindings, close: closeFindings }] = useDisclosure(false)
  const [viewingFindingsDoc, setViewingFindingsDoc] = useState<IntakeDocument | null>(null)
  const [drawerOpened, { open: openDrawer, close: closeDrawer }] = useDisclosure(false)
  const [reviewingDoc, setReviewingDoc] = useState<IntakeDocument | null>(null)
  const [manualReviewRequested, setManualReviewRequested] = useState(false)
  const [resetConfirmOpened, { open: openResetConfirm, close: closeResetConfirm }] =
    useDisclosure(false)
  const [customerSearch, setCustomerSearch] = useState('')

  // Document-level Evidence Reset workflow state. `resettingDoc` drives the modal's
  // `opened` prop; `displayedResettingDoc` keeps the modal's content mounted through its
  // own close transition (see the scroll-lock note on ResetDocumentModal).
  const [resettingDoc, setResettingDoc] = useState<IntakeDocument | null>(null)
  const [displayedResettingDoc, setDisplayedResettingDoc] = useState<IntakeDocument | null>(null)
  const [resetSuccessDoc, setResetSuccessDoc] = useState<IntakeDocument | null>(null)

  const setPage = (pageNumber: number) => {
    void navigate({ search: (prev) => ({ ...prev, pageNumber }), resetScroll: false })
  }

  const handleSort = (column: string) => {
    const sortDirection =
      docParams.sortBy === column && docParams.sortDirection === 'asc' ? 'desc' : 'asc'
    void navigate({
      search: (prev) => ({ ...prev, sortBy: column, sortDirection, pageNumber: 1 }),
      resetScroll: false,
    })
  }

  const usersQuery = useQuery(userQueryOptions.directory(USERS_DROPDOWN_PARAMS))

  const resetMutation = useMutation({
    ...documentMutationOptions.resetUserDocuments(selectedUserId ?? ''),
    onSuccess: () => {
      closeResetConfirm()
      void queryClient.invalidateQueries({ queryKey: documentQueryKeys.all })
    },
  })
  const userOptions = (usersQuery.data?.data ?? [])
    .filter((u) => u.role === 'user')
    .map((u) => ({ value: u.id, label: `${u.name} (${u.email})` }))

  // The backend has no Customer/Organization entity yet, so each end-user account is
  // treated as one customer, decorated with deterministic mock operational stats — see
  // common/mocks/customerStats.ts for why and what to replace once that model exists.
  const now = useMemo(() => new Date(), [])
  const customers: CustomerCardData[] = useMemo(() => {
    return (usersQuery.data?.data ?? [])
      .filter((u) => u.role === 'user')
      .map((u) => ({ id: u.id, name: u.name, ...deriveMockCustomerStats(u.id, now) }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [usersQuery.data, now])

  const filteredCustomers = customers.filter((customer) =>
    customer.name.toLowerCase().includes(customerSearch.trim().toLowerCase()),
  )

  const customerSummary = useMemo(() => {
    const totalCustomers = customers.length
    const assessmentInProgress = customers.filter((c) => c.reviewStatus === 'in_progress').length
    const evidenceComplete = customers.filter((c) => c.reviewStatus === 'completed').length
    const stalledOrOverdue = customers.filter((c) => c.reviewStatus === 'not_started').length
    const lastActivity = customers.reduce<string | null>((latest, c) => {
      if (c.lastActivity === null) return latest
      if (latest === null || new Date(c.lastActivity) > new Date(latest)) return c.lastActivity
      return latest
    }, null)

    return { totalCustomers, assessmentInProgress, evidenceComplete, stalledOrOverdue, lastActivity }
  }, [customers])

  // When navigating to this page with a selectedUserId already in the URL (e.g., back button),
  // populate the autocomplete display text once users data loads.
  // Uses the derived-state-during-render pattern to avoid a useEffect.
  if (selectedUserId !== null && selectedUserId !== lastInitializedUserId && usersQuery.data) {
    const matched = usersQuery.data.data.find((u) => u.id === selectedUserId)
    if (matched) {
      setLastInitializedUserId(selectedUserId)
      setAutocompleteValue(`${matched.name} (${matched.email})`)
    }
  }

  const evidenceSummaryQuery = useQuery({
    ...documentQueryOptions.analystEvidenceSummaryForUser(selectedUserId ?? ''),
    enabled: selectedUserId !== null,
  })
  const documentsQuery = useQuery({
    ...documentQueryOptions.analystListByUser(selectedUserId ?? '', docParams),
    enabled: selectedUserId !== null,
    placeholderData: keepPreviousData,
  })
  const findingsQuery = useQuery({
    ...documentQueryOptions.findings(viewingFindingsDoc?.id ?? ''),
    enabled: viewingFindingsDoc !== null,
  })

  const handleUserSelect = (userId: string) => {
    void navigate({ search: (prev) => ({ ...prev, selectedUserId: userId, pageNumber: 1 }) })
    const matched = (usersQuery.data?.data ?? []).find((u) => u.id === userId)
    if (matched) setAutocompleteValue(`${matched.name} (${matched.email})`)
  }

  const handleAutocompleteChange = (value: string) => {
    setAutocompleteValue(value)
  }

  const handleViewDocument = async (doc: IntakeDocument) => {
    try {
      const { url, fileType, fileName } = await queryClient.fetchQuery(
        documentQueryOptions.signedUrl(doc.id),
      )
      if (fileType === 'text/plain') {
        window.open(url, '_blank')
      } else {
        const a = window.document.createElement('a')
        a.href = url
        a.target = '_blank'
        a.download = fileName
        a.click()
      }
    } catch {
      /* no-op */
    }
  }

  const handleViewFindings = (doc: IntakeDocument) => {
    setViewingFindingsDoc(doc)
    openFindings()
  }

  const handleReviewDoc = (doc: IntakeDocument) => {
    setReviewingDoc(doc)
    setManualReviewRequested(false)
    openDrawer()
  }

  // Opens the same drawer straight into the Manual Review panel — the real, backend-backed
  // review path, available independently of whether an AI review already ran (see
  // AnalystDocumentDrawer's `initialManualReviewActive`).
  const handleManualReview = (doc: IntakeDocument) => {
    setReviewingDoc(doc)
    setManualReviewRequested(true)
    openDrawer()
  }

  const handleDocumentUpdated = (doc: IntakeDocument) => {
    setReviewingDoc(doc)
    void queryClient.invalidateQueries({ queryKey: documentQueryKeys.all })
  }

  const openResetDocumentModal = (doc: IntakeDocument) => {
    setDisplayedResettingDoc(doc)
    setResettingDoc(doc)
  }

  const closeResetDocumentModal = () => {
    setResettingDoc(null)
    resetDocumentMutation.reset()
  }

  const resetDocumentMutation = useMutation({
    ...documentMutationOptions.resetDocument(resettingDoc?.id ?? ''),
    onSuccess: (updatedDoc) => {
      void queryClient.invalidateQueries({ queryKey: documentQueryKeys.all })
      setResetSuccessDoc(updatedDoc)
      setResettingDoc(null)
    },
  })

  // Format as the admin's local calendar date, not `.toISOString()` — that converts to
  // UTC first, which silently shifts the date by one day for any timezone ahead of UTC.
  const formatLocalDate = (date: Date): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${String(year)}-${month}-${day}`
  }

  const handleResetDocumentSubmit = (values: ResetDocumentFormValues) => {
    resetDocumentMutation.mutate({
      resetReason: values.reason,
      ...(values.requestedCorrection.trim().length > 0
        ? { requestedCorrection: values.requestedCorrection }
        : {}),
      ...(values.dueDate ? { dueDate: formatLocalDate(values.dueDate) } : {}),
    })
  }

  const selectedUser = selectedUserId
    ? (usersQuery.data?.data ?? []).find((u) => u.id === selectedUserId)
    : null

  // Reused across audit fields (generated/approved/published by) instead of a second fetch —
  // `usersQuery` already loads the full user directory for the customer Autocomplete above.
  const userNameById = useMemo(
    () => new Map((usersQuery.data?.data ?? []).map((u) => [u.id, u.name])),
    [usersQuery.data],
  )
  const resolveUserName = (userId: string) => userNameById.get(userId) ?? userId

  const autocompleteProps = {
    placeholder: 'Search users...',
    data: userOptions,
    value: autocompleteValue,
    onChange: handleAutocompleteChange,
    onOptionSubmit: handleUserSelect,
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={2}>Document Review</Title>
          <Text c="dimmed" size="sm">
            {selectedUserId === null
              ? 'Review customer submitted evidence at the organization level.'
              : 'Select a user to review their submitted evidence.'}
          </Text>
        </div>
        {selectedUserId !== null ? (
          <Group gap="sm">
            <Button
              color="red"
              variant="light"
              leftSection={<ArrowCounterClockwiseIcon size={16} />}
              onClick={openResetConfirm}
            >
              Reset Submission
            </Button>
            <Autocomplete {...autocompleteProps} w={300} />
          </Group>
        ) : null}
      </Group>

      {selectedUserId === null ? (
        <Stack gap="lg">
          <SimpleGrid cols={{ base: 1, sm: 3, lg: 5 }}>
            <StatCard
              icon={<UsersFourIcon size={18} />}
              color="blue"
              label="Total Customers"
              value={customerSummary.totalCustomers}
              detail="All organizations"
            />
            <StatCard
              icon={<ChartLineUpIcon size={18} />}
              color="green"
              label="Assessment In Progress"
              value={customerSummary.assessmentInProgress}
              detail={
                customerSummary.totalCustomers > 0
                  ? `${String(Math.round((customerSummary.assessmentInProgress / customerSummary.totalCustomers) * 100))}% of customers`
                  : undefined
              }
            />
            <StatCard
              icon={<CheckCircleIcon size={18} />}
              color="violet"
              label="Evidence Complete"
              value={customerSummary.evidenceComplete}
              detail={
                customerSummary.totalCustomers > 0
                  ? `${String(Math.round((customerSummary.evidenceComplete / customerSummary.totalCustomers) * 100))}% of customers`
                  : undefined
              }
            />
            <StatCard
              icon={<WarningCircleIcon size={18} />}
              color="orange"
              label="Stalled / Overdue"
              value={customerSummary.stalledOrOverdue}
              detail={
                customerSummary.totalCustomers > 0
                  ? `${String(Math.round((customerSummary.stalledOrOverdue / customerSummary.totalCustomers) * 100))}% of customers`
                  : undefined
              }
            />
            <StatCard
              icon={<ClockIcon size={18} />}
              color="gray"
              label="Last Activity"
              value={
                customerSummary.lastActivity !== null
                  ? new Date(customerSummary.lastActivity).toLocaleDateString()
                  : '—'
              }
              detail="Most recent activity"
            />
          </SimpleGrid>

          <div>
            <Title order={4} mb={4}>
              Customers ({filteredCustomers.length})
            </Title>
            <Group justify="space-between" align="flex-end" mb="md">
              <Text c="dimmed" size="sm">
                Select a customer to view their evidence summary and documents.
              </Text>
              <TextInput
                placeholder="Search customers..."
                leftSection={<MagnifyingGlassIcon size={16} />}
                value={customerSearch}
                onChange={(event) => {
                  setCustomerSearch(event.currentTarget.value)
                }}
                w={280}
              />
            </Group>
          </div>

          <div style={{ position: 'relative', minHeight: usersQuery.isFetching ? 120 : undefined }}>
            <LoadingOverlay visible={usersQuery.isFetching} />

            {usersQuery.isError ? (
              <Alert color="red" title="Unable to load customers">
                {getApiErrorMessage(usersQuery.error)}
              </Alert>
            ) : usersQuery.isSuccess && customers.length === 0 ? (
              <Alert color="gray" title="No customers found">
                There are no customer accounts to review yet.
              </Alert>
            ) : usersQuery.isSuccess && filteredCustomers.length === 0 ? (
              <Alert color="gray" title="No matching customers">
                No customers match your search.
              </Alert>
            ) : (
              <SimpleGrid cols={{ base: 1, sm: 2, lg: 3, xl: 4 }}>
                {filteredCustomers.map((customer) => (
                  <CustomerCard key={customer.id} customer={customer} />
                ))}
              </SimpleGrid>
            )}
          </div>
        </Stack>
      ) : (
        <>
          <Paper withBorder p="md" radius="sm" pos="relative">
            <Title order={5} mb="md">
              Evidence Summary
            </Title>
            <LoadingOverlay visible={evidenceSummaryQuery.isPending} />
            {evidenceSummaryQuery.isError ? (
              <Alert color="red" title="Unable to load evidence summary">
                {getApiErrorMessage(evidenceSummaryQuery.error)}
              </Alert>
            ) : evidenceSummaryQuery.data ? (
              <DomainEvidenceSummary summaries={evidenceSummaryQuery.data} />
            ) : null}
          </Paper>

          <Paper withBorder p="md" radius="sm" pos="relative">
            <Title order={5} mb="md">
              Uploaded Documents
            </Title>
            {resetSuccessDoc !== null ? (
              <Alert
                color="green"
                title="Document Reset Successfully"
                mb="md"
                withCloseButton
                onClose={() => {
                  setResetSuccessDoc(null)
                }}
              >
                <Text size="sm">
                  <Text span fw={600}>
                    {resetSuccessDoc.fileName}
                  </Text>{' '}
                  has been marked as{' '}
                  <Text span fw={600}>
                    Reset / Resubmission Required
                  </Text>
                  . The customer must upload a new version before review can continue.
                </Text>
              </Alert>
            ) : null}
            <LoadingOverlay visible={documentsQuery.isFetching} />
            {documentsQuery.isError ? (
              <Alert color="red" title="Unable to load documents">
                {getApiErrorMessage(documentsQuery.error)}
              </Alert>
            ) : (
              <>
                <DocumentsTable
                  documents={documentsQuery.data?.data ?? []}
                  sort={{
                    sortBy: docParams.sortBy,
                    sortDirection: docParams.sortDirection,
                    onSort: handleSort,
                  }}
                  onViewDocument={(doc) => {
                    void handleViewDocument(doc)
                  }}
                  onReview={handleReviewDoc}
                  onManualReview={handleManualReview}
                  onViewFindings={handleViewFindings}
                  onResetDocument={openResetDocumentModal}
                  canResetDocument={canResetDocument}
                />
                <TablePagination
                  total={documentsQuery.data?.meta.total ?? 0}
                  page={docParams.pageNumber}
                  perPage={docParams.perPage}
                  onChange={setPage}
                />
              </>
            )}
          </Paper>

          <ExecutiveReportSection
            customerId={selectedUserId}
            customerName={selectedUser?.name ?? ''}
            resolveUserName={resolveUserName}
          />
        </>
      )}

      <Modal
        opened={resetConfirmOpened}
        onClose={() => {
          closeResetConfirm()
          resetMutation.reset()
        }}
        title="Reset Submission"
        size="sm"
      >
        <Stack gap="md">
          <Text size="sm">
            Are you sure you want to reset{' '}
            <Text component="span" fw={600}>
              {selectedUser ? `${selectedUser.name}'s` : "this user's"}
            </Text>{' '}
            submission? All uploaded documents will be soft-deleted and their AI review status will
            be reset. The data is preserved but will no longer be visible to anyone.
          </Text>
          <Alert color="red" variant="light">
            This cannot be undone from the UI. The user will start with a blank slate.
          </Alert>
          {resetMutation.isError ? (
            <Alert color="red" title="Reset failed">
              {getApiErrorMessage(resetMutation.error)}
            </Alert>
          ) : null}
          <Group justify="flex-end" gap="sm">
            <Button
              variant="default"
              onClick={() => {
                closeResetConfirm()
                resetMutation.reset()
              }}
              disabled={resetMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              color="red"
              loading={resetMutation.isPending}
              onClick={() => {
                if (selectedUserId) resetMutation.mutate()
              }}
            >
              Yes, Reset Submission
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={findingsModalOpened}
        onClose={() => {
          closeFindings()
          setViewingFindingsDoc(null)
        }}
        title={`Findings: ${viewingFindingsDoc?.fileName ?? ''}`}
        size="lg"
      >
        {findingsModalOpened && findingsQuery.data ? (
          <FindingsList findings={findingsQuery.data} />
        ) : null}
        {findingsQuery.isError ? (
          <Alert color="red" title="Unable to load findings">
            {getApiErrorMessage(findingsQuery.error)}
          </Alert>
        ) : null}
      </Modal>

      <AnalystDocumentDrawer
        document={reviewingDoc}
        opened={drawerOpened}
        onClose={closeDrawer}
        onDocumentUpdated={handleDocumentUpdated}
        initialManualReviewActive={manualReviewRequested}
      />

      {displayedResettingDoc !== null ? (
        <ResetDocumentModal
          key={displayedResettingDoc.id}
          document={displayedResettingDoc}
          opened={resettingDoc !== null}
          isSubmitting={resetDocumentMutation.isPending}
          error={resetDocumentMutation.isError ? resetDocumentMutation.error : null}
          onClose={closeResetDocumentModal}
          onSubmit={handleResetDocumentSubmit}
        />
      ) : null}
    </Stack>
  )
}

function FindingsList({ findings }: { findings: IntakeDocumentFinding[] }) {
  if (findings.length === 0) {
    return (
      <Text c="dimmed" size="sm">
        No findings published yet.
      </Text>
    )
  }

  return (
    <Stack gap="md">
      {findings.map((finding, i) => (
        <Stack key={finding.id} gap="xs">
          {i > 0 ? <Divider /> : null}
          <Group gap="xs">
            <Text size="sm" fw={600}>
              {finding.title}
            </Text>
            {finding.sufficiencyRating ? (
              <Badge
                size="xs"
                color={SUFFICIENCY_COLORS[finding.sufficiencyRating] ?? 'gray'}
                variant="light"
              >
                {SUFFICIENCY_LABELS[finding.sufficiencyRating] ?? finding.sufficiencyRating}
              </Badge>
            ) : null}
          </Group>
          <Text size="sm" c="dimmed">
            {TRS_DOMAIN_LABELS[finding.trsDomain] ?? finding.trsDomain} · {finding.evidenceCategory}
          </Text>
          <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
            {finding.body}
          </Text>
        </Stack>
      ))}
    </Stack>
  )
}
