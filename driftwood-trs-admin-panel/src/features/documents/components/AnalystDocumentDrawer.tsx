import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Divider,
  Drawer,
  Group,
  Loader,
  LoadingOverlay,
  Select,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { DownloadSimpleIcon } from '@phosphor-icons/react/DownloadSimple'
import { PencilSimpleIcon } from '@phosphor-icons/react/PencilSimple'
import { RobotIcon } from '@phosphor-icons/react/Robot'
import { TrashIcon } from '@phosphor-icons/react/Trash'
import { WarningIcon } from '@phosphor-icons/react/Warning'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { getApiErrorMessage } from '../../../common/api/client'
import type {
  AiReviewExecutionResult,
  CreateFindingRequest,
  IntakeDocument,
  IntakeDocumentFinding,
  ManualReview,
  SetSufficiencyRequest,
  UpdateFindingRequest,
  UpdateManualReviewRequest,
} from '../../../common/api/documents'
import {
  DOCUMENT_STATUS_COLORS,
  DOCUMENT_STATUS_LABELS,
  SUFFICIENCY_COLORS,
  SUFFICIENCY_LABELS,
  TRS_DOMAIN_LABELS,
  documentApi,
  documentMutationOptions,
  documentQueryKeys,
  documentQueryOptions,
} from '../../../common/api/documents'
import { useAiReviewGate } from '../utils/aiReviewEligibility'
import { AiReviewAvailabilityNotice } from './AiReviewAvailabilityNotice'
import { AnalystNotesSection } from './AnalystNotesSection'
import { FindingFormModal } from './FindingFormModal'
import {
  EMPTY_MANUAL_REVIEW_FORM,
  ManualReviewPanel,
  type ManualReviewFormState,
} from './ManualReviewPanel'
import { ReviewActionFooter } from './ReviewActionFooter'
import { ReviewSectionCard } from './ReviewSectionCard'
import { ReviewStatusBadge, type ReviewStatus } from './ReviewStatusBadge'

interface AnalystDocumentDrawerProps {
  document: IntakeDocument | null
  opened: boolean
  onClose: () => void
  onDocumentUpdated: (doc: IntakeDocument) => void
  /** Open straight into the Manual Review panel instead of the AI Review screen — used by
   *  the "Manual Review" row action, which must work even when an AI review has already
   *  completed for this document (Manual Review and AI Review are independent, coexisting
   *  reviews on the backend; see `manual_review` vs `ai_review_response`). */
  initialManualReviewActive?: boolean
}

const SUFFICIENCY_OPTIONS = [
  { value: 'strong', label: 'Strong Evidence' },
  { value: 'partial', label: 'Partial Evidence' },
  { value: 'insufficient', label: 'Insufficient Evidence' },
  { value: 'not_relevant', label: 'Not Relevant' },
  { value: 'needs_human_followup', label: 'Needs Follow-Up' },
]

const VALIDATION_OPTIONS = [
  { value: 'in_review', label: 'In Review' },
  { value: 'validated', label: 'Validated' },
  { value: 'rejected', label: 'Rejected' },
]

/**
 * The AI Review screen (see AiReviewSection below) intentionally flattens the 9 sections
 * into plain editable text — no structured selects, no markdown, per the ticket. This is
 * purely a local editing surface now (no save/publish mutations); `toReviewFormState`
 * seeds it once from whatever real AI analysis exists for the document.
 */
interface AiReviewFormState {
  topLevelAssessment: string
  executiveSummary: string
  documentQualityReview: string
  readinessFindings: string
  evidenceGaps: string
  humanValidationQuestions: string
  suggestedNextSteps: string
  draftAnalystFinding: string
  limitationsAndUncertainties: string
}

const AI_REVIEW_SECTIONS: { key: keyof AiReviewFormState; title: string }[] = [
  { key: 'topLevelAssessment', title: 'Top-Level Assessment' },
  { key: 'executiveSummary', title: 'Executive Summary' },
  { key: 'documentQualityReview', title: 'Document Quality Review' },
  { key: 'readinessFindings', title: 'Readiness Findings' },
  { key: 'evidenceGaps', title: 'Evidence Gaps' },
  { key: 'humanValidationQuestions', title: 'Human Validation Questions' },
  { key: 'suggestedNextSteps', title: 'Suggested Next Steps' },
  { key: 'draftAnalystFinding', title: 'Draft Analyst Finding' },
  { key: 'limitationsAndUncertainties', title: 'Limitations and Uncertainties' },
]

