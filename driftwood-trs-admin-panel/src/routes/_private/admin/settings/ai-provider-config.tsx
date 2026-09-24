import { Alert, LoadingOverlay, Paper, Stack, Text, Title } from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

import {
  aiProviderConfigMutationOptions,
  aiProviderConfigQueryKeys,
  aiProviderConfigQueryOptions,
} from '../../../../common/api/aiProviderConfig'
import { getApiErrorMessage } from '../../../../common/api/client'
import { requireRole } from '../../../../common/auth/roles'
import { AiProviderConfigForm } from '../../../../features/ai-provider-config/components/AiProviderConfigForm'

export const Route = createFileRoute('/_private/admin/settings/ai-provider-config')({
  beforeLoad: () => {
    requireRole(['admin'])
  },
  component: AiProviderConfigPage,
})

function AiProviderConfigPage() {
  const queryClient = useQueryClient()
  const configQuery = useQuery(aiProviderConfigQueryOptions.detail())

  const saveMutation = useMutation({
    ...aiProviderConfigMutationOptions.save(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: aiProviderConfigQueryKeys.all })
    },
  })

  const testConnectionMutation = useMutation(aiProviderConfigMutationOptions.testConnection())

  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>AI Provider Configuration</Title>
        <Text c="dimmed">
          Configure the AI provider gateway connection used for AI-assisted reviews.
        </Text>
      </div>

      {configQuery.isError ? (
        <Alert color="red" title="Unable to load configuration">
          {getApiErrorMessage(configQuery.error)}
        </Alert>
      ) : null}

      {configQuery.isSuccess && configQuery.data === null ? (
        <Alert color="blue" title="No AI provider configured">
          No AI provider is configured yet. Fill in the fields below and save to activate one.
        </Alert>
      ) : null}

      <Paper radius="sm" p="lg" withBorder pos="relative" maw={560}>
        <LoadingOverlay visible={configQuery.isPending} />

        {configQuery.isPending ? null : (
          <AiProviderConfigForm
            key={configQuery.data?.updatedAt ?? 'new'}
            hasApiKey={configQuery.data?.hasApiKey ?? false}
            initialConfig={configQuery.data ?? null}
            isSubmitting={saveMutation.isPending}
            isTesting={testConnectionMutation.isPending}
            saveError={saveMutation.isError ? saveMutation.error : null}
            testError={testConnectionMutation.isError ? testConnectionMutation.error : null}
            testResult={testConnectionMutation.data}
            onSave={(values) => {
              const id = configQuery.data?.id
              saveMutation.mutate(id === undefined ? { payload: values } : { id, payload: values })
            }}
            onTestConnection={() => {
              if (configQuery.data?.id !== undefined) {
                testConnectionMutation.mutate(configQuery.data.id)
              }
            }}
          />
        )}
      </Paper>
    </Stack>
  )
}
