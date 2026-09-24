import { Alert, Button, Group, Modal, Select, Stack, Textarea } from '@mantine/core'
import { useState } from 'react'
import type { SubmitEventHandler } from 'react'

import { getApiErrorMessage } from '../../../common/api/client'
import type { ClassifyDocumentRequest, IntakeDocument } from '../../../common/api/documents'
import { TRS_DOMAIN_LABELS } from '../../../common/api/documents'

interface ClassifyDocumentModalProps {
  document: IntakeDocument | null
  evidenceCategories: Record<string, string[]>
  error?: unknown
  isSubmitting: boolean
  opened: boolean
  onClose: () => void
  onSubmit: (documentId: string, values: ClassifyDocumentRequest) => void
}

interface FormValues {
  trsDomain: string
  evidenceCategory: string
  evidenceType: string
  notes: string
}

type FormErrors = Partial<Record<keyof FormValues, string>>

const DOMAIN_OPTIONS = Object.entries(TRS_DOMAIN_LABELS).map(([value, label]) => ({
  value,
  label,
}))

const EVIDENCE_TYPE_OPTIONS = [
  { value: 'required', label: 'Required Evidence' },
  { value: 'optional', label: 'Optional / Supporting Evidence' },
  { value: 'other', label: 'Other' },
]

function ClassifyDocumentModal({
  document,
  evidenceCategories,
  error,
  isSubmitting,
  opened,
  onClose,
  onSubmit,
}: ClassifyDocumentModalProps) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={`Classify: ${document?.fileName ?? ''}`}
      size="md"
    >
      {opened && document !== null ? (
        <ClassifyForm
          key={document.id}
          document={document}
          evidenceCategories={evidenceCategories}
          error={error}
          isSubmitting={isSubmitting}
          onClose={onClose}
          onSubmit={onSubmit}
        />
      ) : null}
    </Modal>
  )
}

function ClassifyForm({
  document,
  evidenceCategories,
  error,
  isSubmitting,
  onClose,
  onSubmit,
}: Omit<ClassifyDocumentModalProps, 'opened'> & { document: IntakeDocument }) {
  const [values, setValues] = useState<FormValues>({
    trsDomain: document.trsDomain ?? '',
    evidenceCategory: document.evidenceCategory ?? '',
    evidenceType: document.evidenceType ?? 'required',
    notes: document.notes ?? '',
  })
  const [errors, setErrors] = useState<FormErrors>({})

  const categoryOptions = values.trsDomain
    ? (evidenceCategories[values.trsDomain] ?? []).map((c) => ({ value: c, label: c }))
    : []

  const validate = (v: FormValues): boolean => {
    const next: FormErrors = {}
    if (!v.trsDomain) next.trsDomain = 'Domain is required'
    if (!v.evidenceCategory) next.evidenceCategory = 'Evidence category is required'
    if (!v.evidenceType) next.evidenceType = 'Evidence type is required'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit: SubmitEventHandler<HTMLFormElement> = (e) => {
    e.preventDefault()
    if (!validate(values)) return
    const trimmedNotes = values.notes.trim()
    onSubmit(document.id, {
      trsDomain: values.trsDomain,
      evidenceCategory: values.evidenceCategory,
      evidenceType: values.evidenceType,
      ...(trimmedNotes ? { notes: trimmedNotes } : {}),
    })
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <Stack>
        {error !== undefined && error !== null ? (
          <Alert color="red" title="Unable to classify document">
            {getApiErrorMessage(error)}
          </Alert>
        ) : null}

        <Select
          label="TRS Domain"
          placeholder="Select domain"
          data={DOMAIN_OPTIONS}
          value={values.trsDomain || null}
          onChange={(val) => {
            setValues((v) => ({ ...v, trsDomain: val ?? '', evidenceCategory: '' }))
          }}
          error={errors.trsDomain}
          withAsterisk
          allowDeselect={false}
        />

        <Select
          label="Evidence Category"
          placeholder={values.trsDomain ? 'Select category' : 'Select a domain first'}
          data={categoryOptions}
          value={values.evidenceCategory || null}
          onChange={(val) => {
            setValues((v) => ({ ...v, evidenceCategory: val ?? '' }))
          }}
          error={errors.evidenceCategory}
          disabled={!values.trsDomain}
          withAsterisk
          allowDeselect={false}
        />

        <Select
          label="Evidence Type"
          data={EVIDENCE_TYPE_OPTIONS}
          value={values.evidenceType || null}
          onChange={(val) => {
            setValues((v) => ({ ...v, evidenceType: val ?? 'required' }))
          }}
          error={errors.evidenceType}
          withAsterisk
          allowDeselect={false}
        />

        <Textarea
          label="Notes / Context"
          placeholder="Optional — explain why this document is relevant"
          value={values.notes}
          onChange={(e) => {
            setValues((v) => ({ ...v, notes: e.currentTarget.value }))
          }}
          rows={3}
          autosize
          maxRows={6}
        />

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" loading={isSubmitting}>
            Save classification
          </Button>
        </Group>
      </Stack>
    </form>
  )
}

export { ClassifyDocumentModal }