/**
 * Builds the flattened editable form from a real AI Review result. `structuredOutput` is
 * `null` whenever the model's response couldn't be parsed as structured JSON (see
 * `parseAiRawOutputFromContent` server-side) — in that case the raw model text is shown in
 * Executive Summary instead, so the analyst still sees the review rather than a blank panel.
 */
function toReviewFormState(result: AiReviewExecutionResult): AiReviewFormState {
  const ro = result.structuredOutput
  if (!ro) {
    return {
      topLevelAssessment: '',
      executiveSummary: result.rawMarkdown,
      documentQualityReview: '',
      readinessFindings: '',
      evidenceGaps: '',
      humanValidationQuestions: '',
      suggestedNextSteps: '',
      draftAnalystFinding: '',
      limitationsAndUncertainties: '',
    }
  }

  const tla = ro.topLevelAssessment
  const topLevelAssessment = [
    tla?.colorIndicator,
    tla?.evidenceSufficiencySuggestion,
    tla?.confidenceRating ? `Confidence: ${tla.confidenceRating}` : null,
    tla?.recommendedAnalystAction ? `Recommended action: ${tla.recommendedAnalystAction}` : null,
  ]
    .filter(Boolean)
    .join(' — ')

  return {
    topLevelAssessment,
    executiveSummary: ro.executiveSummary ?? '',
    documentQualityReview: ro.documentQualityReview ?? '',
    readinessFindings: (ro.systemOfRecordReadinessFindings ?? []).join('\n'),
    evidenceGaps: (ro.evidenceGaps ?? []).join('\n'),
    humanValidationQuestions: (ro.humanValidationQuestions ?? []).join('\n'),
    suggestedNextSteps: (ro.suggestedNextSteps ?? []).join('\n'),
    draftAnalystFinding: ro.draftAnalystFinding ?? '',
    limitationsAndUncertainties: ro.limitationsAndUncertainties ?? '',
  }
}

/**
 * Maps the real `ManualReview` entity onto the panel's form state. Field names differ in
 * one spot: the panel's `limitationsAndUncertainties` corresponds to the API/DB's
 * `limitations` column (named that way to match `AiRawOutput.limitationsAndUncertainties`
 * on the frontend, kept as `limitations` on the backend per the ticket's storage spec).
 */
function toManualReviewFormState(review: ManualReview): ManualReviewFormState {
  return {
    executiveSummary: review.executiveSummary ?? '',
    documentQualityReview: review.documentQualityReview ?? '',
    readinessFindings: review.readinessFindings ?? '',
    evidenceGaps: review.evidenceGaps ?? '',
    humanValidationQuestions: review.humanValidationQuestions ?? '',
    suggestedNextSteps: review.suggestedNextSteps ?? '',
    draftAnalystFinding: review.draftAnalystFinding ?? '',
    limitationsAndUncertainties: review.limitations ?? '',
    evidenceSufficiency: review.evidenceSufficiency ?? '',
    reviewerConfidence: review.reviewerConfidence ?? '',
    primaryColorIndicator: review.primaryColorIndicator ?? '',
    recommendedAnalystAction: review.recommendedAnalystAction ?? '',
  }
}

/** Inverse of `toManualReviewFormState` — omits empty fields so blank sections aren't sent
 *  as `''` (the dropdown fields are `@IsIn`-validated server-side and reject an empty string). */
function toManualReviewPayload(form: ManualReviewFormState): UpdateManualReviewRequest {
  return {
    ...(form.executiveSummary ? { executiveSummary: form.executiveSummary } : {}),
    ...(form.documentQualityReview ? { documentQualityReview: form.documentQualityReview } : {}),
    ...(form.readinessFindings ? { readinessFindings: form.readinessFindings } : {}),
    ...(form.evidenceGaps ? { evidenceGaps: form.evidenceGaps } : {}),
    ...(form.humanValidationQuestions
      ? { humanValidationQuestions: form.humanValidationQuestions }
      : {}),
    ...(form.suggestedNextSteps ? { suggestedNextSteps: form.suggestedNextSteps } : {}),
    ...(form.draftAnalystFinding ? { draftAnalystFinding: form.draftAnalystFinding } : {}),
    ...(form.limitationsAndUncertainties ? { limitations: form.limitationsAndUncertainties } : {}),
    ...(form.evidenceSufficiency ? { evidenceSufficiency: form.evidenceSufficiency } : {}),
    ...(form.reviewerConfidence ? { reviewerConfidence: form.reviewerConfidence } : {}),
    ...(form.primaryColorIndicator ? { primaryColorIndicator: form.primaryColorIndicator } : {}),
    ...(form.recommendedAnalystAction
      ? { recommendedAnalystAction: form.recommendedAnalystAction }
      : {}),
  }
}

