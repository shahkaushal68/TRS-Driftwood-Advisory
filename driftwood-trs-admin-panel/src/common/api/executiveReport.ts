import { mutationOptions, queryOptions } from '@tanstack/react-query'
import axiosInstance from 'axios'

import { apiClient, isNotFoundError } from './client'

/**
 * Mirrors the backend's eligibility response shape exactly
 * (`ExecutiveReportEligibilityResult` in
 * `driftwood-trs-server/src/executive-report/executive-report.service.ts`) — categories are
 * plain evidence-category display strings straight from the backend, never hard-coded here.
 */
export interface ExecutiveReportEligibility {
  customerId: string
  eligible: boolean
  status: string
  requiredCategories: number
  approvedCategories: number
  missingCategories: string[]
  pendingCategories: string[]
  reason: string
}

/**
 * Mirrors the `executive_report` row shape returned by the backend
 * (`ExecutiveReportRow` / `driftwood-trs-server/src/db/schema/executive-report.ts`).
 */
export interface ExecutiveReport {
  id: string
  customerId: string
  assessmentId: string
  reportVersion: number
  reportStatus: string
  masterPromptId: string | null
  masterPromptVersionId: string | null
  provider: string | null
  model: string | null
  generatedReportMarkdown: string | null
  sourceReviewIds: string[] | null
  generatedByUserId: string | null
  generatedAt: string | null
  approvedByUserId: string | null
  approvedAt: string | null
  publishedByUserId: string | null
  publishedAt: string | null
  lastUpdatedByUserId: string | null
  lastUpdatedAt: string | null
  generationErrorMessage: string | null
  createdAt: string
  updatedAt: string
}

/** Suggested statuses per the ticket — the backend is the source of truth, this is only a
 *  display convenience. Always fall back to the raw value (`?? status`) for anything else it
 *  returns. */
export const EXECUTIVE_REPORT_STATUS_LABELS: Record<string, string> = {
  not_ready: 'Not Ready',
  ready_to_generate: 'Ready to Generate',
  generating: 'Generating',
  draft: 'Draft / Internal Review Required',
  under_review: 'Under Review',
  approved: 'Approved',
  published: 'Published',
  generation_failed: 'Generation Failed',
  needs_regeneration: 'Needs Regeneration',
}

export const EXECUTIVE_REPORT_STATUS_COLORS: Record<string, string> = {
  not_ready: 'gray',
  ready_to_generate: 'blue',
  generating: 'blue',
  draft: 'yellow',
  under_review: 'blue',
  approved: 'teal',
  published: 'green',
  generation_failed: 'red',
  needs_regeneration: 'orange',
}

/** Statuses the backend allows downloading a PDF for — mirrors
 *  `DOWNLOADABLE_STATUSES` in `driftwood-trs-server/src/executive-report/executive-report.service.ts`.
 *  A frontend check here is only a UX nicety (disabling the button); the backend enforces
 *  this regardless of what the button does. */
export const DOWNLOADABLE_REPORT_STATUSES: readonly string[] = ['draft', 'approved', 'published']

/** The End User's own published report — mirrors `EndUserExecutiveReportResult` in
 *  `driftwood-trs-server/src/executive-report/executive-report.service.ts`. Deliberately a
 *  narrow, separate shape from `ExecutiveReport` — no prompt ids, no source review ids, no
 *  provider/model, no internal audit fields. */
export interface EndUserExecutiveReport {
  customerId: string
  reportStatus: string
  reportVersion: number
  publishedAt: string | null
  publishedBy: string | null
  reportMarkdown: string | null
}

/** A downloaded PDF, plus the filename the backend actually chose for it (parsed from
 *  `Content-Disposition`) — always prefer this over inventing a filename client-side. */
export interface DownloadedPdf {
  blob: Blob
  filename: string
}

const FALLBACK_PDF_FILENAME = 'TRS_MasterTransformationReadinessReport.pdf'

function extractFilename(contentDisposition: unknown): string {
  if (typeof contentDisposition !== 'string') return FALLBACK_PDF_FILENAME
  const match = /filename="?([^";]+)"?/i.exec(contentDisposition)
  return match?.[1] ?? FALLBACK_PDF_FILENAME
}

/**
 * With `responseType: 'blob'`, axios never parses an error response body as JSON — it stays
 * a `Blob`, so `getApiErrorMessage`'s usual `error.response.data.message` lookup finds
 * nothing useful (e.g. "Report cannot be downloaded in its current status" would otherwise
 * be lost, surfacing only a generic "Request failed with status code 409"). This re-reads a
 * failed blob response as text/JSON and rethrows a plain `Error` carrying the real backend
 * message, which `getApiErrorMessage`'s fallback path does know how to show.
 */
