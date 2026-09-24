import {
  Alert,
  Button,
  Group,
  NumberInput,
  PasswordInput,
  Select,
  Stack,
  Switch,
  TextInput,
  Tooltip,
} from '@mantine/core'
import { useState } from 'react'
import type { SubmitEventHandler } from 'react'

import {
  AI_PROVIDER_GATEWAY_LABELS,
  type AiProviderConfig,
  type AiProviderGateway,
  type SaveAiProviderConfigRequest,
  type TestAiProviderConnectionResult,
} from '../../../common/api/aiProviderConfig'
import { getApiErrorMessage } from '../../../common/api/client'

const providerOptions = (
  Object.entries(AI_PROVIDER_GATEWAY_LABELS) as [AiProviderGateway, string][]
).map(([value, label]) => ({ value, label }))

interface AiProviderConfigFormValues {
  provider: AiProviderGateway
  apiBaseUrl: string
  apiKey: string
  defaultModel: string
  timeoutSeconds: number | ''
  maxTokens: number | ''
  enabled: boolean
}

type AiProviderConfigFormErrors = Partial<Record<keyof AiProviderConfigFormValues, string>>

const getDefaultValues = (config: AiProviderConfig | null): AiProviderConfigFormValues => ({
  provider: config?.provider ?? 'openrouter',
  apiBaseUrl: config?.apiBaseUrl ?? '',
  apiKey: '',
  defaultModel: config?.defaultModel ?? '',
  timeoutSeconds: config?.timeoutSeconds ?? 60,
  maxTokens: config?.maxTokens ?? 4000,
  enabled: config?.enabled ?? false,
})

const isValidUrl = (value: string) => {
  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}

interface AiProviderConfigFormProps {
  hasApiKey: boolean
  initialConfig: AiProviderConfig | null
  isSubmitting: boolean
  isTesting: boolean
  saveError?: unknown
  testError?: unknown
  testResult?: TestAiProviderConnectionResult | undefined
  onSave: (values: SaveAiProviderConfigRequest) => void
  onTestConnection: () => void
}