function AnalystDocumentDrawer({
  document,
  opened,
  onClose,
  onDocumentUpdated,
  initialManualReviewActive = false,
}: AnalystDocumentDrawerProps) {
  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title="Document Review"
      position="right"
      size="lg"
      padding="md"
    >
      {opened && document !== null ? (
        <DrawerContent
          // Includes the entry mode in the key so reopening the same document via a
          // different action (AI Review vs Manual Review) always remounts fresh instead of
          // reusing whichever mode was active last time this document's drawer was open.
          key={`${document.id}-${initialManualReviewActive ? 'manual' : 'ai'}`}
          document={document}
          onDocumentUpdated={onDocumentUpdated}
          initialManualReviewActive={initialManualReviewActive}
        />
      ) : null}
    </Drawer>
  )
}

interface DrawerContentProps {
  document: IntakeDocument
  onDocumentUpdated: (doc: IntakeDocument) => void
  initialManualReviewActive: boolean
}

function DrawerContent({
  document,
  onDocumentUpdated,
  initialManualReviewActive,
}: DrawerContentProps) {
  const queryClient = useQueryClient()
  const [editingFinding, setEditingFinding] = useState<IntakeDocumentFinding | undefined>(undefined)
  const [addFindingOpened, { open: openAddFinding, close: closeAddFinding }] = useDisclosure(false)

  const docQuery = useQuery({
    ...documentQueryOptions.detail(document.id),
    initialData: document,
    initialDataUpdatedAt: 0,
  })
  const doc = docQuery.data

  const [sufficiency, setSufficiency] = useState(doc.sufficiencyRating ?? '')
  const [validationStatus, setValidationStatus] = useState(doc.analystValidationStatus ?? '')

  const findingsQuery = useQuery(documentQueryOptions.analystFindings(doc.id))
  // The real, OpenRouter-backed AI Review result (GET /documents/:id/ai-review) — replaces
  // the legacy mock `ai-analysis` lookup. Fetched whenever a review might already exist, so
  // reopening the drawer on an already-reviewed document loads it without re-triggering
  // OpenRouter; `runAiReviewMutation` below also seeds this query directly on success.
  const aiReviewResultQuery = useQuery({
    ...documentQueryOptions.aiReviewResult(doc.id),
    enabled: doc.aiReviewStatus === 'completed',
  })

  const invalidateFindings = () => {
    void queryClient.invalidateQueries({
      queryKey: documentQueryKeys.analystFindings(doc.id),
    })
  }

  const syncDoc = (updated: IntakeDocument) => {
    queryClient.setQueryData(documentQueryKeys.detail(updated.id), updated)
    void queryClient.invalidateQueries({ queryKey: documentQueryKeys.analystList() })
    onDocumentUpdated(updated)
  }

  const addFindingMutation = useMutation({
    ...documentMutationOptions.createFinding(doc.id),
    onSuccess: () => {
      closeAddFinding()
      invalidateFindings()
    },
  })

  const updateFindingMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateFindingRequest }) =>
      documentApi.updateFinding(doc.id, id, payload),
    onSuccess: () => {
      setEditingFinding(undefined)
      invalidateFindings()
    },
  })

  const deleteFindingMutation = useMutation({
    mutationFn: (findingId: string) => documentApi.deleteFinding(doc.id, findingId),
    onSuccess: invalidateFindings,
  })

  const setSufficiencyMutation = useMutation({
    ...documentMutationOptions.setSufficiency(doc.id),
    onSuccess: (updated) => {
      syncDoc(updated)
      setSufficiency(updated.sufficiencyRating ?? '')
      setValidationStatus(updated.analystValidationStatus ?? 'in_review')
    },
  })

  const handleAddFinding = (values: CreateFindingRequest | UpdateFindingRequest) => {
    addFindingMutation.mutate(values as CreateFindingRequest)
  }

  const handleEditFinding = (values: CreateFindingRequest | UpdateFindingRequest) => {
    if (!editingFinding) return
    updateFindingMutation.mutate({ id: editingFinding.id, payload: values })
  }

  const handleSetSufficiency = () => {
    const payload: SetSufficiencyRequest = {
      sufficiencyRating: sufficiency,
      analystValidationStatus: validationStatus,
    }
    setSufficiencyMutation.mutate(payload)
  }

  const canSetSufficiency = !['uploaded', 'classified', 'ai_review_in_progress'].includes(
    doc.status,
  )

  const analysis = aiReviewResultQuery.data

  // AI Review is a local-only editing surface (no save/publish backend calls) — seed it
  // once from whatever real analysis loads, using the derived-state-during-render pattern
  // to avoid an effect. `seededAnalysisId` guards against re-seeding on every render and
  // against clobbering the analyst's in-progress edits once seeded.
  const [reviewForm, setReviewForm] = useState<AiReviewFormState | null>(null)
  const [seededAnalysisId, setSeededAnalysisId] = useState<string | null>(null)
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>('draft')
  const [analystNotes, setAnalystNotes] = useState('')

  if (analysis && analysis.responseId !== seededAnalysisId) {
    setSeededAnalysisId(analysis.responseId)
    setReviewForm(toReviewFormState(analysis))
  }

  // Real eligibility from GET /documents/:id/ai-review-eligibility — see useAiReviewGate.
  // `doc.aiReviewStatus === 'completed'` is checked separately below and swaps this whole
  // section out for AiReviewSection, so the gate only needs to run while review hasn't
  // happened yet.
  const aiReviewGate = useAiReviewGate(doc, { enabled: doc.aiReviewStatus !== 'completed' })

  // Runs the real AI Review: POST /documents/:id/ai-review → OpenRouter, via the active
  // prompt template for this document's evidence category. On success, seeds the review
  // result query directly (avoids a redundant GET) and flips the document's status so the
  // rest of the drawer (and any other view reading this document) reflects it immediately.
  const runAiReviewMutation = useMutation({
    ...documentMutationOptions.runAiReview(doc.id),
    onSuccess: (result) => {
      queryClient.setQueryData(documentQueryKeys.aiReviewResult(doc.id), result)
      syncDoc({ ...doc, status: 'ai_reviewed', aiReviewStatus: 'completed' })
    },
  })

  const handleReviewAiReport = () => {
    runAiReviewMutation.mutate()
  }

  // Manual Review mode — a from-scratch, human-authored alternative to AI Review,
  // entered via "Manual Review" / "Start Manual Review" below. Backed by the real Manual
  // Review API: GET loads whatever review already exists (if any) once the panel opens,
  // Save Draft/Mark Complete POST the first time (no review yet) and PUT every time after.
  const [manualReviewActive, setManualReviewActive] = useState(initialManualReviewActive)
  const manualReviewQuery = useQuery({
    ...documentQueryOptions.manualReview(doc.id),
    enabled: manualReviewActive,
  })

  const [manualReviewForm, setManualReviewForm] =
    useState<ManualReviewFormState>(EMPTY_MANUAL_REVIEW_FORM)
  const [manualReviewId, setManualReviewId] = useState<string | null>(null)
  const [seededManualReviewDocId, setSeededManualReviewDocId] = useState<string | null>(null)

  // Derived-state-during-render seeding (same pattern as the AI Review form above): once
  // the GET resolves — an existing review, or `null` meaning none exists yet — seed the
  // local editable form once per document, so a background refetch never clobbers the
  // analyst's in-progress edits.
  if (manualReviewQuery.data !== undefined && seededManualReviewDocId !== doc.id) {
    setSeededManualReviewDocId(doc.id)
    setManualReviewId(manualReviewQuery.data?.id ?? null)
    setManualReviewForm(
      manualReviewQuery.data
        ? toManualReviewFormState(manualReviewQuery.data)
        : EMPTY_MANUAL_REVIEW_FORM,
    )
  }

  const updateManualReviewField = (field: keyof ManualReviewFormState, value: string) => {
    setManualReviewForm((prev) => ({ ...prev, [field]: value }))
  }

  const createManualReviewMutation = useMutation({
    ...documentMutationOptions.createManualReview(),
    onSuccess: (created) => {
      setManualReviewId(created.id)
      queryClient.setQueryData(documentQueryKeys.manualReview(doc.id), created)
      setReviewStatus(created.reviewStatus === 'completed' ? 'review_complete' : 'draft')
    },
  })

  const updateManualReviewMutation = useMutation({
    mutationFn: ({ reviewId, payload }: { reviewId: string; payload: UpdateManualReviewRequest }) =>
      documentApi.updateManualReview(reviewId, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(documentQueryKeys.manualReview(doc.id), updated)
      setReviewStatus(updated.reviewStatus === 'completed' ? 'review_complete' : 'draft')
    },
  })

  const saveManualReview = (status: 'draft' | 'completed') => {
    const payload = { ...toManualReviewPayload(manualReviewForm), reviewStatus: status }
    if (manualReviewId) {
      updateManualReviewMutation.mutate({ reviewId: manualReviewId, payload })
    } else {
      createManualReviewMutation.mutate({ documentId: doc.id, ...payload })
    }
  }

  const manualReviewSaveError = createManualReviewMutation.isError
    ? createManualReviewMutation.error
    : updateManualReviewMutation.isError
      ? updateManualReviewMutation.error
      : null
  const isSavingManualReview =
    createManualReviewMutation.isPending || updateManualReviewMutation.isPending

  const updateReviewField = (field: keyof AiReviewFormState, value: string) => {
    setReviewForm((prev) => (prev ? { ...prev, [field]: value } : prev))
    // First edit moves a fresh review out of "Draft" into "Under Review" — the other
    // four statuses are explicit, analyst-driven transitions via the action footer.
    setReviewStatus((prev) => (prev === 'draft' ? 'under_review' : prev))
  }

  return (
    <Stack gap="md">
      <Box>
        <Group justify="space-between" align="flex-start" mb="xs">
          <Title order={5} lineClamp={2}>
            {doc.fileName}
          </Title>
          <Badge color={DOCUMENT_STATUS_COLORS[doc.status] ?? 'gray'} variant="light" size="sm">
            {DOCUMENT_STATUS_LABELS[doc.status] ?? doc.status}
          </Badge>
        </Group>

        <Stack gap={4}>
          {doc.trsDomain ? (
            <Text size="sm">
              <Text span fw={500}>
                Domain:{' '}
              </Text>
              {TRS_DOMAIN_LABELS[doc.trsDomain] ?? doc.trsDomain}
            </Text>
          ) : null}
          {doc.evidenceCategory ? (
            <Text size="sm">
              <Text span fw={500}>
                Category:{' '}
              </Text>
              {doc.evidenceCategory}
            </Text>
          ) : null}
          {doc.evidenceType ? (
            <Text size="sm">
              <Text span fw={500}>
                Type:{' '}
              </Text>
              {doc.evidenceType}
            </Text>
          ) : null}
          {doc.notes ? (
            <Text size="sm">
              <Text span fw={500}>
                Notes:{' '}
              </Text>
              {doc.notes}
            </Text>
          ) : null}
        </Stack>
      </Box>

      <Divider />

      {doc.resetReason !== null || doc.previousDocumentVersionId !== null ? (
        <>
          <ResetInformationSection document={doc} />
          <Divider />
        </>
      ) : null}

      {canSetSufficiency ? (
        <>
          <Stack gap="xs">
            <Title order={6}>Sufficiency Assessment</Title>
            <Select
              label="Sufficiency Rating"
              data={SUFFICIENCY_OPTIONS}
              value={sufficiency || null}
              onChange={(val) => {
                setSufficiency(val ?? '')
              }}
              clearable
              placeholder="Select rating"
              size="sm"
            />
            <Select
              label="Validation Status"
              data={VALIDATION_OPTIONS}
              value={validationStatus || null}
              onChange={(val) => {
                setValidationStatus(val ?? '')
              }}
              clearable
              placeholder="Select status"
              size="sm"
            />
            <Button
              size="xs"
              variant="light"
              loading={setSufficiencyMutation.isPending}
              onClick={handleSetSufficiency}
              disabled={!sufficiency}
            >
              Save assessment
            </Button>
            {setSufficiencyMutation.isError ? (
              <Alert color="red">{getApiErrorMessage(setSufficiencyMutation.error)}</Alert>
            ) : null}
          </Stack>
          <Divider />
        </>
      ) : null}

      {doc.aiReviewStatus === 'completed' && !manualReviewActive ? (
        <>
          <Group justify="flex-end">
            <Button
              size="xs"
              variant="subtle"
              onClick={() => {
                setManualReviewActive(true)
              }}
            >
              Switch to Manual Review
            </Button>
          </Group>
          <AiReviewSection
            isLoading={aiReviewResultQuery.isPending}
            isError={aiReviewResultQuery.isError}
            error={aiReviewResultQuery.error}
            analysis={analysis ?? null}
            reviewForm={reviewForm}
            onFieldChange={updateReviewField}
            reviewStatus={reviewStatus}
            onStatusChange={setReviewStatus}
            analystNotes={analystNotes}
            onAnalystNotesChange={setAnalystNotes}
            onRunAiReview={handleReviewAiReport}
            isRunningAiReview={runAiReviewMutation.isPending}
            runAiReviewError={runAiReviewMutation.isError ? runAiReviewMutation.error : null}
          />
          <Divider />
        </>
      ) : manualReviewActive ? (
        <>
          <ManualReviewPanel
            form={manualReviewForm}
            onFieldChange={updateManualReviewField}
            onSaveDraft={() => {
              saveManualReview('draft')
            }}
            onMarkComplete={() => {
              saveManualReview('completed')
            }}
            isLoading={manualReviewQuery.isPending}
            isSaving={isSavingManualReview}
            saveError={manualReviewSaveError}
          />
          {manualReviewQuery.isError ? (
            <Alert color="red" title="Unable to load manual review">
              {getApiErrorMessage(manualReviewQuery.error)}
            </Alert>
          ) : null}
          <Divider />
        </>
      ) : (
        <>
          <AiReviewAvailabilityNotice
            gate={aiReviewGate}
            onReviewAiReport={handleReviewAiReport}
            onManualReview={() => {
              setManualReviewActive(true)
            }}
            isTriggering={runAiReviewMutation.isPending}
            triggerError={runAiReviewMutation.isError ? runAiReviewMutation.error : undefined}
          />
          <Divider />
        </>
      )}

      <Stack gap="xs" pos="relative">
        <Group justify="space-between">
          <Title order={6}>Findings</Title>
          <Button size="xs" variant="light" onClick={openAddFinding}>
            + Add finding
          </Button>
        </Group>

        <LoadingOverlay visible={findingsQuery.isPending} />

        {findingsQuery.isError ? (
          <Alert color="red" title="Unable to load findings">
            {getApiErrorMessage(findingsQuery.error)}
          </Alert>
        ) : null}

        {findingsQuery.data?.length === 0 ? (
          <Text size="sm" c="dimmed">
            No findings yet.
          </Text>
        ) : null}

        {(findingsQuery.data ?? []).map((finding) => (
          <FindingCard
            key={finding.id}
            finding={finding}
            onEdit={() => {
              setEditingFinding(finding)
            }}
            onDelete={() => {
              deleteFindingMutation.mutate(finding.id)
            }}
            isDeleting={deleteFindingMutation.isPending}
          />
        ))}
      </Stack>

      <FindingFormModal
        opened={addFindingOpened}
        onClose={closeAddFinding}
        onSubmit={handleAddFinding}
        isSubmitting={addFindingMutation.isPending}
        error={addFindingMutation.isError ? addFindingMutation.error : undefined}
      />

      <FindingFormModal
        opened={editingFinding !== undefined}
        {...(editingFinding !== undefined ? { finding: editingFinding } : {})}
        onClose={() => {
          setEditingFinding(undefined)
        }}
        onSubmit={handleEditFinding}
        isSubmitting={updateFindingMutation.isPending}
        error={updateFindingMutation.isError ? updateFindingMutation.error : undefined}
      />
    </Stack>
  )
}

