import MDEditor from '@uiw/react-md-editor'
import '@uiw/react-md-editor/markdown-editor.css'
import {
  Alert,
  Badge,
  Button,
  Divider,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import {
  aiPromptsMutationOptions,
  aiPromptsQueryKeys,
  MASTER_REPORT_PROMPT_TYPE,
  type PromptTemplateDetail,
  type PromptVersion,
} from '../../../common/api/aiPrompts'
import { getApiErrorMessage } from '../../../common/api/client'

interface MasterReportPromptModalProps {
  /** `null` means the template has never been created — renders the create form instead of
   *  the version manager. */
  detail: PromptTemplateDetail | null
  opened: boolean
  onClose: () => void
}

const DEFAULT_PROMPT_CONTENT =
  'You are preparing an Executive Transformation Readiness Report for a customer, based on a ' +
  'set of already-completed evidence category reviews (each covering a TRS domain, evidence ' +
  'category, executive summary, readiness findings, evidence gaps, and recommended analyst ' +
  'action). Consolidate them into one cohesive, well-structured Markdown report for executive ' +
  'stakeholders: an overall readiness narrative, key strengths, key risks/gaps, and recommended ' +
  'next steps. Do not fabricate findings not present in the source reviews.'

/**
 * Create/manage screen for the single Master Transformation Readiness Report prompt template
 * — the customer-level prompt the Executive Report generation flow requires (see
 * `AiPromptsService.getActiveMasterReportPrompt` on the backend). Deliberately a separate,
 * smaller component from `PromptEditorModal` rather than a generalization of it: this
 * template has no TRS domain/evidence category, always has exactly one template in existence,
 * and the create flow doesn't need the domain/category fields that component assumes.
 */
function MasterReportPromptModal({ detail, opened, onClose }: MasterReportPromptModalProps) {
  if (detail === null) {
    return <CreateMasterReportPromptForm opened={opened} onClose={onClose} />
  }
  return <ManageMasterReportPromptForm detail={detail} opened={opened} onClose={onClose} />
}

function CreateMasterReportPromptForm({
  opened,
  onClose,
}: {
  opened: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [promptName, setPromptName] = useState('Master Transformation Readiness Report')
  const [content, setContent] = useState(DEFAULT_PROMPT_CONTENT)

  const createMutation = useMutation({
    ...aiPromptsMutationOptions.createTemplate(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: aiPromptsQueryKeys.all })
      onClose()
    },
  })

  return (
    <Modal opened={opened} onClose={onClose} title="Create Master Report Prompt" size="xl">
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          This is the single prompt used to generate every customer&apos;s Executive
          Transformation Readiness Report — it is not scoped to a TRS domain or evidence
          category.
        </Text>

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
        </Stack>

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={createMutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              createMutation.mutate({
                promptName,
                promptType: MASTER_REPORT_PROMPT_TYPE,
                initialVersion: content.trim().length > 0 ? { promptContent: content } : undefined,
              })
            }}
            loading={createMutation.isPending}
            disabled={promptName.trim().length === 0 || content.trim().length === 0}
          >
            Create Prompt Template
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

function ManageMasterReportPromptForm({
  detail,
  opened,
  onClose,
}: {
  detail: PromptTemplateDetail
  opened: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const { template, versions } = detail
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  const [editedContent, setEditedContent] = useState<string | null>(null)

  const activeVersion = versions.find((v) => v.isActive) ?? null
  const currentVersionId = selectedVersionId ?? activeVersion?.id ?? versions[0]?.id ?? null
  const selectedVersion = versions.find((v) => v.id === currentVersionId) ?? null
  const content = editedContent ?? selectedVersion?.promptContent ?? ''

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: aiPromptsQueryKeys.all })
  }

  const createVersionMutation = useMutation({
    ...aiPromptsMutationOptions.createVersion(),
    onSuccess: (version) => {
      invalidate()
      setSelectedVersionId(version.id)
      setEditedContent(null)
    },
  })

  const activateVersionMutation = useMutation({
    ...aiPromptsMutationOptions.activateVersion(),
    onSuccess: () => {
      invalidate()
    },
  })

  const versionOptions = versions.map((v: PromptVersion) => ({
    value: v.id,
    label: `${v.versionLabel}${v.isActive ? ' (active)' : ''} — ${new Date(v.createdAt).toLocaleString()}`,
  }))

  const hasUnsavedEdits = editedContent !== null && editedContent !== selectedVersion?.promptContent

  return (
    <Modal opened={opened} onClose={onClose} title="Master Report Prompt" size="xl">
      <Stack gap="md">
        <Group gap="sm">
          <Badge color={activeVersion ? 'green' : 'gray'} variant="light">
            {activeVersion ? 'Active' : 'No Active Version'}
          </Badge>
          <Text size="sm" c="dimmed">
            {template.promptName}
          </Text>
        </Group>

        {(createVersionMutation.isError || activateVersionMutation.isError) && (
          <Alert color="red" title="Something went wrong">
            {getApiErrorMessage(createVersionMutation.error ?? activateVersionMutation.error)}
          </Alert>
        )}

        {!activeVersion ? (
          <Alert color="yellow" variant="light">
            No version is active yet — the Executive Report cannot be generated for any customer
            until one is. Activate a version below.
          </Alert>
        ) : null}

        {versionOptions.length > 0 ? (
          <Select
            label="Version history"
            data={versionOptions}
            value={currentVersionId}
            onChange={(versionId) => {
              if (versionId === null) return
              setSelectedVersionId(versionId)
              setEditedContent(null)
            }}
          />
        ) : null}

        <div data-color-mode="light">
          <MDEditor
            value={content}
            onChange={(val) => {
              setEditedContent(val ?? '')
            }}
            height={350}
          />
        </div>

        <Divider />

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
                activateVersionMutation.mutate({ templateId: template.id, versionId: selectedVersion.id })
              }}
            >
              Activate {selectedVersion.versionLabel}
            </Button>
          ) : null}
          <Button
            onClick={() => {
              createVersionMutation.mutate({ templateId: template.id, payload: { promptContent: content } })
            }}
            loading={createVersionMutation.isPending}
            disabled={!hasUnsavedEdits || content.trim().length === 0}
          >
            Save as new version
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

export { MasterReportPromptModal }
