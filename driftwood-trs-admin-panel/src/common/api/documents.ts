import { mutationOptions, queryOptions } from '@tanstack/react-query'

import { apiClient, isNotFoundError } from './client'
import type { PaginatedResponse, PaginationParams } from '../pagination/types'
import { DEFAULT_PAGINATION } from '../pagination/types'

export interface IntakeDocument {
  id: string
  uploadedBy: string
  fileName: string
  fileType: string
  s3Key: string
  fileSize: number | null
  trsDomain: string | null
  evidenceCategory: string | null
  evidenceType: string | null
  notes: string | null
  status: string
  aiReviewStatus: string
  analystId: string | null
  sufficiencyRating: string | null
  analystValidationStatus: string | null
  publishedAt: string | null
  resetRequired: boolean
  resetReason: string | null
  requestedCorrection: string | null
  resetByUserId: string | null
  resetByName: string | null
  resetAt: string | null
  resetDueDate: string | null
  previousDocumentVersionId: string | null
  resubmittedDocumentVersionId: string | null
  createdAt: string
  updatedAt: string
}

/**
 * Response shape of `GET /documents/:id/ai-review-eligibility` — mirrors
 * `AiReviewEligibilityResult` in the server's `DocumentsService`. `trsDomain`/
 * `evidenceCategory` are nullable because the backend still returns them (as `null`) when
 * the document hasn't been classified yet.
 */
export interface AiReviewEligibility {
  documentSubmissionId: string
  trsDomain: string | null
  evidenceCategory: string | null
  aiReviewEligible: boolean
  activePromptId: string | null
  activePromptVersion: string | null
  reason: string
}

/**
 * Result of the real, OpenRouter-backed AI Review — `POST /documents/:id/ai-review`
 * (create/run a new review) and `GET /documents/:id/ai-review` (re-fetch the most recent
 * one) both return this shape. Mirrors `AiReviewExecutionResult` in the server's
 * `AiReviewService`. This is distinct from the legacy mock `AiAnalysis`/`ai-analysis`
 * endpoints below, which back the self-service "Submit for AI Review" bulk flow.
 */
export interface AiReviewExecutionResult {
  requestId: string
  responseId: string
  documentSubmissionId: string
  provider: string
  model: string
  promptId: string
  promptVersion: string
  reviewStatus: string
  draftInternalOnly: boolean
  structuredOutput: AiRawOutput | null
  rawMarkdown: string
}

export interface IntakeDocumentWithUser extends IntakeDocument {
  uploadedByUser: {
    id: string
    name: string
    email: string
  }
}