interface ResetInformationSectionProps {
  document: IntakeDocument
}

/** Resolves a linked document's filename from the already-fetched detail query rather
 *  than adding a new endpoint — used for both the "previous" and "resubmitted" links. */
function useLinkedDocumentLabel(linkedDocumentId: string | null) {
  const query = useQuery({
    ...documentQueryOptions.detail(linkedDocumentId ?? ''),
    enabled: linkedDocumentId !== null,
  })
  return query.data?.fileName ?? (query.isError ? 'Unable to load' : 'Loading…')
}

/** Read-only summary of a document reset, driven entirely by real backend fields. */
function ResetInformationSection({ document: doc }: ResetInformationSectionProps) {
  // `doc.resetReason` is set only on the document that was itself reset.
  // `doc.previousDocumentVersionId` is set only on the new document created by
  // resubmission — a single document can have neither, either, or (if it was later
  // reset again) both.
  const wasReset = doc.resetReason !== null
  const resubmittedVersionLabel = useLinkedDocumentLabel(doc.resubmittedDocumentVersionId)
  const previousVersionLabel = useLinkedDocumentLabel(doc.previousDocumentVersionId)

  return (
    <Stack gap="xs">
      <Title order={6}>Reset Information</Title>
      <Box
        style={(theme) => ({
          border: `1px solid ${theme.colors.red[3]}`,
          borderRadius: theme.radius.sm,
          padding: theme.spacing.sm,
          background: theme.colors.red[0],
        })}
      >
        <Stack gap={6}>
          {wasReset ? (
            <>
              <Group gap="xs">
                <Text size="sm" fw={500}>
                  Status:
                </Text>
                {doc.resetRequired ? (
                  <Badge
                    color="red"
                    variant="filled"
                    size="sm"
                    leftSection={<WarningIcon size={12} />}
                  >
                    Reset / Resubmission Required
                  </Badge>
                ) : (
                  <Badge color="green" variant="filled" size="sm">
                    Resubmitted
                  </Badge>
                )}
              </Group>

              <Text size="sm">
                <Text span fw={500}>
                  Reset By:{' '}
                </Text>
                {doc.resetByName ?? '—'}
              </Text>
              <Text size="sm">
                <Text span fw={500}>
                  Reset Date:{' '}
                </Text>
                {doc.resetAt ? new Date(doc.resetAt).toLocaleDateString() : '—'}
              </Text>
              <Text size="sm">
                <Text span fw={500}>
                  Reset Time:{' '}
                </Text>
                {doc.resetAt ? new Date(doc.resetAt).toLocaleTimeString() : '—'}
              </Text>
              <Text size="sm">
                <Text span fw={500}>
                  Reset Reason:{' '}
                </Text>
                {doc.resetReason}
              </Text>
              {doc.requestedCorrection ? (
                <Text size="sm">
                  <Text span fw={500}>
                    Requested Correction:{' '}
                  </Text>
                  {doc.requestedCorrection}
                </Text>
              ) : null}
            </>
          ) : null}

          {doc.previousDocumentVersionId ? (
            <Group gap={6} mt={wasReset ? 4 : 0}>
              <Text size="sm" fw={500}>
                Previous Document Version:
              </Text>
              <Group gap={4} wrap="nowrap">
                <DownloadSimpleIcon size={14} />
                <Text size="sm">{previousVersionLabel}</Text>
              </Group>
            </Group>
          ) : null}

          {doc.resubmittedDocumentVersionId ? (
            <Group gap={6} mt={4}>
              <Text size="sm" fw={500}>
                Resubmitted Version:
              </Text>
              <Group gap={4} wrap="nowrap">
                <DownloadSimpleIcon size={14} />
                <Text size="sm">{resubmittedVersionLabel}</Text>
              </Group>
            </Group>
          ) : null}
        </Stack>
      </Box>
    </Stack>
  )
}


