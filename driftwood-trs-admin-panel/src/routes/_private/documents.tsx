import {
  Alert,
  Badge,
  Button,
  Divider,
  Group,
  List,
  Loader,
  LoadingOverlay,
  Modal,
  Paper,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { DownloadSimpleIcon } from '@phosphor-icons/react/DownloadSimple'
import { useDisclosure } from '@mantine/hooks'
import { RobotIcon } from '@phosphor-icons/react/Robot'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

import { getApiErrorMessage } from '../../common/api/client'
import { generateReportPdf } from '../../common/pdf/generateReportPdf'
import type {
  AiAnalysis,
  ClassifyDocumentRequest,
  IntakeDocument,
  IntakeDocumentFinding,
} from '../../common/api/documents'
import {
  AI_VERDICT_COLORS,
  AI_VERDICT_LABELS,
  documentMutationOptions,
  documentQueryKeys,
  documentQueryOptions,
  SUFFICIENCY_COLORS,
  SUFFICIENCY_LABELS,
  TRS_DOMAIN_LABELS,
} from '../../common/api/documents'
import { requireRole } from '../../common/auth/roles'
import { parsePaginationSearch } from '../../common/pagination'
import { TablePagination } from '../../components/pagination'
import { ClassifyDocumentModal } from '../../features/documents/components/ClassifyDocumentModal'
import { DocumentUploadArea } from '../../features/documents/components/DocumentUploadArea'
import { DocumentsTable } from '../../features/documents/components/DocumentsTable'
import { DomainEvidenceSummary } from '../../features/documents/components/DomainEvidenceSummary'
import { ResetRequiredNotice } from '../../features/documents/components/ResetRequiredNotice'

export const Route = createFileRoute('/_private/documents')({
  validateSearch: parsePaginationSearch,
  beforeLoad: () => {
    requireRole(['user'])
  },
  component: DocumentIntakePage,
})

function DocumentIntakePage() {
  const queryClient = useQueryClient()
  const navigate = Route.useNavigate()
  const params = Route.useSearch()

  const [classifyingDoc, setClassifyingDoc] = useState<IntakeDocument | null>(null)
  const [viewingReportDoc, setViewingReportDoc] = useState<IntakeDocument | null>(null)
  const [pendingDeleteDoc, setPendingDeleteDoc] = useState<IntakeDocument | null>(null)
  const [reportModalOpened, { open: openReport, close: closeReport }] = useDisclosure(false)
  const [aiReviewConfirmOpened, { open: openAiReviewConfirm, close: closeAiReviewConfirm }] =
    useDisclosure(false)
  const [resubmitSuccessDoc, setResubmitSuccessDoc] = useState<IntakeDocument | null>(null)

  const setPage = (pageNumber: number) => {
    void navigate({ search: (prev) => ({ ...prev, pageNumber }), resetScroll: false })
  }

  const handleSort = (column: string) => {
    const sortDirection =
      params.sortBy === column && params.sortDirection === 'asc' ? 'desc' : 'asc'
    void navigate({
      search: (prev) => ({ ...prev, sortBy: column, sortDirection, pageNumber: 1 }),
      resetScroll: false,
    })
  }

  const evidenceCategoriesQuery = useQuery(documentQueryOptions.evidenceCategories())
  const evidenceSummaryQuery = useQuery(documentQueryOptions.evidenceSummary())
  const aiReviewSummaryQuery = useQuery(documentQueryOptions.aiReviewSummary())
  const userAiReviewStatusQuery = useQuery(documentQueryOptions.userAiReviewStatus())
  const documentsQuery = useQuery({
    ...documentQueryOptions.myList(params),
    placeholderData: keepPreviousData,
  })
  const findingsQuery = useQuery({
    ...documentQueryOptions.findings(viewingReportDoc?.id ?? ''),
    enabled: viewingReportDoc !== null,
  })
  const documentAiAnalysisQuery = useQuery({
    ...documentQueryOptions.documentAiAnalysis(viewingReportDoc?.id ?? ''),
    enabled: viewingReportDoc !== null,
  })

  const reviewStatus = userAiReviewStatusQuery.data?.status ?? 'idle'
  const isLocked = reviewStatus === 'completed' || reviewStatus === 'failed'

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: documentQueryKeys.all })
  }

  const classifyMutation = useMutation({
    ...documentMutationOptions.classify(classifyingDoc?.id ?? ''),
    onSuccess: () => {
      setClassifyingDoc(null)
      invalidateAll()
    },
  })

  const deleteMutation = useMutation({
    ...documentMutationOptions.delete(),
    onSuccess: () => {
      setPendingDeleteDoc(null)
      invalidateAll()
    },
  })

  const triggerAiReviewMutation = useMutation({
    ...documentMutationOptions.triggerAiReview(),
    onSettled: () => {
      invalidateAll()
    },
  })

  const handleUploaded = (doc: IntakeDocument) => {
    setPage(1)
    invalidateAll()
    setClassifyingDoc(doc)
  }

  // `resubmitDocument` returns the updated original (now-resubmitted) document, not the
  // new upload — so unlike `handleUploaded`, there's nothing to classify here yet.
  const handleResubmitted = (updatedDoc: IntakeDocument) => {
    setPage(1)
    invalidateAll()
    setResubmitSuccessDoc(updatedDoc)
  }

  const handleClassify = (_documentId: string, values: ClassifyDocumentRequest) => {
    classifyMutation.mutate(values)
  }

  const handleViewDocument = async (doc: IntakeDocument) => {
    try {
      const { url, fileType } = await queryClient.fetchQuery(documentQueryOptions.signedUrl(doc.id))
      if (fileType === 'text/plain') {
        window.open(url, '_blank')
      } else {
        const a = window.document.createElement('a')
        a.href = url
        a.target = '_blank'
        a.download = doc.fileName
        a.click()
      }
    } catch {
      /* handled by query error state */
    }
  }

  const handleViewReport = (doc: IntakeDocument) => {
    setViewingReportDoc(doc)
    openReport()
  }

  const aiSummary = aiReviewSummaryQuery.data
  const classifiedCount = aiSummary?.classified ?? 0

  const resetRequiredDocs = (documentsQuery.data?.data ?? []).filter((doc) => doc.resetRequired)

  const handleSubmitForAiReview = () => {
    closeAiReviewConfirm()
    triggerAiReviewMutation.mutate()
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={2}>Document Intake</Title>
          <Text c="dimmed" size="sm">
            Upload organisational evidence for the TRS Proof of Concept. This POC focuses on Data
            Integrity &amp; Trust and Governance &amp; Decision Rights. Uploaded evidence will be
            reviewed using AI-assisted analysis and Analyst validation before findings are
            published.
          </Text>
        </div>
        <Button
          leftSection={<RobotIcon size={16} />}
          disabled={classifiedCount === 0 || isLocked}
          loading={triggerAiReviewMutation.isPending}
          onClick={openAiReviewConfirm}
        >
          Submit for AI Review
          {classifiedCount > 0 && !isLocked ? ` (${String(classifiedCount)})` : ''}
        </Button>
      </Group>

      {reviewStatus === 'completed' ? (
        <Alert color="blue" title="AI review submitted">
          AI review has been submitted. Document uploads are permanently closed for this submission.
        </Alert>
      ) : reviewStatus === 'failed' ? (
        <Alert color="red" title="AI review error">
          AI review encountered an error. Please contact your Analyst or Admin.
        </Alert>
      ) : null}

      {resubmitSuccessDoc !== null ? (
        <Alert
          color="green"
          title="Resubmitted"
          withCloseButton
          onClose={() => {
            setResubmitSuccessDoc(null)
          }}
        >
          <Text size="sm">
            A new version of{' '}
            <Text span fw={600}>
              {resubmitSuccessDoc.fileName}
            </Text>{' '}
            has been uploaded and is awaiting classification.
          </Text>
        </Alert>
      ) : null}

      {resetRequiredDocs.length > 0 ? (
        <Stack gap="sm">
          {resetRequiredDocs.map((doc) => (
            <ResetRequiredNotice key={doc.id} document={doc} onResubmitted={handleResubmitted} />
          ))}
        </Stack>
      ) : null}

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

      <Paper withBorder p="md" radius="sm">
        <Title order={5} mb="md">
          Upload Evidence
        </Title>
        <DocumentUploadArea onUploaded={handleUploaded} disabled={isLocked} />
      </Paper>

      <Paper withBorder p="md" radius="sm" pos="relative">
        <Title order={5} mb="md">
          Uploaded Documents
        </Title>
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
                sortBy: params.sortBy,
                sortDirection: params.sortDirection,
                onSort: handleSort,
              }}
              {...(!isLocked && { onClassify: setClassifyingDoc })}
              onViewDocument={(doc) => {
                void handleViewDocument(doc)
              }}
              onViewFindings={handleViewReport}
              {...(!isLocked && {
                onDelete: (doc: IntakeDocument) => {
                  setPendingDeleteDoc(doc)
                },
              })}
            />
            <TablePagination
              total={documentsQuery.data?.meta.total ?? 0}
              page={params.pageNumber}
              perPage={params.perPage}
              onChange={setPage}
            />
          </>
        )}
      </Paper>

      <ClassifyDocumentModal
        document={classifyingDoc}
        evidenceCategories={evidenceCategoriesQuery.data ?? {}}
        opened={classifyingDoc !== null}
        isSubmitting={classifyMutation.isPending}
        error={classifyMutation.isError ? classifyMutation.error : undefined}
        onClose={() => {
          setClassifyingDoc(null)
        }}
        onSubmit={handleClassify}
      />

      <Modal
        opened={pendingDeleteDoc !== null}
        onClose={() => {
          setPendingDeleteDoc(null)
        }}
        title="Delete Document"
        size="sm"
      >
        <Stack gap="md">
          <Text size="sm">
            Are you sure you want to delete{' '}
            <Text component="span" fw={600}>
              {pendingDeleteDoc?.fileName}
            </Text>
            ? This action cannot be undone.
          </Text>
          {deleteMutation.isError ? (
            <Alert color="red" title="Delete failed">
              {getApiErrorMessage(deleteMutation.error)}
            </Alert>
          ) : null}
          <Group justify="flex-end" gap="sm">
            <Button
              variant="default"
              onClick={() => {
                setPendingDeleteDoc(null)
              }}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              color="red"
              loading={deleteMutation.isPending}
              onClick={() => {
                if (pendingDeleteDoc) deleteMutation.mutate(pendingDeleteDoc.id)
              }}
            >
              Yes, Delete
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={aiReviewConfirmOpened}
        onClose={closeAiReviewConfirm}
        title="Submit for AI Review"
        size="sm"
      >
        <Stack gap="md">
          {aiSummary && aiSummary.unclassified > 0 ? (
            <Text size="sm">
              <Text component="span" fw={600}>
                {aiSummary.unclassified}
              </Text>{' '}
              of your documents have not been classified yet and will be skipped. Only{' '}
              <Text component="span" fw={600}>
                {aiSummary.classified}
              </Text>{' '}
              classified documents will be submitted for AI review. Do you want to continue?
            </Text>
          ) : (
            <Stack gap="xs">
              <Alert color="yellow" title="Have you uploaded everything?">
                Make sure you've uploaded all your evidence documents before submitting. You won't
                be able to add more to this batch once AI review starts.
              </Alert>
              <Text size="sm">
                <Text component="span" fw={600}>
                  {aiSummary?.classified ?? classifiedCount}
                </Text>{' '}
                {(aiSummary?.classified ?? classifiedCount) === 1 ? 'document' : 'documents'} will
                be submitted for AI review. An Analyst will review the results before anything is
                published to you.
              </Text>
            </Stack>
          )}
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={closeAiReviewConfirm}>
              Cancel
            </Button>
            <Button onClick={handleSubmitForAiReview}>
              {aiSummary && aiSummary.unclassified > 0
                ? `Yes, Submit ${String(aiSummary.classified)} Documents`
                : 'Yes, Submit for AI Review'}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={reportModalOpened}
        onClose={() => {
          closeReport()
          setViewingReportDoc(null)
        }}
        title={`Report: ${viewingReportDoc?.fileName ?? ''}`}
        size="lg"
      >
        {reportModalOpened && viewingReportDoc ? (
          <ReportView
            doc={viewingReportDoc}
            findings={findingsQuery.data ?? []}
            analysis={documentAiAnalysisQuery.data ?? null}
            isLoading={findingsQuery.isPending || documentAiAnalysisQuery.isPending}
          />
        ) : null}
      </Modal>
    </Stack>
  )
}

