import { mutationOptions, queryOptions } from '@tanstack/react-query'

import { apiClient } from './client'

export interface PromptTemplate {
  id: string
  promptName: string
  promptDescription: string | null
  trsDomainId: string
  evidenceCategoryId: string
  promptType: string
  status: string
  activeVersionId: string | null
  createdByUserId: string | null
  updatedByUserId: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface PromptVersion {
  id: string
  promptTemplateId: string
  versionNumber: number
  versionLabel: string
  promptContent: string
  outputFormat: string
  status: string
  isActive: boolean
  changeSummary: string | null
  createdByUserId: string | null
  createdAt: string
  activatedByUserId: string | null
  activatedAt: string | null
  archivedByUserId: string | null
  archivedAt: string | null
  deletedAt: string | null
}

export interface PromptTemplateWithActiveVersion extends PromptTemplate {
  activeVersion: PromptVersion | null
}

export interface CategoryPromptEntry {
  trsDomainId: string
  evidenceCategoryId: string
  template: PromptTemplateWithActiveVersion | null
}

export interface PromptTemplateDetail {
  template: PromptTemplate
  versions: PromptVersion[]
}

export interface ActivePromptResult {
  template: PromptTemplate
  activeVersion: PromptVersion
}

export interface CreateInitialPromptVersionRequest {
  promptContent: string
  versionLabel?: string | undefined
  outputFormat?: string | undefined
  changeSummary?: string | undefined
}

export interface CreatePromptTemplateRequest {
  promptName: string
  promptDescription?: string | undefined
  // Required for category-scoped templates; must be omitted for the Master Transformation
  // Readiness Report template (`promptType: 'master_transformation_readiness_report'`),
  // which has no TRS domain/evidence category — mirrors the backend DTO.
  trsDomainId?: string | undefined
  evidenceCategoryId?: string | undefined
  promptType: string
  initialVersion?: CreateInitialPromptVersionRequest | undefined
}

/** The one customer-level prompt type the server gives special handling — see
 *  `PROMPT_TYPES` in `driftwood-trs-server/src/ai-prompts/constants/prompt-type.ts`. */
export const MASTER_REPORT_PROMPT_TYPE = 'master_transformation_readiness_report'

export interface UpdatePromptTemplateRequest {
  promptName?: string | undefined
  promptDescription?: string | undefined
  promptType?: string | undefined
}

export interface CreatePromptVersionRequest {
  promptContent: string
  versionLabel?: string | undefined
  outputFormat?: string | undefined
  changeSummary?: string | undefined
}

export interface ListPromptTemplatesParams {
  trsDomainId?: string
  evidenceCategoryId?: string
}

const aiPromptsRoutes = {
  list: '/admin/ai-prompts',
  active: '/admin/ai-prompts/active',
  masterReport: '/admin/ai-prompts/master-report',
  template: (templateId: string) => `/admin/ai-prompts/${templateId}`,
  versions: (templateId: string) => `/admin/ai-prompts/${templateId}/versions`,
  version: (templateId: string, versionId: string) =>
    `/admin/ai-prompts/${templateId}/versions/${versionId}`,
  activateVersion: (templateId: string, versionId: string) =>
    `/admin/ai-prompts/${templateId}/versions/${versionId}/activate`,
  archiveTemplate: (templateId: string) => `/admin/ai-prompts/${templateId}/archive`,
} as const

const aiPromptsQueryKeys = {
  all: ['ai-prompts'] as const,
  list: (params: ListPromptTemplatesParams) => [...aiPromptsQueryKeys.all, 'list', params] as const,
  template: (templateId: string) => [...aiPromptsQueryKeys.all, 'template', templateId] as const,
  version: (templateId: string, versionId: string) =>
    [...aiPromptsQueryKeys.all, 'version', templateId, versionId] as const,
  active: (trsDomainId: string, evidenceCategoryId: string) =>
    [...aiPromptsQueryKeys.all, 'active', trsDomainId, evidenceCategoryId] as const,
  masterReport: () => [...aiPromptsQueryKeys.all, 'master-report'] as const,
}

const aiPromptsMutationKeys = {
  all: ['ai-prompts'] as const,
  createTemplate: () => [...aiPromptsMutationKeys.all, 'create-template'] as const,
  updateTemplate: () => [...aiPromptsMutationKeys.all, 'update-template'] as const,
  createVersion: () => [...aiPromptsMutationKeys.all, 'create-version'] as const,
  activateVersion: () => [...aiPromptsMutationKeys.all, 'activate-version'] as const,
  archiveTemplate: () => [...aiPromptsMutationKeys.all, 'archive-template'] as const,
}

const aiPromptsApi = {
  async listTemplates(
    params: ListPromptTemplatesParams,
  ): Promise<Record<string, CategoryPromptEntry[]>> {
    const response = await apiClient.get<Record<string, CategoryPromptEntry[]>>(
      aiPromptsRoutes.list,
      { params },
    )
    return response.data
  },

  async getTemplate(templateId: string): Promise<PromptTemplateDetail> {
    const response = await apiClient.get<PromptTemplateDetail>(
      aiPromptsRoutes.template(templateId),
    )
    return response.data
  },

  async getVersion(templateId: string, versionId: string): Promise<PromptVersion> {
    const response = await apiClient.get<PromptVersion>(
      aiPromptsRoutes.version(templateId, versionId),
    )
    return response.data
  },

  async getActivePrompt(trsDomainId: string, evidenceCategoryId: string): Promise<ActivePromptResult> {
    const response = await apiClient.get<ActivePromptResult>(aiPromptsRoutes.active, {
      params: { trsDomainId, evidenceCategoryId },
    })
    return response.data
  },

  /** `null` when the Master Report template has never been created (not an error). Backend
   *  wraps this in `{ detail }` — a controller returning bare `null` makes Nest send a
   *  completely empty response body instead of the JSON text "null", which axios can't
   *  reliably tell apart from "no body at all". */
  async getMasterReportPrompt(): Promise<PromptTemplateDetail | null> {
    const response = await apiClient.get<{ detail: PromptTemplateDetail | null }>(
      aiPromptsRoutes.masterReport,
    )
    return response.data.detail
  },

  async createTemplate(payload: CreatePromptTemplateRequest): Promise<PromptTemplateDetail> {
    const response = await apiClient.post<PromptTemplateDetail>(aiPromptsRoutes.list, payload)
    return response.data
  },

  async updateTemplate(
    templateId: string,
    payload: UpdatePromptTemplateRequest,
  ): Promise<PromptTemplate> {
    const response = await apiClient.put<PromptTemplate>(
      aiPromptsRoutes.template(templateId),
      payload,
    )
    return response.data
  },

  async createVersion(
    templateId: string,
    payload: CreatePromptVersionRequest,
  ): Promise<PromptVersion> {
    const response = await apiClient.post<PromptVersion>(
      aiPromptsRoutes.versions(templateId),
      payload,
    )
    return response.data
  },

  async activateVersion(templateId: string, versionId: string): Promise<PromptTemplateDetail> {
    const response = await apiClient.patch<PromptTemplateDetail>(
      aiPromptsRoutes.activateVersion(templateId, versionId),
    )
    return response.data
  },

  async archiveTemplate(templateId: string): Promise<PromptTemplate> {
    const response = await apiClient.patch<PromptTemplate>(
      aiPromptsRoutes.archiveTemplate(templateId),
    )
    return response.data
  },
}

const aiPromptsQueryOptions = {
  listTemplates: (params: ListPromptTemplatesParams) =>
    queryOptions({
      queryKey: aiPromptsQueryKeys.list(params),
      queryFn: () => aiPromptsApi.listTemplates(params),
    }),

  getTemplate: (templateId: string) =>
    queryOptions({
      queryKey: aiPromptsQueryKeys.template(templateId),
      queryFn: () => aiPromptsApi.getTemplate(templateId),
      enabled: templateId.length > 0,
    }),

  getVersion: (templateId: string, versionId: string) =>
    queryOptions({
      queryKey: aiPromptsQueryKeys.version(templateId, versionId),
      queryFn: () => aiPromptsApi.getVersion(templateId, versionId),
      enabled: templateId.length > 0 && versionId.length > 0,
      staleTime: Infinity,
    }),

  masterReportPrompt: () =>
    queryOptions({
      queryKey: aiPromptsQueryKeys.masterReport(),
      queryFn: () => aiPromptsApi.getMasterReportPrompt(),
    }),
}

const aiPromptsMutationOptions = {
  createTemplate: () =>
    mutationOptions({
      mutationKey: aiPromptsMutationKeys.createTemplate(),
      mutationFn: (payload: CreatePromptTemplateRequest) => aiPromptsApi.createTemplate(payload),
    }),

  updateTemplate: () =>
    mutationOptions({
      mutationKey: aiPromptsMutationKeys.updateTemplate(),
      mutationFn: ({
        templateId,
        payload,
      }: {
        templateId: string
        payload: UpdatePromptTemplateRequest
      }) => aiPromptsApi.updateTemplate(templateId, payload),
    }),

  createVersion: () =>
    mutationOptions({
      mutationKey: aiPromptsMutationKeys.createVersion(),
      mutationFn: ({
        templateId,
        payload,
      }: {
        templateId: string
        payload: CreatePromptVersionRequest
      }) => aiPromptsApi.createVersion(templateId, payload),
    }),

  activateVersion: () =>
    mutationOptions({
      mutationKey: aiPromptsMutationKeys.activateVersion(),
      mutationFn: ({ templateId, versionId }: { templateId: string; versionId: string }) =>
        aiPromptsApi.activateVersion(templateId, versionId),
    }),

  archiveTemplate: () =>
    mutationOptions({
      mutationKey: aiPromptsMutationKeys.archiveTemplate(),
      mutationFn: (templateId: string) => aiPromptsApi.archiveTemplate(templateId),
    }),
}

export {
  aiPromptsApi,
  aiPromptsMutationKeys,
  aiPromptsMutationOptions,
  aiPromptsQueryKeys,
  aiPromptsQueryOptions,
  aiPromptsRoutes,
}