interface FindingCardProps {
  finding: IntakeDocumentFinding
  isDeleting: boolean
  onEdit: () => void
  onDelete: () => void
}

function FindingCard({ finding, isDeleting, onEdit, onDelete }: FindingCardProps) {
  return (
    <Box
      style={(theme) => ({
        border: `1px solid ${theme.colors.gray[3]}`,
        borderRadius: theme.radius.sm,
        padding: theme.spacing.sm,
      })}
    >
      <Stack gap="xs">
        <Group justify="space-between" align="flex-start">
          <Group gap="xs">
            <Text size="sm" fw={500}>
              {finding.title}
            </Text>
            {finding.isAiGenerated ? (
              <Badge size="xs" color="violet" variant="light" leftSection={<RobotIcon size={10} />}>
                AI
              </Badge>
            ) : null}
          </Group>
          <Group gap={4}>
            <Tooltip label="Edit">
              <ActionIcon variant="subtle" color="gray" size="xs" onClick={onEdit}>
                <PencilSimpleIcon size={14} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Delete">
              <ActionIcon
                variant="subtle"
                color="red"
                size="xs"
                onClick={onDelete}
                loading={isDeleting}
              >
                <TrashIcon size={14} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        <Text size="xs" c="dimmed" style={{ whiteSpace: 'pre-wrap' }}>
          {finding.body}
        </Text>

        <Group gap="xs">
          {finding.sufficiencyRating ? (
            <Badge
              size="xs"
              color={SUFFICIENCY_COLORS[finding.sufficiencyRating] ?? 'gray'}
              variant="outline"
            >
              {SUFFICIENCY_LABELS[finding.sufficiencyRating] ?? finding.sufficiencyRating}
            </Badge>
          ) : null}
          {finding.publishedAt ? (
            <Badge size="xs" color="green" variant="dot">
              Published
            </Badge>
          ) : null}
        </Group>
      </Stack>
    </Box>
  )
}


