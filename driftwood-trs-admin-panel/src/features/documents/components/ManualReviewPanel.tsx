import { Alert, Badge, Divider, Group, Loader, Select, Stack, Textarea, Title } from '@mantine/core'

import { getApiErrorMessage } from '../../../common/api/client'
import { ManualReviewActionFooter } from './ManualReviewActionFooter'

// Same value set as AnalystDocumentDrawer's Sufficiency Assessment section — kept as a
// separate local copy rather than a shared import to avoid a circular dependency between
// the two files (AnalystDocumentDrawer renders ManualReviewPanel).
const SUFFICIENCY_OPTIONS = [
  { value: 'strong', label: 'Strong Evidence' },
  { value: 'partial', label: 'Partial Evidence' },
  { value: 'insufficient', label: 'Insufficient Evidence' },
  { value: 'not_relevant', label: 'Not Relevant' },
  { value: 'needs_human_followup', label: 'Needs Follow-Up' },
]

export interface ManualReviewFormState {
  executiveSummary: string
  documentQualityReview: string
  readinessFindings: string
  evidenceGaps: string
  humanValidationQuestions: string
  suggestedNextSteps: string
  draftAnalystFinding: string
  limitationsAndUncertainties: string
  evidenceSufficiency: string
  reviewerConfidence: string
  primaryColorIndicator: string
  recommendedAnalystAction: string
}

export const EMPTY_MANUAL_REVIEW_FORM: ManualReviewFormState = {
  executiveSummary: '',
  documentQualityReview: '',
  readinessFindings: '',
  evidenceGaps: '',
  humanValidationQuestions: '',
  suggestedNextSteps: '',
  draftAnalystFinding: '',
  limitationsAndUncertainties: '',
  evidenceSufficiency: '',
  reviewerConfidence: '',
  primaryColorIndicator: '',
  recommendedAnalystAction: '',
}

const TEXT_SECTIONS: { key: keyof ManualReviewFormState; label: string }[] = [
  { key: 'executiveSummary', label: 'Executive Summary' },
  { key: 'documentQualityReview', label: 'Document Quality Review' },
  { key: 'readinessFindings', label: 'Readiness Findings' },
  { key: 'evidenceGaps', label: 'Evidence Gaps' },
  { key: 'humanValidationQuestions', label: 'Human Validation Questions' },
  { key: 'suggestedNextSteps', label: 'Suggested Next Steps' },
  { key: 'draftAnalystFinding', label: 'Draft Analyst Finding' },
  { key: 'limitationsAndUncertainties', label: 'Limitations and Uncertainties' },
]

const CONFIDENCE_OPTIONS = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

const COLOR_INDICATOR_OPTIONS = [
  { value: 'Green', label: 'Green' },
  { value: 'Yellow', label: 'Yellow' },
  { value: 'Red', label: 'Red' },
]

const RECOMMENDED_ACTION_OPTIONS = [
  { value: 'accept', label: 'Accept' },
  { value: 'edit', label: 'Edit' },
  { value: 'add_finding', label: 'Add Finding' },
  { value: 'reject', label: 'Reject' },
  { value: 'request_evidence', label: 'Request Evidence' },
  { value: 'mark_insufficient', label: 'Mark Insufficient' },
]

interface ManualReviewPanelProps {
  form: ManualReviewFormState
  onFieldChange: (field: keyof ManualReviewFormState, value: string) => void
  onSaveDraft: () => void
  onMarkComplete: () => void
  /** True while the existing Manual Review (GET /manual-review/:documentId) is loading. */
  isLoading?: boolean
  /** True while Save Draft / Mark Complete is in flight (POST or PUT). */
  isSaving?: boolean
  /** Set when the last save attempt failed — shown as an inline alert. */
  saveError?: unknown
}

/**
 * Manual Review mode — a from-scratch, human-authored alternative to the AI Review
 * panel, offered when no active AI prompt exists (see AiReviewAvailabilityNotice).
 * Plain textareas and dropdowns only, no markdown. Backed by the real Manual Review API
 * (GET to load, POST to create, PUT to update) — see AnalystDocumentDrawer.
 */
function ManualReviewPanel({
  form,
  onFieldChange,
  onSaveDraft,
  onMarkComplete,
  isLoading = false,
  isSaving = false,
  saveError,
}: ManualReviewPanelProps) {
  const setField = (field: keyof ManualReviewFormState) => (value: string) => {
    onFieldChange(field, value)
  }

  return (
    <Stack gap="sm">
      <Group gap="xs" align="center">
        <Title order={6}>Manual Review</Title>
        <Badge color="blue" variant="light" size="sm">
          Manual Review
        </Badge>
        {isLoading ? <Loader size="xs" /> : null}
      </Group>

      {TEXT_SECTIONS.map((section) => (
        <Textarea
          key={section.key}
          label={section.label}
          value={form[section.key]}
          onChange={(event) => {
            setField(section.key)(event.currentTarget.value)
          }}
          autosize
          minRows={2}
          size="sm"
        />
      ))}

      <Divider />

      <Select
        label="Evidence Sufficiency"
        data={SUFFICIENCY_OPTIONS}
        value={form.evidenceSufficiency || null}
        onChange={(value) => {
          setField('evidenceSufficiency')(value ?? '')
        }}
        size="sm"
      />
      <Select
        label="Reviewer Confidence"
        data={CONFIDENCE_OPTIONS}
        value={form.reviewerConfidence || null}
        onChange={(value) => {
          setField('reviewerConfidence')(value ?? '')
        }}
        size="sm"
      />
      <Select
        label="Primary Color Indicator"
        data={COLOR_INDICATOR_OPTIONS}
        value={form.primaryColorIndicator || null}
        onChange={(value) => {
          setField('primaryColorIndicator')(value ?? '')
        }}
        size="sm"
      />
      <Select
        label="Recommended Analyst Action"
        data={RECOMMENDED_ACTION_OPTIONS}
        value={form.recommendedAnalystAction || null}
        onChange={(value) => {
          setField('recommendedAnalystAction')(value ?? '')
        }}
        size="sm"
      />

      {saveError ? (
        <Alert color="red" title="Unable to save manual review">
          {getApiErrorMessage(saveError)}
        </Alert>
      ) : null}

      <ManualReviewActionFooter
        onSaveDraft={onSaveDraft}
        onMarkComplete={onMarkComplete}
        isSaving={isSaving}
      />
    </Stack>
  )
}

export { ManualReviewPanel }