async function rethrowWithReadableMessage(error: unknown): Promise<never> {
  if (axiosInstance.isAxiosError(error) && error.response?.data instanceof Blob) {
    try {
      const text = await error.response.data.text()
      const parsed: unknown = JSON.parse(text)
      const message =
        typeof parsed === 'object' && parsed !== null && 'message' in parsed
          ? (parsed as { message?: unknown }).message
          : undefined
      if (typeof message === 'string' && message.length > 0) {
        throw new Error(message)
      }
    } catch {
      // Body wasn't readable/JSON — fall through to rethrowing the original error below.
    }
  }
  throw error
}

const executiveReportRoutes = {
  eligibility: (customerId: string) => `/customers/${customerId}/executive-report/eligibility`,
  generate: (customerId: string) => `/customers/${customerId}/executive-report/generate`,
  latest: (customerId: string) => `/customers/${customerId}/executive-report`,
  update: (customerId: string, reportId: string) =>
    `/customers/${customerId}/executive-report/${reportId}`,
  approve: (customerId: string, reportId: string) =>
    `/customers/${customerId}/executive-report/${reportId}/approve`,
  publish: (customerId: string, reportId: string) =>
    `/customers/${customerId}/executive-report/${reportId}/publish`,
  downloadPdf: (customerId: string, reportId: string) =>
    `/customers/${customerId}/executive-report/${reportId}/download-pdf`,
  endUserLatest: '/end-user/executive-report',
  endUserDownloadPdf: '/end-user/executive-report/download-pdf',
} as const

const executiveReportQueryKeys = {
  all: ['executive-report'] as const,
  eligibility: (customerId: string) =>
    [...executiveReportQueryKeys.all, 'eligibility', customerId] as const,
  latest: (customerId: string) => [...executiveReportQueryKeys.all, 'latest', customerId] as const,
  endUserLatest: () => [...executiveReportQueryKeys.all, 'end-user-latest'] as const,
}

const executiveReportMutationKeys = {
  all: ['executive-report'] as const,
  generate: (customerId: string) =>
    [...executiveReportMutationKeys.all, 'generate', customerId] as const,
  update: (customerId: string, reportId: string) =>
    [...executiveReportMutationKeys.all, 'update', customerId, reportId] as const,
  approve: (customerId: string, reportId: string) =>
    [...executiveReportMutationKeys.all, 'approve', customerId, reportId] as const,
  publish: (customerId: string, reportId: string) =>
    [...executiveReportMutationKeys.all, 'publish', customerId, reportId] as const,
  downloadPdf: (customerId: string, reportId: string) =>
    [...executiveReportMutationKeys.all, 'download-pdf', customerId, reportId] as const,
  endUserDownloadPdf: () => [...executiveReportMutationKeys.all, 'end-user-download-pdf'] as const,
}