export interface IntakeDocumentFinding {
  id: string
  documentId: string
  createdBy: string
  trsDomain: string
  evidenceCategory: string
  title: string
  body: string
  sufficiencyRating: string | null
  isAiGenerated: boolean
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface EvidenceDomainSummary {
  domain: string
  domainLabel: string
  requiredTotal: number
  uploadedRequired: string[]
  missingRequired: string[]
  status: 'missing' | 'partial' | 'complete'
}

export interface RegisterDocumentRequest {
  fileName: string
  fileType: string
  s3Key: string
  fileSize?: number
}

export interface ResetDocumentRequest {
  resetReason: string
  requestedCorrection?: string
  dueDate?: string
}

export interface ClassifyDocumentRequest {
  trsDomain: string
  evidenceCategory: string
  evidenceType: string
  notes?: string
}

export interface CreateFindingRequest {
  title: string
  body: string
  sufficiencyRating?: string
}

export interface UpdateFindingRequest {
  title?: string
  body?: string
  sufficiencyRating?: string
}

export interface SetSufficiencyRequest {
  sufficiencyRating: string
  analystValidationStatus: string
}

/**
 * The full AI-generated analysis output. This is stored as a single jsonb blob in the
 * `ai_analysis.raw_output` column — there are no individual DB columns per section.
 *
 * Design rationale: the AI prompt can change without requiring a DB migration. All fields
 * are optional; the UI (`AiAnalysisPanel` in AnalystDocumentDrawer.tsx) renders whichever
 * keys are present. The shape here must stay in sync with `AiRawOutput` in the server schema
 * (`driftwood-trs-server/src/db/schema/documents.ts`).
 *
 * When updating, always send the full object — the server replaces the blob wholesale,
 * it does not merge individual fields.
 */
export interface AiRawOutput {
  /** Metadata: TRS domain, evidence category/type, and when the AI ran. */
  reviewHeader?: {
    domain?: string
    domainLabel?: string
    category?: string
    evidenceType?: string
    generatedAt?: string
  }
  /**
   * High-level verdict summary.
   * `colorIndicator` drives the badge color in the UI (Green/Yellow/Red).
   * `confidenceRating` is free text (e.g. "High", "Medium").
   */
  topLevelAssessment?: {
    evidenceSufficiencySuggestion?: string
    colorIndicator?: 'Green' | 'Yellow' | 'Red'
    confidenceRating?: string
    recommendedAnalystAction?: string
  }
  executiveSummary?: string
  documentQualityReview?: string
  /** Bulleted list of readiness signals found in the document. */
  systemOfRecordReadinessFindings?: string[]
  systemOfRecordCoverageReview?: string
  /** Bulleted list of missing or insufficient evidence areas. */
  evidenceGaps?: string[]
  /**
   * Only populated when the AI can't make a full determination.
   * Rendered as a numbered list for the analyst to answer manually.
   */
  humanValidationQuestions?: string[]
  /** Numbered list of recommended next steps for the analyst. */
  suggestedNextSteps?: string[]
  /** AI-drafted finding the analyst can adopt or edit before publishing. */
  draftAnalystFinding?: string
  limitationsAndUncertainties?: string
}

/**
 * One-to-one with an `IntakeDocument`. The full AI response lives in `rawOutput`.
 * Only `aiVerdict` and `reportStatus` are separate — they drive server-side workflow logic.
 */
export interface AiAnalysis {
  id: string
  documentId: string
  rawOutput: AiRawOutput
  /** Analyst-confirmed verdict. Separate from rawOutput so the server can filter on it directly. */
  aiVerdict: 'pass' | 'review' | 'failed' | null
  /** 'draft' until the analyst publishes; controls visibility to the document owner. */
  reportStatus: 'draft' | 'published'
  createdAt: string
  updatedAt: string
}

/**
 * Payload for PATCH /analyst/documents/:id/ai-analysis.
 * `rawOutput` replaces the entire blob — send the full updated object, not a partial patch.
 */
export interface UpdateAiAnalysisRequest {
  rawOutput?: AiRawOutput
  aiVerdict?: 'pass' | 'review' | 'failed'
}

/**
 * Manual Review — the human-authored counterpart to `AiAnalysis`, used when no active AI
 * prompt exists for a document's evidence category. One-to-one with `IntakeDocument`.
 * Field names/shape must stay in sync with `manualReview` in the server schema
 * (`driftwood-trs-server/src/db/schema/documents.ts`).
 */
export interface ManualReview {
  id: string
  documentId: string
  reviewedBy: string | null
  reviewSource: string
  reviewStatus: 'draft' | 'completed'
  executiveSummary: string | null
  documentQualityReview: string | null
  readinessFindings: string | null
  evidenceGaps: string | null
  humanValidationQuestions: string | null
  suggestedNextSteps: string | null
  draftAnalystFinding: string | null
  limitations: string | null
  evidenceSufficiency: string | null
  reviewerConfidence: string | null
  primaryColorIndicator: string | null
  recommendedAnalystAction: string | null
  createdAt: string
  updatedAt: string
}

/** Payload for POST /manual-review — creates the (one) Manual Review for a document. */
export interface CreateManualReviewRequest {
  documentId: string
  reviewStatus?: 'draft' | 'completed'
  executiveSummary?: string
  documentQualityReview?: string
  readinessFindings?: string
  evidenceGaps?: string
  humanValidationQuestions?: string
  suggestedNextSteps?: string
  draftAnalystFinding?: string
  limitations?: string
  evidenceSufficiency?: string
  reviewerConfidence?: string
  primaryColorIndicator?: string
  recommendedAnalystAction?: string
}

/** Payload for PUT /manual-review/:reviewId — every field is a partial update. */
export interface UpdateManualReviewRequest {
  reviewStatus?: 'draft' | 'completed'
  executiveSummary?: string
  documentQualityReview?: string
  readinessFindings?: string
  evidenceGaps?: string
  humanValidationQuestions?: string
  suggestedNextSteps?: string
  draftAnalystFinding?: string
  limitations?: string
  evidenceSufficiency?: string
  reviewerConfidence?: string
  primaryColorIndicator?: string
  recommendedAnalystAction?: string
}

export interface UserAiReviewStatus {
  status: 'idle' | 'completed' | 'failed'
  submittedAt: string | null
}

export interface AiReviewSummary {
  classified: number
  unclassified: number
  alreadyProcessed: number
}

export interface TriggerAiReviewResult {
  submitted: number
  skipped: number
  failed: number
}

const documentRoutes = {
  evidenceCategories: '/documents/evidence-categories',
  evidenceSummary: '/documents/evidence-summary',
  aiReviewSummary: '/documents/ai-review-summary',
  userAiReviewStatus: '/documents/ai-review-status',
  triggerAiReview: '/documents/trigger-ai-review',
  documents: '/documents',
  document: (id: string) => `/documents/${id}`,
  documentSignedUrl: (id: string) => `/documents/${id}/signed-url`,
  documentFindings: (id: string) => `/documents/${id}/findings`,
  documentAiAnalysis: (id: string) => `/documents/${id}/ai-analysis`,
  aiReviewEligibility: (id: string) => `/documents/${id}/ai-review-eligibility`,
  /** The real, OpenRouter-backed AI Review — `AiReviewController` on the server. `POST`
   *  runs a new review; `GET` re-fetches the most recent one without calling the provider
   *  again. Distinct from `analystDocumentAiReview` below, which is the legacy mock. */
  runAiReview: (id: string) => `/documents/${id}/ai-review`,
  classifyDocument: (id: string) => `/documents/${id}/classify`,
  resetDocument: (id: string) => `/documents/${id}/reset`,
  resubmitDocument: (id: string) => `/documents/${id}/resubmit`,
  analystDocuments: '/analyst/documents',
  analystEvidenceSummary: '/analyst/documents/evidence-summary',
  analystDocumentAiReview: (id: string) => `/analyst/documents/${id}/ai-review`,
  analystDocumentFindings: (id: string) => `/analyst/documents/${id}/findings`,
  analystDocumentFinding: (id: string, findingId: string) =>
    `/analyst/documents/${id}/findings/${findingId}`,
  analystDocumentSufficiency: (id: string) => `/analyst/documents/${id}/sufficiency`,
  analystDocumentPublish: (id: string) => `/analyst/documents/${id}/publish`,
  analystDocumentAiAnalysis: (id: string) => `/analyst/documents/${id}/ai-analysis`,
  analystUpdateAiAnalysis: (id: string) => `/analyst/documents/${id}/ai-analysis`,
  analystPublishAiAnalysis: (id: string) => `/analyst/documents/${id}/ai-analysis/publish`,
  analystResetUser: '/analyst/documents/reset',
  manualReview: '/manual-review',
  manualReviewByDocument: (documentId: string) => `/manual-review/${documentId}`,
  manualReviewById: (reviewId: string) => `/manual-review/${reviewId}`,
} as const

const documentQueryKeys = {
  all: ['documents'] as const,
  evidenceCategories: () => [...documentQueryKeys.all, 'evidence-categories'] as const,
  evidenceSummary: () => [...documentQueryKeys.all, 'evidence-summary'] as const,
  aiReviewSummary: () => [...documentQueryKeys.all, 'ai-review-summary'] as const,
  userAiReviewStatus: () => [...documentQueryKeys.all, 'user-ai-review-status'] as const,
  myList: (params: PaginationParams) => [...documentQueryKeys.all, 'my-list', params] as const,
  analystList: () => [...documentQueryKeys.all, 'analyst-list'] as const,
  analystListByUser: (userId: string, params: PaginationParams) =>
    [...documentQueryKeys.all, 'analyst-list', userId, params] as const,
  analystEvidenceSummaryForUser: (userId: string) =>
    [...documentQueryKeys.all, 'analyst-evidence-summary', userId] as const,
  detail: (id: string) => [...documentQueryKeys.all, 'detail', id] as const,
  findings: (id: string) => [...documentQueryKeys.all, 'findings', id] as const,
  analystFindings: (id: string) => [...documentQueryKeys.all, 'analyst-findings', id] as const,
  signedUrl: (id: string) => [...documentQueryKeys.all, 'signed-url', id] as const,
  documentAiAnalysis: (id: string) => [...documentQueryKeys.all, 'ai-analysis', id] as const,
  aiReviewEligibility: (id: string) =>
    [...documentQueryKeys.all, 'ai-review-eligibility', id] as const,
  aiReviewResult: (id: string) => [...documentQueryKeys.all, 'ai-review-result', id] as const,
  analystDocumentAiAnalysis: (id: string) =>
    [...documentQueryKeys.all, 'analyst-ai-analysis', id] as const,
  manualReview: (documentId: string) =>
    [...documentQueryKeys.all, 'manual-review', documentId] as const,
}

const documentMutationKeys = {
  all: ['documents'] as const,
  register: () => [...documentMutationKeys.all, 'register'] as const,
  delete: (id: string) => [...documentMutationKeys.all, 'delete', id] as const,
  classify: (id: string) => [...documentMutationKeys.all, 'classify', id] as const,
  resetDocument: (id: string) => [...documentMutationKeys.all, 'reset-document', id] as const,
  resubmitDocument: (id: string) =>
    [...documentMutationKeys.all, 'resubmit-document', id] as const,
  aiReview: (id: string) => [...documentMutationKeys.all, 'ai-review', id] as const,
  runAiReview: (id: string) => [...documentMutationKeys.all, 'run-ai-review', id] as const,
  triggerAiReview: () => [...documentMutationKeys.all, 'trigger-ai-review'] as const,
  createFinding: (id: string) => [...documentMutationKeys.all, 'create-finding', id] as const,
  updateFinding: (id: string, fid: string) =>
    [...documentMutationKeys.all, 'update-finding', id, fid] as const,
  deleteFinding: (id: string, fid: string) =>
    [...documentMutationKeys.all, 'delete-finding', id, fid] as const,
  setSufficiency: (id: string) => [...documentMutationKeys.all, 'set-sufficiency', id] as const,
  publish: (id: string) => [...documentMutationKeys.all, 'publish', id] as const,
  updateAiAnalysis: (id: string) =>
    [...documentMutationKeys.all, 'update-ai-analysis', id] as const,
  publishAiAnalysis: (id: string) =>
    [...documentMutationKeys.all, 'publish-ai-analysis', id] as const,
  resetUserDocuments: (userId: string) =>
    [...documentMutationKeys.all, 'reset-user', userId] as const,
  createManualReview: () => [...documentMutationKeys.all, 'create-manual-review'] as const,
  updateManualReview: (reviewId: string) =>
    [...documentMutationKeys.all, 'update-manual-review', reviewId] as const,
}

const documentApi = {
  async getEvidenceCategories(): Promise<Record<string, string[]>> {
    const response = await apiClient.get<Record<string, string[]>>(
      documentRoutes.evidenceCategories,
    )
    return response.data
  },

  async getEvidenceSummary(): Promise<EvidenceDomainSummary[]> {
    const response = await apiClient.get<EvidenceDomainSummary[]>(documentRoutes.evidenceSummary)
    return response.data
  },

  async getAiReviewSummary(): Promise<AiReviewSummary> {
    const response = await apiClient.get<AiReviewSummary>(documentRoutes.aiReviewSummary)
    return response.data
  },

  async getUserAiReviewStatus(): Promise<UserAiReviewStatus> {
    const response = await apiClient.get<UserAiReviewStatus>(documentRoutes.userAiReviewStatus)
    return response.data
  },

  async triggerAiReview(): Promise<TriggerAiReviewResult> {
    const response = await apiClient.post<TriggerAiReviewResult>(documentRoutes.triggerAiReview)
    return response.data
  },

  async registerDocument(payload: RegisterDocumentRequest): Promise<IntakeDocument> {
    const response = await apiClient.post<IntakeDocument>(documentRoutes.documents, payload)
    return response.data
  },

  async listMyDocuments(params: PaginationParams): Promise<PaginatedResponse<IntakeDocument>> {
    const response = await apiClient.get<PaginatedResponse<IntakeDocument>>(
      documentRoutes.documents,
      {
        params: {
          pageNumber: params.pageNumber,
          perPage: params.perPage,
          sortBy: params.sortBy,
          sortDirection: params.sortDirection,
        },
      },
    )
    return response.data
  },

  async getDocument(id: string): Promise<IntakeDocument> {
    const response = await apiClient.get<IntakeDocument>(documentRoutes.document(id))
    return response.data
  },

  async getDocumentSignedUrl(
    id: string,
  ): Promise<{ url: string; fileName: string; fileType: string }> {
    const response = await apiClient.get<{ url: string; fileName: string; fileType: string }>(
      documentRoutes.documentSignedUrl(id),
    )
    return response.data
  },

  async getDocumentFindings(id: string): Promise<IntakeDocumentFinding[]> {
    const response = await apiClient.get<IntakeDocumentFinding[]>(
      documentRoutes.documentFindings(id),
    )
    return response.data
  },

  async getAiReviewEligibility(id: string): Promise<AiReviewEligibility> {
    const response = await apiClient.get<AiReviewEligibility>(
      documentRoutes.aiReviewEligibility(id),
    )
    return response.data
  },

  /** Re-fetches the most recent real AI Review result for a document, or `null` if one has
   *  never completed. Does not call OpenRouter — see `executeAiReview` for that. */
  async getAiReview(id: string): Promise<AiReviewExecutionResult | null> {
    const response = await apiClient.get<AiReviewExecutionResult | null>(
      documentRoutes.runAiReview(id),
    )
    return response.data
  },

  /** Runs a real AI Review via the configured OpenRouter provider + the active prompt
   *  template for the document's evidence category. Throws if ineligible (see
   *  `getAiReviewEligibility`), reset-required, unsupported file type, or the provider
   *  call fails. */
  async executeAiReview(id: string): Promise<AiReviewExecutionResult> {
    const response = await apiClient.post<AiReviewExecutionResult>(documentRoutes.runAiReview(id))
    return response.data
  },

  async deleteDocument(id: string): Promise<void> {
    await apiClient.delete(documentRoutes.document(id))
  },

  async classifyDocument(id: string, payload: ClassifyDocumentRequest): Promise<IntakeDocument> {
    const response = await apiClient.patch<IntakeDocument>(
      documentRoutes.classifyDocument(id),
      payload,
    )
    return response.data
  },

  async resetDocument(id: string, payload: ResetDocumentRequest): Promise<IntakeDocument> {
    const response = await apiClient.post<IntakeDocument>(documentRoutes.resetDocument(id), payload)
    return response.data
  },

  async resubmitDocument(id: string, payload: RegisterDocumentRequest): Promise<IntakeDocument> {
    const response = await apiClient.post<IntakeDocument>(
      documentRoutes.resubmitDocument(id),
      payload,
    )
    return response.data
  },

  async getDocumentsByUser(
    userId: string,
    params: PaginationParams,
  ): Promise<PaginatedResponse<IntakeDocumentWithUser>> {
    const response = await apiClient.get<PaginatedResponse<IntakeDocumentWithUser>>(
      documentRoutes.analystDocuments,
      {
        params: {
          userId,
          pageNumber: params.pageNumber,
          perPage: params.perPage,
          sortBy: params.sortBy,
          sortDirection: params.sortDirection,
        },
      },
    )
    return response.data
  },

  async getEvidenceSummaryForUser(userId: string): Promise<EvidenceDomainSummary[]> {
    const response = await apiClient.get<EvidenceDomainSummary[]>(
      documentRoutes.analystEvidenceSummary,
      { params: { userId } },
    )
    return response.data
  },

  async submitForAiReview(id: string): Promise<IntakeDocument> {
    const response = await apiClient.post<IntakeDocument>(
      documentRoutes.analystDocumentAiReview(id),
    )
    return response.data
  },

  async getAnalystFindings(id: string): Promise<IntakeDocumentFinding[]> {
    const response = await apiClient.get<IntakeDocumentFinding[]>(
      documentRoutes.analystDocumentFindings(id),
    )
    return response.data
  },

  async createFinding(id: string, payload: CreateFindingRequest): Promise<IntakeDocumentFinding> {
    const response = await apiClient.post<IntakeDocumentFinding>(
      documentRoutes.analystDocumentFindings(id),
      payload,
    )
    return response.data
  },

  async updateFinding(
    id: string,
    findingId: string,
    payload: UpdateFindingRequest,
  ): Promise<IntakeDocumentFinding> {
    const response = await apiClient.patch<IntakeDocumentFinding>(
      documentRoutes.analystDocumentFinding(id, findingId),
      payload,
    )
    return response.data
  },

  async deleteFinding(id: string, findingId: string): Promise<void> {
    await apiClient.delete(documentRoutes.analystDocumentFinding(id, findingId))
  },

  async setSufficiency(id: string, payload: SetSufficiencyRequest): Promise<IntakeDocument> {
    const response = await apiClient.patch<IntakeDocument>(
      documentRoutes.analystDocumentSufficiency(id),
      payload,
    )
    return response.data
  },

  async publishFindings(id: string): Promise<IntakeDocument> {
    const response = await apiClient.post<IntakeDocument>(documentRoutes.analystDocumentPublish(id))
    return response.data
  },

  async getDocumentAiAnalysis(id: string): Promise<AiAnalysis | null> {
    const response = await apiClient.get<AiAnalysis | null>(documentRoutes.documentAiAnalysis(id))
    return response.data
  },

  async getAnalystDocumentAiAnalysis(id: string): Promise<AiAnalysis | null> {
    const response = await apiClient.get<AiAnalysis | null>(
      documentRoutes.analystDocumentAiAnalysis(id),
    )
    return response.data
  },

  async updateAiAnalysis(id: string, payload: UpdateAiAnalysisRequest): Promise<AiAnalysis> {
    const response = await apiClient.patch<AiAnalysis>(
      documentRoutes.analystUpdateAiAnalysis(id),
      payload,
    )
    return response.data
  },

  async publishAiAnalysisReport(id: string): Promise<IntakeDocument> {
    const response = await apiClient.post<IntakeDocument>(
      documentRoutes.analystPublishAiAnalysis(id),
    )
    return response.data
  },

  async resetUserDocuments(userId: string): Promise<void> {
    await apiClient.post(documentRoutes.analystResetUser, { userId })
  },

  async createManualReview(payload: CreateManualReviewRequest): Promise<ManualReview> {
    const response = await apiClient.post<ManualReview>(documentRoutes.manualReview, payload)
    return response.data
  },

  /** Returns `null` when no Manual Review has been saved for this document yet — the
   *  server 404s in that case, which is an expected empty state here, not a load error. */
  async getManualReview(documentId: string): Promise<ManualReview | null> {
    try {
      const response = await apiClient.get<ManualReview>(
        documentRoutes.manualReviewByDocument(documentId),
      )
      return response.data
    } catch (error) {
      if (isNotFoundError(error)) return null
      throw error
    }
  },

  async updateManualReview(
    reviewId: string,
    payload: UpdateManualReviewRequest,
  ): Promise<ManualReview> {
    const response = await apiClient.put<ManualReview>(
      documentRoutes.manualReviewById(reviewId),
      payload,
    )
    return response.data
  },
}

const documentQueryOptions = {
  evidenceCategories: () =>
    queryOptions({
      queryKey: documentQueryKeys.evidenceCategories(),
      queryFn: () => documentApi.getEvidenceCategories(),
      staleTime: Infinity,
    }),

  evidenceSummary: () =>
    queryOptions({
      queryKey: documentQueryKeys.evidenceSummary(),
      queryFn: () => documentApi.getEvidenceSummary(),
    }),

  aiReviewSummary: () =>
    queryOptions({
      queryKey: documentQueryKeys.aiReviewSummary(),
      queryFn: () => documentApi.getAiReviewSummary(),
    }),

  userAiReviewStatus: () =>
    queryOptions({
      queryKey: documentQueryKeys.userAiReviewStatus(),
      queryFn: () => documentApi.getUserAiReviewStatus(),
      staleTime: 0,
    }),

  myList: (params: PaginationParams = DEFAULT_PAGINATION) =>
    queryOptions({
      queryKey: documentQueryKeys.myList(params),
      queryFn: () => documentApi.listMyDocuments(params),
    }),

  analystListByUser: (userId: string, params: PaginationParams = DEFAULT_PAGINATION) =>
    queryOptions({
      queryKey: documentQueryKeys.analystListByUser(userId, params),
      queryFn: () => documentApi.getDocumentsByUser(userId, params),
      enabled: userId.length > 0,
    }),

  analystEvidenceSummaryForUser: (userId: string) =>
    queryOptions({
      queryKey: documentQueryKeys.analystEvidenceSummaryForUser(userId),
      queryFn: () => documentApi.getEvidenceSummaryForUser(userId),
      enabled: userId.length > 0,
    }),

  detail: (id: string) =>
    queryOptions({
      queryKey: documentQueryKeys.detail(id),
      queryFn: () => documentApi.getDocument(id),
      enabled: id.length > 0,
    }),

  findings: (id: string) =>
    queryOptions({
      queryKey: documentQueryKeys.findings(id),
      queryFn: () => documentApi.getDocumentFindings(id),
      enabled: id.length > 0,
    }),

  analystFindings: (id: string) =>
    queryOptions({
      queryKey: documentQueryKeys.analystFindings(id),
      queryFn: () => documentApi.getAnalystFindings(id),
      enabled: id.length > 0,
    }),

  signedUrl: (id: string) =>
    queryOptions({
      queryKey: documentQueryKeys.signedUrl(id),
      queryFn: () => documentApi.getDocumentSignedUrl(id),
      enabled: id.length > 0,
      staleTime: 10 * 60 * 1000,
    }),

  documentAiAnalysis: (id: string) =>
    queryOptions({
      queryKey: documentQueryKeys.documentAiAnalysis(id),
      queryFn: () => documentApi.getDocumentAiAnalysis(id),
      enabled: id.length > 0,
    }),

  analystDocumentAiAnalysis: (id: string) =>
    queryOptions({
      queryKey: documentQueryKeys.analystDocumentAiAnalysis(id),
      queryFn: () => documentApi.getAnalystDocumentAiAnalysis(id),
      enabled: id.length > 0,
    }),

  manualReview: (documentId: string) =>
    queryOptions({
      queryKey: documentQueryKeys.manualReview(documentId),
      queryFn: () => documentApi.getManualReview(documentId),
      enabled: documentId.length > 0,
    }),

  aiReviewEligibility: (id: string) =>
    queryOptions({
      queryKey: documentQueryKeys.aiReviewEligibility(id),
      queryFn: () => documentApi.getAiReviewEligibility(id),
      enabled: id.length > 0,
    }),

  aiReviewResult: (id: string) =>
    queryOptions({
      queryKey: documentQueryKeys.aiReviewResult(id),
      queryFn: () => documentApi.getAiReview(id),
      enabled: id.length > 0,
    }),
}

const documentMutationOptions = {
  register: () =>
    mutationOptions({
      mutationKey: documentMutationKeys.register(),
      mutationFn: (payload: RegisterDocumentRequest) => documentApi.registerDocument(payload),
    }),

  delete: () =>
    mutationOptions({
      mutationKey: documentMutationKeys.delete(''),
      mutationFn: (id: string) => documentApi.deleteDocument(id),
    }),

  classify: (id: string) =>
    mutationOptions({
      mutationKey: documentMutationKeys.classify(id),
      mutationFn: (payload: ClassifyDocumentRequest) => documentApi.classifyDocument(id, payload),
    }),

  resetDocument: (id: string) =>
    mutationOptions({
      mutationKey: documentMutationKeys.resetDocument(id),
      mutationFn: (payload: ResetDocumentRequest) => documentApi.resetDocument(id, payload),
    }),

  resubmitDocument: (id: string) =>
    mutationOptions({
      mutationKey: documentMutationKeys.resubmitDocument(id),
      mutationFn: (payload: RegisterDocumentRequest) => documentApi.resubmitDocument(id, payload),
    }),

  submitForAiReview: (id: string) =>
    mutationOptions({
      mutationKey: documentMutationKeys.aiReview(id),
      mutationFn: () => documentApi.submitForAiReview(id),
    }),

  /** Runs the real AI Review (OpenRouter) for a single document — see
   *  `documentApi.executeAiReview`. */
  runAiReview: (id: string) =>
    mutationOptions({
      mutationKey: documentMutationKeys.runAiReview(id),
      mutationFn: () => documentApi.executeAiReview(id),
    }),

  createFinding: (id: string) =>
    mutationOptions({
      mutationKey: documentMutationKeys.createFinding(id),
      mutationFn: (payload: CreateFindingRequest) => documentApi.createFinding(id, payload),
    }),

  updateFinding: (id: string, findingId: string) =>
    mutationOptions({
      mutationKey: documentMutationKeys.updateFinding(id, findingId),
      mutationFn: (payload: UpdateFindingRequest) =>
        documentApi.updateFinding(id, findingId, payload),
    }),

  deleteFinding: (id: string, findingId: string) =>
    mutationOptions({
      mutationKey: documentMutationKeys.deleteFinding(id, findingId),
      mutationFn: () => documentApi.deleteFinding(id, findingId),
    }),

  setSufficiency: (id: string) =>
    mutationOptions({
      mutationKey: documentMutationKeys.setSufficiency(id),
      mutationFn: (payload: SetSufficiencyRequest) => documentApi.setSufficiency(id, payload),
    }),

  publishFindings: (id: string) =>
    mutationOptions({
      mutationKey: documentMutationKeys.publish(id),
      mutationFn: () => documentApi.publishFindings(id),
    }),

  triggerAiReview: () =>
    mutationOptions({
      mutationKey: documentMutationKeys.triggerAiReview(),
      mutationFn: () => documentApi.triggerAiReview(),
    }),

  updateAiAnalysis: (id: string) =>
    mutationOptions({
      mutationKey: documentMutationKeys.updateAiAnalysis(id),
      mutationFn: (payload: UpdateAiAnalysisRequest) => documentApi.updateAiAnalysis(id, payload),
    }),

  publishAiAnalysisReport: (id: string) =>
    mutationOptions({
      mutationKey: documentMutationKeys.publishAiAnalysis(id),
      mutationFn: () => documentApi.publishAiAnalysisReport(id),
    }),

  resetUserDocuments: (userId: string) =>
    mutationOptions({
      mutationKey: documentMutationKeys.resetUserDocuments(userId),
      mutationFn: () => documentApi.resetUserDocuments(userId),
    }),

  createManualReview: () =>
    mutationOptions({
      mutationKey: documentMutationKeys.createManualReview(),
      mutationFn: (payload: CreateManualReviewRequest) => documentApi.createManualReview(payload),
    }),

  updateManualReview: (reviewId: string) =>
    mutationOptions({
      mutationKey: documentMutationKeys.updateManualReview(reviewId),
      mutationFn: (payload: UpdateManualReviewRequest) =>
        documentApi.updateManualReview(reviewId, payload),
    }),
}

export const DOCUMENT_STATUS_LABELS: Record<string, string> = {
  uploaded: 'Uploaded',
  classified: 'Classified',
  ai_review_in_progress: 'AI Review In Progress',
  ai_reviewed: 'AI Reviewed',
  analyst_reviewed: 'Analyst Reviewed',
  published_to_end_user: 'Published',
  insufficient_evidence: 'Insufficient Evidence',
  rejected_not_relevant: 'Rejected',
  ai_review_failed: 'AI Review Failed',
  reset_required: 'Reset / Resubmission Required',
}

export const DOCUMENT_STATUS_COLORS: Record<string, string> = {
  uploaded: 'blue',
  classified: 'cyan',
  ai_review_in_progress: 'yellow',
  ai_reviewed: 'teal',
  analyst_reviewed: 'indigo',
  published_to_end_user: 'green',
  insufficient_evidence: 'orange',
  rejected_not_relevant: 'red',
  ai_review_failed: 'red',
  reset_required: 'red',
}

export const AI_REVIEW_STATUS_LABELS: Record<string, string> = {
  pending: 'Not Submitted',
  in_progress: 'Processing',
  completed: 'AI Reviewed',
  failed: 'Failed',
}

export const AI_REVIEW_STATUS_COLORS: Record<string, string> = {
  pending: 'gray',
  in_progress: 'yellow',
  completed: 'teal',
  failed: 'red',
}

export const SUFFICIENCY_LABELS: Record<string, string> = {
  strong: 'Strong Evidence',
  partial: 'Partial Evidence',
  insufficient: 'Insufficient Evidence',
  not_relevant: 'Not Relevant',
  needs_human_followup: 'Needs Follow-Up',
}

export const SUFFICIENCY_COLORS: Record<string, string> = {
  strong: 'green',
  partial: 'yellow',
  insufficient: 'orange',
  not_relevant: 'red',
  needs_human_followup: 'grape',
}

export const TRS_DOMAIN_LABELS: Record<string, string> = {
  data_integrity_trust: 'Data Integrity & Trust',
  governance_decision_rights: 'Governance & Decision Rights',
}

export const EVIDENCE_TYPE_LABELS: Record<string, string> = {
  required: 'Required',
  optional: 'Optional',
  other: 'Other',
}

export const AI_VERDICT_LABELS: Record<string, string> = {
  pass: 'Pass',
  review: 'Review',
  failed: 'Failed',
}

export const AI_VERDICT_COLORS: Record<string, string> = {
  pass: 'green',
  review: 'yellow',
  failed: 'red',
}

export const REPORT_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  published: 'Published',
}

export const REPORT_STATUS_COLORS: Record<string, string> = {
  draft: 'gray',
  published: 'green',
}

export {
  documentApi,
  documentMutationKeys,
  documentMutationOptions,
  documentQueryKeys,
  documentQueryOptions,
  documentRoutes,
}
