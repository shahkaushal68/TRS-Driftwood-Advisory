import { Alert, Button, Group, Modal, Select, Stack, Textarea, TextInput } from '@mantine/core'
import { useState } from 'react'
import type { SubmitEventHandler } from 'react'

import { getApiErrorMessage } from '../../../common/api/client'
import type {
  CreateFindingRequest,
  IntakeDocumentFinding,
  UpdateFindingRequest,
} from '../../../common/api/documents'
import { SUFFICIENCY_LABELS } from '../../../common/api/documents'

interface FindingFormModalProps {
  finding?: IntakeDocumentFinding | undefined
  error?: unknown
  isSubmitting: boolean
  opened: boolean
  onClose: () => void
  onSubmit: (values: CreateFindingRequest | UpdateFindingRequest) => void
}

interface FormValues {
  title: string
  body: string
  sufficiencyRating: string
}

type FormErrors = Partial<Record<keyof FormValues, string>>

const SUFFICIENCY_OPTIONS = Object.entries(SUFFICIENCY_LABELS).map(([value, label]) => ({
  value,
  label,
}))

function FindingFormModal({
  finding,
  error,
  isSubmitting,
  opened,
  onClose,
  onSubmit,
}: FindingFormModalProps) {
  const isEdit = finding !== undefined
  const title = isEdit ? 'Edit finding' : 'Add finding'

  return (
    <Modal opened={opened} onClose={onClose} title={title} size="md">
      {opened ? (
        <FindingForm
          key={finding?.id ?? 'new'}
          {...(finding !== undefined ? { finding } : {})}
          error={error}
          isSubmitting={isSubmitting}
          onClose={onClose}
          onSubmit={onSubmit}
        />
      ) : null}
    </Modal>
  )
}

function FindingForm({
  finding,
  error,
  isSubmitting,
  onClose,
  onSubmit,
}: Omit<FindingFormModalProps, 'opened'>) {
  const isEdit = finding !== undefined
  const [values, setValues] = useState<FormValues>({
    title: finding?.title ?? '',
    body: finding?.body ?? '',
    sufficiencyRating: finding?.sufficiencyRating ?? '',
  })
  const [errors, setErrors] = useState<FormErrors>({})

  const validate = (v: FormValues): boolean => {
    const next: FormErrors = {}
    if (!v.title.trim()) next.title = 'Title is required'
    if (!v.body.trim()) next.body = 'Body is required'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit: SubmitEventHandler<HTMLFormElement> = (e) => {
    e.preventDefault()
    if (!validate(values)) return
    const payload: CreateFindingRequest | UpdateFindingRequest = {
      title: values.title.trim(),
      body: values.body.trim(),
      ...(values.sufficiencyRating ? { sufficiencyRating: values.sufficiencyRating } : {}),
    }
    onSubmit(payload)
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <Stack>
        {error !== undefined && error !== null ? (
          <Alert color="red" title="Unable to save finding">
            {getApiErrorMessage(error)}
          </Alert>
        ) : null}

        <TextInput
          label="Title"
          placeholder="e.g. Evidence Relevance Assessment"
          value={values.title}
          onChange={(e) => {
            setValues((v) => ({ ...v, title: e.currentTarget.value }))
          }}
          error={errors.title}
          withAsterisk
        />

        <Textarea
          label="Finding"
          placeholder="Describe the finding or observation…"
          value={values.body}
          onChange={(e) => {
            setValues((v) => ({ ...v, body: e.currentTarget.value }))
          }}
          error={errors.body}
          rows={4}
          autosize
          maxRows={10}
          withAsterisk
        />

        <Select
          label="Sufficiency Rating"
          placeholder="Optional"
          data={SUFFICIENCY_OPTIONS}
          value={values.sufficiencyRating || null}
          onChange={(val) => {
            setValues((v) => ({ ...v, sufficiencyRating: val ?? '' }))
          }}
          clearable
        />

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" loading={isSubmitting}>
            {isEdit ? 'Update finding' : 'Add finding'}
          </Button>
        </Group>
      </Stack>
    </form>
  )
}

export { FindingFormModal }