const executiveReportApi = {
  async getEligibility(customerId: string): Promise<ExecutiveReportEligibility> {
    const response = await apiClient.get<ExecutiveReportEligibility>(
      executiveReportRoutes.eligibility(customerId),
    )
    return response.data
  },

  async generate(customerId: string): Promise<ExecutiveReport> {
    const response = await apiClient.post<ExecutiveReport>(
      executiveReportRoutes.generate(customerId),
    )
    return response.data
  },

  /** `null` when no Executive Report has ever been generated for this customer — an expected
   *  empty state, not an error (mirrors the backend's own `getLatestReport` contract).
   *  Backend wraps this in `{ report }` — a controller returning bare `null` makes Nest send
   *  a completely empty response body instead of the JSON text "null", which axios can't
   *  reliably tell apart from "no body at all". */
  async getLatest(customerId: string): Promise<ExecutiveReport | null> {
    const response = await apiClient.get<{ report: ExecutiveReport | null }>(
      executiveReportRoutes.latest(customerId),
    )
    return response.data.report
  },

  /** Saves edits to a draft report's markdown content. Only permitted while the report is
   *  still `draft` — the backend rejects any other status with 409 (see
   *  `ExecutiveReportService.updateReport`). */
  async update(
    customerId: string,
    reportId: string,
    generatedReportMarkdown: string,
  ): Promise<ExecutiveReport> {
    const response = await apiClient.patch<ExecutiveReport>(
      executiveReportRoutes.update(customerId, reportId),
      { generatedReportMarkdown },
    )
    return response.data
  },

  /** Draft -> Approved. Does not publish it — see `publish` below. */
  async approve(customerId: string, reportId: string): Promise<ExecutiveReport> {
    const response = await apiClient.post<ExecutiveReport>(
      executiveReportRoutes.approve(customerId, reportId),
    )
    return response.data
  },

  /** Approved -> Published. Only an already-approved report can be published — the backend
   *  rejects any other status with 409 (see `ExecutiveReportService.publishReport`). */
  async publish(customerId: string, reportId: string): Promise<ExecutiveReport> {
    const response = await apiClient.post<ExecutiveReport>(
      executiveReportRoutes.publish(customerId, reportId),
    )
    return response.data
  },

  /** Renders on demand server-side from the already-stored report content — never
   *  regenerates anything, never calls OpenRouter. */
  async downloadPdf(customerId: string, reportId: string): Promise<DownloadedPdf> {
    try {
      const response = await apiClient.get<Blob>(
        executiveReportRoutes.downloadPdf(customerId, reportId),
        { responseType: 'blob' },
      )
      return {
        blob: response.data,
        filename: extractFilename(response.headers['content-disposition']),
      }
    } catch (error) {
      return rethrowWithReadableMessage(error)
    }
  },

  /** `null` when the End User's customer has no published report yet — an expected empty
   *  state (404 from the backend), not an error. */
  async getEndUserLatest(): Promise<EndUserExecutiveReport | null> {
    try {
      const response = await apiClient.get<EndUserExecutiveReport>(
        executiveReportRoutes.endUserLatest,
      )
      return response.data
    } catch (error) {
      if (isNotFoundError(error)) return null
      throw error
    }
  },

  async downloadEndUserPdf(): Promise<DownloadedPdf> {
    try {
      const response = await apiClient.get<Blob>(executiveReportRoutes.endUserDownloadPdf, {
        responseType: 'blob',
      })
      return {
        blob: response.data,
        filename: extractFilename(response.headers['content-disposition']),
      }
    } catch (error) {
      return rethrowWithReadableMessage(error)
    }
  },
}

const executiveReportQueryOptions = {
  eligibility: (customerId: string) =>
    queryOptions({
      queryKey: executiveReportQueryKeys.eligibility(customerId),
      queryFn: () => executiveReportApi.getEligibility(customerId),
      enabled: customerId.length > 0,
    }),

  latest: (customerId: string) =>
    queryOptions({
      queryKey: executiveReportQueryKeys.latest(customerId),
      queryFn: () => executiveReportApi.getLatest(customerId),
      enabled: customerId.length > 0,
    }),

  endUserLatest: () =>
    queryOptions({
      queryKey: executiveReportQueryKeys.endUserLatest(),
      queryFn: () => executiveReportApi.getEndUserLatest(),
    }),
}

const executiveReportMutationOptions = {
  generate: (customerId: string) =>
    mutationOptions({
      mutationKey: executiveReportMutationKeys.generate(customerId),
      mutationFn: () => executiveReportApi.generate(customerId),
    }),

  update: (customerId: string, reportId: string) =>
    mutationOptions({
      mutationKey: executiveReportMutationKeys.update(customerId, reportId),
      mutationFn: (generatedReportMarkdown: string) =>
        executiveReportApi.update(customerId, reportId, generatedReportMarkdown),
    }),

  approve: (customerId: string, reportId: string) =>
    mutationOptions({
      mutationKey: executiveReportMutationKeys.approve(customerId, reportId),
      mutationFn: () => executiveReportApi.approve(customerId, reportId),
    }),

  publish: (customerId: string, reportId: string) =>
    mutationOptions({
      mutationKey: executiveReportMutationKeys.publish(customerId, reportId),
      mutationFn: () => executiveReportApi.publish(customerId, reportId),
    }),

  downloadPdf: (customerId: string, reportId: string) =>
    mutationOptions({
      mutationKey: executiveReportMutationKeys.downloadPdf(customerId, reportId),
      mutationFn: () => executiveReportApi.downloadPdf(customerId, reportId),
    }),

  endUserDownloadPdf: () =>
    mutationOptions({
      mutationKey: executiveReportMutationKeys.endUserDownloadPdf(),
      mutationFn: () => executiveReportApi.downloadEndUserPdf(),
    }),
}

export {
  executiveReportApi,
  executiveReportMutationKeys,
  executiveReportMutationOptions,
  executiveReportQueryKeys,
  executiveReportQueryOptions,
  executiveReportRoutes,
}