interface AiReviewSectionProps {
  isLoading: boolean
  isError: boolean
  error: unknown
  analysis: AiReviewExecutionResult | null
  reviewForm: AiReviewFormState | null
  onFieldChange: (field: keyof AiReviewFormState, value: string) => void
  reviewStatus: ReviewStatus
  onStatusChange: (status: ReviewStatus) => void
  analystNotes: string
  onAnalystNotesChange: (value: string) => void
  /** Lets the analyst (re-)run the real AI Review from within this section — needed for
   *  documents whose `aiReviewStatus` was already marked "completed" by the legacy mock
   *  bulk-submit flow (no real `ai_review_response` row exists for those yet). */
  onRunAiReview: () => void
  isRunningAiReview: boolean
  runAiReviewError: unknown
}

/**
 * Internal Analyst/Admin-only review screen for AI-generated findings, before they'd
 * become part of the Master Report (publishing itself is out of scope here). Fully
 * local-state: editing a section, updating notes, or using the action footer never
 * calls the backend — see the ticket's "No backend integration" requirement.
 */
function AiReviewSection({
  isLoading,
  isError,
  error,
  analysis,
  reviewForm,
  onFieldChange,
  reviewStatus,
  onStatusChange,
  analystNotes,
  onAnalystNotesChange,
  onRunAiReview,
  isRunningAiReview,
  runAiReviewError,
}: AiReviewSectionProps) {
  return (
    <Stack gap="sm">
      <Group justify="space-between" align="flex-start">
        <div>
          <Group gap="xs" align="center">
            <Title order={6}>AI Review</Title>
            <Badge color="orange" variant="light" size="sm">
              Draft / Internal Only
            </Badge>
          </Group>
          <Text size="xs" c="dimmed">
            AI-generated findings require Analyst review before publication.
          </Text>
        </div>
        <ReviewStatusBadge status={reviewStatus} />
      </Group>

      {/* Always available while a review exists, not just when one is missing — lets an
       *  Analyst re-run after a prompt/config change (e.g. the AI's output wasn't
       *  structured JSON the first time) without needing the document reset. */}
      <Group justify="flex-end">
        <Button
          size="xs"
          variant="subtle"
          onClick={onRunAiReview}
          loading={isRunningAiReview}
        >
          {analysis ? 'Re-run AI Review' : 'Run AI Review'}
        </Button>
      </Group>
      {runAiReviewError ? (
        <Alert color="red" title="AI review failed">
          {getApiErrorMessage(runAiReviewError)}
        </Alert>
      ) : null}

      {isLoading ? (
        <Group justify="center" py="md">
          <Loader size="sm" />
        </Group>
      ) : isError ? (
        <Alert color="red" title="Unable to load AI review">
          {getApiErrorMessage(error)}
        </Alert>
      ) : !analysis || !reviewForm ? (
        <Text size="sm" c="dimmed">
          No AI review data available for this document yet.
        </Text>
      ) : (
        <Stack gap="sm">
          {AI_REVIEW_SECTIONS.map((section) => (
            <ReviewSectionCard
              key={section.key}
              title={section.title}
              value={reviewForm[section.key]}
              onChange={(value) => {
                onFieldChange(section.key, value)
              }}
            />
          ))}

          <AnalystNotesSection value={analystNotes} onChange={onAnalystNotesChange} />

          <ReviewActionFooter
            onSaveDraft={() => {
              onStatusChange('draft')
            }}
            onAccept={() => {
              onStatusChange('accepted')
            }}
            onReject={() => {
              onStatusChange('rejected')
            }}
            onMarkReviewComplete={() => {
              onStatusChange('review_complete')
            }}
          />
        </Stack>
      )}
    </Stack>
  )
}

export { AnalystDocumentDrawer }
