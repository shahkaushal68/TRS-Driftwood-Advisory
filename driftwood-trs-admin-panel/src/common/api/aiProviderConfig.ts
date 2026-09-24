import { mutationOptions, queryOptions } from '@tanstack/react-query'

import { apiClient } from './client'

export type AiProviderGateway = 'openrouter' | 'openai' | 'azure-openai' | 'anthropic' | 'custom'

export const AI_PROVIDER_GATEWAY_LABELS: Record<AiProviderGateway, string> = {
  openrouter: 'OpenRouter',
  openai: 'OpenAI',
  'azure-openai': 'Azure OpenAI',
  anthropic: 'Anthropic',
  custom: 'Custom',
}

export interface AiProviderConfig {
  id: string
  provider: AiProviderGateway
  apiBaseUrl: string
  defaultModel: string
  timeoutSeconds: number
  maxTokens: number
  enabled: boolean
  hasApiKey: boolean
  updatedAt: string
}

export interface SaveAiProviderConfigRequest {
  provider: AiProviderGateway
  apiBaseUrl: string
  defaultModel: string
  timeoutSeconds: number
  maxTokens: number
  enabled: boolean
  /** Omit to keep the previously saved key. */
  apiKey?: string
}

export interface SaveAiProviderConfigVariables {
  /** Present when updating the existing configuration; absent when creating the first one. */
  id?: string
  payload: SaveAiProviderConfigRequest
}

export interface TestAiProviderConnectionResult {
  success: boolean
  message: string
}

/** Server response shape — richer than the UI needs; mapped down via `toAiProviderConfig`. */
interface AiProviderConfigurationResponse {
  id: string
  providerName: string
  providerType: string
  gatewayType: string | null
  baseUrl: string
  defaultModel: string
  timeoutSeconds: number
  maxTokens: number
  isActive: boolean
  hasApiKey: boolean
  updatedAt: string
}

const aiProviderConfigRoutes = {
  list: '/admin/ai-provider-configurations',
  detail: (id: string) => `/admin/ai-provider-configurations/${id}`,
  testConnection: (id: string) => `/admin/ai-provider-configurations/${id}/test-connection`,
} as const

const aiProviderConfigQueryKeys = {
  all: ['ai-provider-config'] as const,
  detail: () => [...aiProviderConfigQueryKeys.all, 'detail'] as const,
}

const aiProviderConfigMutationKeys = {
  all: ['ai-provider-config'] as const,
  save: () => [...aiProviderConfigMutationKeys.all, 'save'] as const,
  testConnection: () => [...aiProviderConfigMutationKeys.all, 'test-connection'] as const,
}

const isAiProviderGateway = (value: string): value is AiProviderGateway =>
  Object.hasOwn(AI_PROVIDER_GATEWAY_LABELS, value)

const toAiProviderConfig = (row: AiProviderConfigurationResponse): AiProviderConfig => {
  const gateway = row.gatewayType ?? row.providerType
  return {
    id: row.id,
    provider: isAiProviderGateway(gateway) ? gateway : 'custom',
    apiBaseUrl: row.baseUrl,
    defaultModel: row.defaultModel,
    timeoutSeconds: row.timeoutSeconds,
    maxTokens: row.maxTokens,
    enabled: row.isActive,
    hasApiKey: row.hasApiKey,
    updatedAt: row.updatedAt,
  }
}

/**
 * The backend supports multiple named fields (providerName, environment, responseFormat, ...)
 * that this POC's UI doesn't expose. Fixed defaults below satisfy validation without adding
 * form fields the client didn't ask for — only OpenRouter is supported for now.
 */
const toBackendPayload = (payload: SaveAiProviderConfigRequest) => ({
  providerName: AI_PROVIDER_GATEWAY_LABELS[payload.provider],
  providerType: payload.provider,
  gatewayType: payload.provider,
  baseUrl: payload.apiBaseUrl,
  defaultModel: payload.defaultModel,
  environment: 'production',
  responseFormat: 'json',
  timeoutSeconds: payload.timeoutSeconds,
  maxTokens: payload.maxTokens,
  isActive: payload.enabled,
  ...(payload.apiKey ? { apiKey: payload.apiKey } : {}),
})

const aiProviderConfigApi = {
  async get(): Promise<AiProviderConfig | null> {
    const response = await apiClient.get<AiProviderConfigurationResponse[]>(
      aiProviderConfigRoutes.list,
    )
    const [current] = response.data
    return current === undefined ? null : toAiProviderConfig(current)
  },

  async save({ id, payload }: SaveAiProviderConfigVariables): Promise<AiProviderConfig> {
    const body = toBackendPayload(payload)

    if (id === undefined) {
      if (payload.apiKey === undefined || payload.apiKey.length === 0) {
        throw new Error('An API key is required to create a configuration')
      }
      const response = await apiClient.post<AiProviderConfigurationResponse>(
        aiProviderConfigRoutes.list,
        body,
      )
      return toAiProviderConfig(response.data)
    }

    const response = await apiClient.put<AiProviderConfigurationResponse>(
      aiProviderConfigRoutes.detail(id),
      body,
    )
    return toAiProviderConfig(response.data)
  },

  async testConnection(id: string): Promise<TestAiProviderConnectionResult> {
    const response = await apiClient.post<{ connectionStatus: string; message: string }>(
      aiProviderConfigRoutes.testConnection(id),
    )
    return {
      success: response.data.connectionStatus === 'connected',
      message: response.data.message,
    }
  },
}

const aiProviderConfigQueryOptions = {
  detail: () =>
    queryOptions({
      queryKey: aiProviderConfigQueryKeys.detail(),
      queryFn: () => aiProviderConfigApi.get(),
    }),
}

const aiProviderConfigMutationOptions = {
  save: () =>
    mutationOptions({
      mutationKey: aiProviderConfigMutationKeys.save(),
      mutationFn: (variables: SaveAiProviderConfigVariables) => aiProviderConfigApi.save(variables),
    }),

  testConnection: () =>
    mutationOptions({
      mutationKey: aiProviderConfigMutationKeys.testConnection(),
      mutationFn: (id: string) => aiProviderConfigApi.testConnection(id),
    }),
}

export {
  aiProviderConfigApi,
  aiProviderConfigMutationKeys,
  aiProviderConfigMutationOptions,
  aiProviderConfigQueryKeys,
  aiProviderConfigQueryOptions,
  aiProviderConfigRoutes,
}