interface ReportViewProps {
  doc: IntakeDocument
  findings: IntakeDocumentFinding[]
  analysis: AiAnalysis | null
  isLoading: boolean
}

function ReportView({ doc, findings, analysis, isLoading }: ReportViewProps) {
  if (isLoading) {
    return (
      <Stack align="center" py="xl">
        <Loader />
      </Stack>
    )
  }

  const canDownload = analysis?.reportStatus === 'published'

  return (
    <Stack gap="md">
      {canDownload ? (
        <Group justify="flex-end">
          <Button
            size="xs"
            variant="light"
            leftSection={<DownloadSimpleIcon size={14} />}
            onClick={() => {
              generateReportPdf(doc.fileName, analysis, findings)
            }}
          >
            Download PDF
          </Button>
        </Group>
      ) : null}

      {analysis ? (
        <>
          {analysis.aiVerdict ? (
            <Badge
              size="lg"
              color={AI_VERDICT_COLORS[analysis.aiVerdict] ?? 'gray'}
              variant="filled"
              fullWidth
              style={{ textAlign: 'center' }}
            >
              {AI_VERDICT_LABELS[analysis.aiVerdict] ?? analysis.aiVerdict}
            </Badge>
          ) : null}

          <Text size="sm">{analysis.rawOutput.executiveSummary}</Text>

          {(analysis.rawOutput.humanValidationQuestions ?? []).length > 0 ? (
            <>
              <Text size="sm" fw={500}>
                Questions to consider:
              </Text>
              <List size="sm" type="ordered" withPadding>
                {(analysis.rawOutput.humanValidationQuestions ?? []).map((q, i) => (
                  <List.Item key={i}>
                    <Text size="sm" fs="italic">
                      {q}
                    </Text>
                  </List.Item>
                ))}
              </List>
            </>
          ) : null}

          {findings.length > 0 ? <Divider /> : null}
        </>
      ) : (
        <Text size="sm" c="dimmed">
          Report details are being prepared.
        </Text>
      )}

      {findings.length > 0 ? <FindingsList findings={findings} /> : null}
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