function AiProviderConfigForm({
  hasApiKey,
  initialConfig,
  isSubmitting,
  isTesting,
  saveError,
  testError,
  testResult,
  onSave,
  onTestConnection,
}: AiProviderConfigFormProps) {
  const [values, setValues] = useState<AiProviderConfigFormValues>(() =>
    getDefaultValues(initialConfig),
  )
  const [errors, setErrors] = useState<AiProviderConfigFormErrors>({})

  const validate = (nextValues: AiProviderConfigFormValues) => {
    const nextErrors: AiProviderConfigFormErrors = {}

    if (nextValues.apiBaseUrl.trim().length === 0) {
      nextErrors.apiBaseUrl = 'API base URL is required'
    } else if (!isValidUrl(nextValues.apiBaseUrl.trim())) {
      nextErrors.apiBaseUrl = 'Enter a valid URL, e.g. https://api.example.com/v1'
    }

    if (!hasApiKey && nextValues.apiKey.trim().length === 0) {
      nextErrors.apiKey = 'An API key is required'
    }

    if (nextValues.defaultModel.trim().length === 0) {
      nextErrors.defaultModel = 'Default model is required'
    }

    if (nextValues.timeoutSeconds === '' || nextValues.timeoutSeconds <= 0) {
      nextErrors.timeoutSeconds = 'Timeout must be greater than 0 seconds'
    }

    if (nextValues.maxTokens === '' || nextValues.maxTokens <= 0) {
      nextErrors.maxTokens = 'Max tokens must be greater than 0'
    }

    setErrors(nextErrors)

    return Object.keys(nextErrors).length === 0
  }

  const handleValidSubmit = () => {
    if (!validate(values)) {
      return
    }

    const payload: SaveAiProviderConfigRequest = {
      provider: values.provider,
      apiBaseUrl: values.apiBaseUrl.trim(),
      defaultModel: values.defaultModel.trim(),
      timeoutSeconds: values.timeoutSeconds as number,
      maxTokens: values.maxTokens as number,
      enabled: values.enabled,
    }

    if (values.apiKey.trim().length > 0) {
      payload.apiKey = values.apiKey.trim()
    }

    onSave(payload)
  }

  const onFormSubmit: SubmitEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault()
    handleValidSubmit()
  }

  return (
    <form onSubmit={onFormSubmit} noValidate>
      <Stack maw={520}>
        {saveError === undefined || saveError === null ? null : (
          <Alert color="red" title="Unable to save configuration">
            {getApiErrorMessage(saveError)}
          </Alert>
        )}

        {testError === undefined || testError === null ? (
          testResult === undefined ? null : (
            <Alert
              color={testResult.success ? 'green' : 'red'}
              title={testResult.success ? 'Connection successful' : 'Connection failed'}
            >
              {testResult.message}
            </Alert>
          )
        ) : (
          <Alert color="red" title="Unable to test connection">
            {getApiErrorMessage(testError)}
          </Alert>
        )}

        <Select
          label="AI Provider Gateway"
          withAsterisk
          data={providerOptions}
          allowDeselect={false}
          value={values.provider}
          onChange={(provider) => {
            if (provider !== null) {
              setValues((currentValues) => ({ ...currentValues, provider }))
            }
          }}
        />

        <TextInput
          label="API Base URL"
          placeholder="https://api.example.com/v1"
          withAsterisk
          value={values.apiBaseUrl}
          onChange={(event) => {
            const apiBaseUrl = event.currentTarget.value

            setValues((currentValues) => ({ ...currentValues, apiBaseUrl }))
          }}
          error={errors.apiBaseUrl}
        />

        <PasswordInput
          label="API Key"
          description={hasApiKey ? 'A key is currently saved.' : 'No key is currently saved.'}
          placeholder={hasApiKey ? 'Leave blank to keep the saved key' : 'Enter an API key'}
          withAsterisk={!hasApiKey}
          value={values.apiKey}
          onChange={(event) => {
            const apiKey = event.currentTarget.value

            setValues((currentValues) => ({ ...currentValues, apiKey }))
          }}
          error={errors.apiKey}
          visibilityToggleButtonProps={{ 'aria-label': 'Toggle API key visibility' }}
          autoComplete="off"
        />

        <TextInput
          label="Default Model"
          placeholder="gpt-4o"
          withAsterisk
          value={values.defaultModel}
          onChange={(event) => {
            const defaultModel = event.currentTarget.value

            setValues((currentValues) => ({ ...currentValues, defaultModel }))
          }}
          error={errors.defaultModel}
        />

        <NumberInput
          label="Timeout (seconds)"
          withAsterisk
          min={1}
          value={values.timeoutSeconds}
          onChange={(value) => {
            setValues((currentValues) => ({
              ...currentValues,
              timeoutSeconds: typeof value === 'number' ? value : '',
            }))
          }}
          error={errors.timeoutSeconds}
        />

        <NumberInput
          label="Max Tokens"
          withAsterisk
          min={1}
          value={values.maxTokens}
          onChange={(value) => {
            setValues((currentValues) => ({
              ...currentValues,
              maxTokens: typeof value === 'number' ? value : '',
            }))
          }}
          error={errors.maxTokens}
        />

        <Switch
          label="Enable"
          description="Use this configuration for AI-assisted reviews."
          checked={values.enabled}
          onChange={(event) => {
            const enabled = event.currentTarget.checked

            setValues((currentValues) => ({ ...currentValues, enabled }))
          }}
        />

        <Group justify="space-between">
          <Tooltip
            label="Save a configuration before testing the connection"
            disabled={initialConfig !== null}
          >
            <Button
              variant="default"
              onClick={onTestConnection}
              loading={isTesting}
              disabled={isSubmitting || initialConfig === null}
            >
              Test Connection
            </Button>
          </Tooltip>

          <Button type="submit" loading={isSubmitting}>
            Save
          </Button>
        </Group>
      </Stack>
    </form>
  )
}

export { AiProviderConfigForm }
export type { AiProviderConfigFormValues }
