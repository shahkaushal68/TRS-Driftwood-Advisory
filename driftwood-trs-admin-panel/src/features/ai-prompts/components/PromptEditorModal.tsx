import MDEditor from '@uiw/react-md-editor'
import '@uiw/react-md-editor/markdown-editor.css'
import {
  Alert,
  Badge,
  Button,
  Divider,
  Group,
  Loader,
  Modal,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import {
  aiPromptsMutationOptions,
  aiPromptsQueryKeys,
  aiPromptsQueryOptions,
  type CategoryPromptEntry,
  type PromptVersion,
} from '../../../common/api/aiPrompts'
import { getApiErrorMessage } from '../../../common/api/client'

interface PromptEditorModalProps {
  entry: CategoryPromptEntry
  opened: boolean
  onClose: () => void
  onSaved: () => void
}

function getCharCountColor(count: number): string {
  if (count === 0) return 'dimmed'
  if (count < 1000) return 'red'
  if (count < 10_000) return 'green'
  if (count < 100_000) return 'yellow'
  return 'red'
}

export function PromptEditorModal({ entry, opened, onClose, onSaved }: PromptEditorModalProps) {
  if (entry.template === null) {
    return (
      <CreateTemplateForm
        trsDomainId={entry.trsDomainId}
        evidenceCategoryId={entry.evidenceCategoryId}
        opened={opened}
        onClose={onClose}
        onSaved={onSaved}
      />
    )
  }

  return (
    <EditTemplateForm
      templateId={entry.template.id}
      evidenceCategoryId={entry.evidenceCategoryId}
      opened={opened}
      onClose={onClose}
      onSaved={onSaved}
    />
  )
}

interface CreateTemplateFormProps {
  trsDomainId: string
  evidenceCategoryId: string
  opened: boolean
  onClose: () => void
  onSaved: () => void
}

function CreateTemplateForm({
  trsDomainId,
  evidenceCategoryId,
  opened,
  onClose,
  onSaved,
}: CreateTemplateFormProps) {
  const [promptName, setPromptName] = useState(`${evidenceCategoryId} Review`)
  const [promptDescription, setPromptDescription] = useState('')
  const [promptType, setPromptType] = useState('evidence_review')
  const [content, setContent] = useState('')

  const createMutation = useMutation({
    ...aiPromptsMutationOptions.createTemplate(),
    onSuccess: () => {
      onSaved()
      onClose()
    },
  })

  const charCount = content.length

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={`Create Prompt — ${evidenceCategoryId}`}
      size="xl"
      onExitTransitionEnd={() => {
        document.body.style.removeProperty('overflow')
        document.body.style.removeProperty('padding-right')
        document.documentElement.style.removeProperty('overflow')
        document.documentElement.style.removeProperty('padding-right')
      }}
    >
      <Stack gap="md">
        {createMutation.isError ? (
          <Alert color="red" title="Failed to create prompt template">
            {getApiErrorMessage(createMutation.error)}
          </Alert>
        ) : null}

        <TextInput
          label="Prompt name"
          value={promptName}
          onChange={(event) => {
            setPromptName(event.currentTarget.value)
          }}
          required
        />
        <Textarea
          label="Description"
          placeholder="Optional"
          value={promptDescription}
          onChange={(event) => {
            setPromptDescription(event.currentTarget.value)
          }}
          autosize
          minRows={2}
        />
        <TextInput
          label="Prompt type"
          description="Free-text category for how this prompt is used, e.g. evidence_review"
          value={promptType}
          onChange={(event) => {
            setPromptType(event.currentTarget.value)
          }}
          required
        />

        <Stack gap={4}>
          <Text size="sm" fw={500}>
            Initial prompt content
          </Text>
          <div data-color-mode="light">
            <MDEditor
              value={content}
              onChange={(val) => {
                setContent(val ?? '')
              }}
              height={350}
            />
          </div>
          <Group justify="flex-end">
            <Text size="xs" c={getCharCountColor(charCount)}>
              {charCount.toLocaleString()} characters
            </Text>
          </Group>
        </Stack>

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={createMutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              createMutation.mutate({
                promptName,
                promptDescription: promptDescription.trim().length > 0 ? promptDescription : undefined,
                trsDomainId,
                evidenceCategoryId,
                promptType,
                initialVersion:
                  content.trim().length > 0 ? { promptContent: content } : undefined,
              })
            }}
            loading={createMutation.isPending}
            disabled={promptName.trim().length === 0 || promptType.trim().length === 0}
          >
            Create Prompt Template
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

interface EditTemplateFormProps {
  templateId: string
  evidenceCategoryId: string
  opened: boolean
  onClose: () => void
  onSaved: () => void
}

function EditTemplateForm({
  templateId,
  evidenceCategoryId,
  opened,
  onClose,
  onSaved,
}: EditTemplateFormProps) {
  const queryClient = useQueryClient()
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  const [editedContent, setEditedContent] = useState<string | null>(null)
  const [changeSummary, setChangeSummary] = useState('')
  const [archiveConfirmOpened, { open: openArchiveConfirm, close: closeArchiveConfirm }] =
    useDisclosure(false)

  const detailQuery = useQuery({ ...aiPromptsQueryOptions.getTemplate(templateId), enabled: opened })

  const versions = detailQuery.data?.versions ?? []
  const template = detailQuery.data?.template ?? null

  // Default the version selector to the active version, falling back to the newest one.
  const activeVersion = versions.find((v) => v.isActive) ?? null
  const currentVersionId = selectedVersionId ?? activeVersion?.id ?? versions[0]?.id ?? null
  const selectedVersion = versions.find((v) => v.id === currentVersionId) ?? null
  const content = editedContent ?? selectedVersion?.promptContent ?? ''

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: aiPromptsQueryKeys.all })
    onSaved()
  }

  const createVersionMutation = useMutation({
    ...aiPromptsMutationOptions.createVersion(),
    onSuccess: (version) => {
      invalidate()
      setSelectedVersionId(version.id)
      setEditedContent(null)
      setChangeSummary('')
    },
  })

  const activateVersionMutation = useMutation({
    ...aiPromptsMutationOptions.activateVersion(),
    onSuccess: () => {
      invalidate()
    },
  })

  const archiveMutation = useMutation({
    ...aiPromptsMutationOptions.archiveTemplate(),
    onSuccess: () => {
      invalidate()
      closeArchiveConfirm()
      onClose()
    },
  })

  const handleVersionSelect = (versionId: string | null) => {
    if (versionId === null) return
    setSelectedVersionId(versionId)
    setEditedContent(null)
  }

  const versionOptions = versions.map((v: PromptVersion) => ({
    value: v.id,
    label: `${v.versionLabel}${v.isActive ? ' (active)' : ''} — ${new Date(v.createdAt).toLocaleString()}`,
  }))

  const charCount = content.length
  const hasUnsavedEdits = editedContent !== null && editedContent !== selectedVersion?.promptContent
  const isArchived = template?.status === 'archived'

  return (
    <>
      <Modal
        opened={opened}
        onClose={onClose}
        title={`Edit Prompt — ${evidenceCategoryId}`}
        size="xl"
        onExitTransitionEnd={() => {
          document.body.style.removeProperty('overflow')
          document.body.style.removeProperty('padding-right')
          document.documentElement.style.removeProperty('overflow')
          document.documentElement.style.removeProperty('padding-right')
        }}
      >
        {detailQuery.isPending ? (
          <Group justify="center" py="xl">
            <Loader size="sm" />
          </Group>
        ) : detailQuery.isError ? (
          <Alert color="red" title="Unable to load prompt template">
            {getApiErrorMessage(detailQuery.error)}
          </Alert>
        ) : (
          <Stack gap="md">
            {isArchived ? (
              <Alert color="gray" title="This prompt template is archived">
                Activating any version below will reactivate it.
              </Alert>
            ) : null}

            {(createVersionMutation.isError ||
              activateVersionMutation.isError ||
              archiveMutation.isError) && (
              <Alert color="red" title="Something went wrong">
                {getApiErrorMessage(
                  createVersionMutation.error ?? activateVersionMutation.error ?? archiveMutation.error,
                )}
              </Alert>
            )}

            {versionOptions.length > 0 && (
              <Select
                label="Version history"
                description="Select a past version to load its content into the editor"
                data={versionOptions}
                value={currentVersionId}
                onChange={handleVersionSelect}
              />
            )}

            <div data-color-mode="light">
              <MDEditor
                value={content}
                onChange={(val) => {
                  setEditedContent(val ?? '')
                }}
                height={350}
              />
            </div>
            <Group justify="space-between">
              <Text size="xs" c={getCharCountColor(charCount)}>
                {charCount.toLocaleString()} characters
              </Text>
              {selectedVersion ? (
                <Badge variant="light" color={selectedVersion.isActive ? 'green' : 'gray'}>
                  {selectedVersion.versionLabel} · {selectedVersion.status}
                </Badge>
              ) : null}
            </Group>

            {hasUnsavedEdits ? (
              <TextInput
                label="Change summary"
                placeholder="What changed in this version? (optional)"
                value={changeSummary}
                onChange={(event) => {
                  setChangeSummary(event.currentTarget.value)
                }}
              />
            ) : null}

            <Divider />

            <Group justify="space-between">
              <Button
                color="red"
                variant="subtle"
                onClick={openArchiveConfirm}
                disabled={isArchived || archiveMutation.isPending}
              >
                Archive prompt template
              </Button>
              <Group justify="flex-end">
                <Button variant="default" onClick={onClose}>
                  Close
                </Button>
                {selectedVersion && !selectedVersion.isActive ? (
                  <Button
                    variant="default"
                    loading={activateVersionMutation.isPending}
                    disabled={hasUnsavedEdits}
                    onClick={() => {
                      activateVersionMutation.mutate({ templateId, versionId: selectedVersion.id })
                    }}
                  >
                    Activate {selectedVersion.versionLabel}
                  </Button>
                ) : null}
                <Button
                  onClick={() => {
                    createVersionMutation.mutate({
                      templateId,
                      payload: {
                        promptContent: content,
                        changeSummary: changeSummary.trim().length > 0 ? changeSummary : undefined,
                      },
                    })
                  }}
                  loading={createVersionMutation.isPending}
                  disabled={!hasUnsavedEdits || content.trim().length === 0}
                >
                  Save as new version
                </Button>
              </Group>
            </Group>
          </Stack>
        )}
      </Modal>

      <Modal
        opened={archiveConfirmOpened}
        onClose={closeArchiveConfirm}
        title="Archive prompt template"
        size="sm"
      >
        <Stack gap="md">
          <Text size="sm">
            Archiving removes this template from active use — it will no longer be returned as the
            active prompt for {evidenceCategoryId}. Its version history is preserved and any version
            can be reactivated later.
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={closeArchiveConfirm} disabled={archiveMutation.isPending}>
              Cancel
            </Button>
            <Button
              color="red"
              loading={archiveMutation.isPending}
              onClick={() => {
                archiveMutation.mutate(templateId)
              }}
            >
              Yes, archive it
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  )
}
