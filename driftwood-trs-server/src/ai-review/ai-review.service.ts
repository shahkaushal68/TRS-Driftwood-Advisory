import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';

import { db } from '../db';
import type { AppRole } from '../auth/roles';
import { AiPromptsRepository } from '../ai-prompts/ai-prompts.repository';
import { AiProviderConfigurationsService } from '../ai-provider-configurations/ai-provider-configurations.service';
import { OpenRouterClient } from '../ai-provider-configurations/providers/openrouter-client';
import { DocumentsService, type IntakeDocument } from '../documents/documents.service';
import { UploadService } from '../upload/upload.service';
import type { AiRawOutput } from '../db/schema';
import { AiReviewRepository } from './ai-review.repository';
import { AI_REQUEST_STATUSES, ANALYST_REVIEW_STATUSES } from './constants/ai-review-status';
import { DocumentTextExtractionService } from './document-text-extraction.service';

/**
 * API-facing result of a completed AI Review — this is exactly what a thin controller can
 * return as-is (see `AiReviewController`). Every non-success outcome (ineligible, reset
 * required, content unavailable, no active provider, provider/request failure) is thrown as
 * the matching NestJS `HttpException`, matching this codebase's existing convention of
 * services throwing exceptions directly rather than returning a result the caller has to
 * interpret.
 */
export interface AiReviewExecutionResult {
  requestId: string;
  responseId: string;
  documentSubmissionId: string;
  provider: string;
  model: string;
  promptId: string;
  /** The active version's human-readable label (e.g. "v1.0") — same value/convention as
   *  `activePromptVersion` on the AI Review Eligibility response. */
  promptVersion: string;
  reviewStatus: string;
  /** True whenever `reviewStatus` is the initial AI-generated state — always true
   *  immediately after a fresh review, since nothing has edited/accepted/published it yet. */
  draftInternalOnly: boolean;
  /** Parsed structured sections (same shape as `ai_analysis.raw_output`), or `null` if the
   *  model's response couldn't be parsed as structured JSON — see `parseAiRawOutputFromContent`. */
  structuredOutput: AiRawOutput | null;
  /** The model's raw text/markdown response — always present, even when `structuredOutput`
   *  is `null`, so the Analyst UI always has something to render. */
  rawMarkdown: string;
}

type DocumentContentResult = { ok: true; content: string } | { ok: false; reason: string };

/**
 * Orchestrates a single AI Review attempt end to end: eligibility → document/content
 * retrieval → active prompt/provider lookup → OpenRouter call → persistence. Every
 * business rule this depends on is reused, not reimplemented:
 *  - eligibility: `DocumentsService.getAiReviewEligibility`
 *  - document lookup/ownership: `DocumentsService.getDocument`
 *  - active prompt template/version rows: `AiPromptsRepository`
 *  - active provider configuration: `AiProviderConfigurationsService`
 *  - the actual HTTP call to OpenRouter: `OpenRouterClient`
 *  - persistence: `AiReviewRepository`
 */
@Injectable()
export class AiReviewService {
  private readonly logger = new Logger(AiReviewService.name);

  constructor(
    private readonly documentsService: DocumentsService,
    private readonly uploadService: UploadService,
    private readonly aiPromptsRepository: AiPromptsRepository,
    private readonly aiProviderConfigurationsService: AiProviderConfigurationsService,
    private readonly openRouterClient: OpenRouterClient,
    private readonly aiReviewRepository: AiReviewRepository,
    private readonly documentTextExtractionService: DocumentTextExtractionService,
  ) {}

  async executeReview(
    documentId: string,
    initiatedByUserId: string,
    initiatedByRole: AppRole,
  ): Promise<AiReviewExecutionResult> {
    // Step 1: only Admin/Analyst may trigger AI Review. Defense in depth — the controller
    // route is expected to also guard itself with RolesGuard.
    if (initiatedByRole !== 'admin' && initiatedByRole !== 'analyst') {
      throw new ForbiddenException('Only Admin or Analyst users may trigger AI Review');
    }

    // Steps 2-3: eligibility. Reused wholesale — this service never re-decides what counts
    // as an active prompt or a reviewable document status; it only asks and reacts.
    // `getAiReviewEligibility` itself throws NotFoundException if the document doesn't exist.
    const eligibility = await this.documentsService.getAiReviewEligibility(
      documentId,
      initiatedByUserId,
      initiatedByRole,
    );
    if (!eligibility.aiReviewEligible) {
      // Covers both "document not eligible" and "no active prompt" — eligibility's own
      // `reason` already distinguishes them in its message text.
      throw new BadRequestException(eligibility.reason);
    }
    if (!eligibility.trsDomain || !eligibility.evidenceCategory || !eligibility.activePromptId) {
      // Eligibility said yes but didn't return what it should have — a contract violation,
      // not a normal "not eligible" outcome.
      throw new InternalServerErrorException(
        'AI review eligibility reported eligible but is missing required fields',
      );
    }

    // Steps 4-5: the document submission (there is no separate "document version" table —
    // resubmission creates a new `intake_document` row, so the current row *is* the current
    // version; see previousDocumentVersionId/resubmittedDocumentVersionId on the schema).
    const doc = await this.documentsService.getDocument(
      documentId,
      initiatedByUserId,
      initiatedByRole,
    );

    // Step 6: reset/resubmission-required is an explicit, separate guard even though a reset
    // document's status would already fail step 2-3 today — this protects against relying on
    // that coincidence if the status model ever changes.
    if (doc.resetRequired) {
      throw new BadRequestException('Document reset. Resubmission required before review.');
    }

    // Step 7: document content, via the existing S3 service.
    const contentResult = await this.getDocumentContent(doc);
    if (!contentResult.ok) {
      throw new BadRequestException(contentResult.reason);
    }

    // Steps 8-9: the active prompt template/version. Eligibility already proved these are
    // active for this domain/category — this just dereferences the ids it returned to get
    // the actual rows (prompt content, version id) needed to persist and to call OpenRouter.
    const template = await this.aiPromptsRepository.findTemplateById(eligibility.activePromptId);
    if (!template?.activeVersionId) {
      throw new InternalServerErrorException(
        'Prompt template reported eligible could not be found',
      );
    }
    const activeVersion = await this.aiPromptsRepository.findVersionById(template.activeVersionId);
    if (!activeVersion) {
      throw new InternalServerErrorException('Prompt version reported eligible could not be found');
    }

    // Step 10: the active provider configuration. Snapshotted now so `provider`/`model` on
    // the request row reflect what was configured at request time; `OpenRouterClient` reads
    // its own copy again when it actually makes the call a moment later (see that class's
    // docs) — in the ordinary case these agree, since nothing else mutates the active
    // configuration mid-request. Treated as a server misconfiguration (500), not a bad
    // request, since it's never something the calling Analyst did wrong.
    const providerConfig = await this.aiProviderConfigurationsService.getActiveConfigForExecution();
    if (!providerConfig) {
      throw new InternalServerErrorException('No active AI provider configuration is set up');
    }

    // Mirrors submitForAiReview's own status transition around its (mocked) AI call —
    // flips the document to "in progress" before the real provider call starts, so it
    // stops looking eligible for a second concurrent/duplicate trigger and so dashboards
    // reading intake_document.status/aiReviewStatus can see a review is underway. This is
    // the earliest point it's safe to flip: everything needed to actually attempt the call
    // (content, active prompt, active provider config) has already been confirmed above.
    await this.documentsService.markAiReviewInProgress(doc.id);

    // Step 11: create the AI Request record.
    const now = new Date();
    const request = await this.aiReviewRepository.insertRequest({
      id: randomUUID(),
      customerId: doc.uploadedBy,
      documentId: doc.id,
      trsDomain: eligibility.trsDomain,
      evidenceCategory: eligibility.evidenceCategory,
      promptTemplateId: template.id,
      promptVersionId: activeVersion.id,
      provider: providerConfig.providerType,
      model: providerConfig.defaultModel,
      initiatedByUserId,
      initiatedAt: now,
      status: AI_REQUEST_STATUSES.PROCESSING,
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
    });

    // Steps 12-13: call OpenRouter.
    const result = await this.openRouterClient.executeReview({
      promptContent: activeVersion.promptContent,
      documentContent: contentResult.content,
      model: providerConfig.defaultModel,
    });

    if (!result.ok) {
      // Failure flow: mark the request Failed with a sanitized message *before* throwing.
      // `result.errorMessage` is guaranteed by `OpenRouterClient` to never contain the API
      // key, the Authorization header, or a raw provider payload.
      const failedAt = new Date();
      await this.aiReviewRepository.updateRequest(request.id, {
        status: AI_REQUEST_STATUSES.FAILED,
        errorMessage: result.errorMessage,
        updatedAt: failedAt,
      });
      await this.documentsService.markAiReviewFailed(doc.id);
      this.logger.warn(
        `AI review request ${request.id} failed [${result.errorCode}]: ${result.errorMessage}`,
      );
      throw new InternalServerErrorException(result.errorMessage);
    }

    // Steps 14-15: parse/normalize the response and persist it, then step 16: mark the
    // request Completed. Both writes happen in one transaction — no external I/O runs
    // inside it, so it stays short-lived.
    const parsedFindings = parseAiRawOutputFromContent(result.content);
    const completedAt = new Date();

    const response = await db.transaction(async (tx) => {
      const insertedResponse = await this.aiReviewRepository.insertResponse(
        {
          id: randomUUID(),
          requestId: request.id,
          documentId: doc.id,
          rawResponse: result.rawResponse,
          structuredMarkdownResponse: result.content,
          parsedFindings,
          evidenceSufficiency:
            parsedFindings?.topLevelAssessment?.evidenceSufficiencySuggestion ?? null,
          aiConfidence: parsedFindings?.topLevelAssessment?.confidenceRating ?? null,
          primaryColorIndicator: parsedFindings?.topLevelAssessment?.colorIndicator ?? null,
          recommendedAnalystAction:
            parsedFindings?.topLevelAssessment?.recommendedAnalystAction ?? null,
          // Steps 17-18: "AI Generated" is the initial analyst workflow status, and — until
          // an analyst edits/accepts/rejects/publishes it — it inherently means the output is
          // draft/internal-only. No separate "draft" flag is added; this status already says it.
          analystReviewStatus: ANALYST_REVIEW_STATUSES.AI_GENERATED,
          createdAt: completedAt,
          updatedAt: completedAt,
        },
        tx,
      );

      await this.aiReviewRepository.updateRequest(
        request.id,
        { status: AI_REQUEST_STATUSES.COMPLETED, updatedAt: completedAt },
        tx,
      );

      return insertedResponse;
    });

    await this.documentsService.markAiReviewCompleted(doc.id);

    // Step 19: return the result to the Admin/Analyst.
    return this.toExecutionResult(request, response);
  }

  /**
   * Re-fetches the most recent persisted AI Review result for a document, without running a
   * new review — used so the Analyst UI can reload an already-completed review (e.g. after
   * reopening the drawer) instead of only ever seeing it once, immediately after
   * `executeReview`'s own response. Returns `null` when no review has ever completed for this
   * document (not an error — the caller renders its own "not reviewed yet" state).
   */
  async getLatestReview(
    documentId: string,
    requestedByUserId: string,
    requestedByRole: AppRole,
  ): Promise<AiReviewExecutionResult | null> {
    // Reuses the same ownership/existence check as executeReview — throws NotFoundException
    // if the document doesn't exist or the requester can't access it.
    await this.documentsService.getDocument(documentId, requestedByUserId, requestedByRole);

    const responses = await this.aiReviewRepository.findResponsesByDocumentId(documentId);
    const latest = responses[0];
    if (!latest) return null;

    const request = await this.aiReviewRepository.findRequestById(latest.requestId);
    if (!request) {
      throw new InternalServerErrorException(
        'AI review response is missing its originating request record',
      );
    }

    return this.toExecutionResult(request, latest);
  }

  /** Shared shaping of a persisted request/response pair into the API-facing result — used
   *  by both a freshly completed review (`executeReview`) and re-fetching an existing one
   *  (`getLatestReview`), so the two paths can never drift into returning different shapes
   *  for what is otherwise the same underlying data. */
  private async toExecutionResult(
    request: Pick<
      Awaited<ReturnType<AiReviewRepository['insertRequest']>>,
      'id' | 'provider' | 'model' | 'promptTemplateId' | 'promptVersionId'
    >,
    response: Awaited<ReturnType<AiReviewRepository['insertResponse']>>,
  ): Promise<AiReviewExecutionResult> {
    const activeVersion = await this.aiPromptsRepository.findVersionById(request.promptVersionId);

    return {
      requestId: request.id,
      responseId: response.id,
      documentSubmissionId: response.documentId,
      provider: request.provider,
      model: request.model,
      promptId: request.promptTemplateId,
      promptVersion: activeVersion?.versionLabel ?? '',
      reviewStatus: response.analystReviewStatus,
      draftInternalOnly: response.analystReviewStatus === ANALYST_REVIEW_STATUSES.AI_GENERATED,
      structuredOutput: response.parsedFindings,
      rawMarkdown: response.structuredMarkdownResponse ?? '',
    };
  }

  /**
   * Step 7. Text extraction is delegated to `DocumentTextExtractionService`, which supports
   * `text/plain`, `.docx`, and `.pdf` — anything else fails cleanly here before any bytes are
   * even read, rather than sending garbage bytes to the AI provider or silently falling back
   * to metadata-only content like the old mock did.
   */
  private async getDocumentContent(doc: IntakeDocument): Promise<DocumentContentResult> {
    if (!this.documentTextExtractionService.isSupported(doc.fileType)) {
      return {
        ok: false,
        reason: `AI review does not yet support extracting content from "${doc.fileType}" documents — supported types: plain text, DOCX, PDF`,
      };
    }

    let buffer: Buffer;
    try {
      buffer = await this.uploadService.getObjectBuffer(doc.s3Key);
    } catch (error) {
      // Log only the message, not the raw error object — consistent with how every other
      // failure path in this feature (OpenRouterClient, describeOpenRouterHttpError) is
      // careful to never log a raw provider/SDK error object verbatim.
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to read document content for ${doc.id} from storage: ${message}`);
      return { ok: false, reason: 'Failed to retrieve the document content from storage' };
    }

    const extraction = await this.documentTextExtractionService.extractFromBuffer(
      doc.fileType,
      buffer,
    );
    if (!extraction.ok) {
      return { ok: false, reason: extraction.reason };
    }

    if (!extraction.text.trim()) {
      return { ok: false, reason: 'The document has no extractable text content' };
    }

    return { ok: true, content: extraction.text };
  }
}

/**
 * Best-effort structured parse of the model's raw text into the existing `AiRawOutput`
 * shape (same shape `ai_analysis.raw_output` already uses). Returns `null` — not a failure —
 * when the response isn't structured JSON; the raw text is always preserved separately in
 * `structuredMarkdownResponse`, so nothing is lost either way. This is deliberately loose:
 * the prompt's actual output format is admin-authored content this service doesn't control.
 */
function parseAiRawOutputFromContent(content: string): AiRawOutput | null {
  const jsonText = extractJsonText(content);
  if (!jsonText) return null;

  try {
    const parsed: unknown = JSON.parse(jsonText);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/** LLMs often wrap JSON in a ```json fenced code block even when asked for raw JSON. */
function extractJsonText(content: string): string | null {
  const trimmed = content.trim();
  if (trimmed.startsWith('{')) return trimmed;

  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  return fenced?.[1]?.trim() ?? null;
}
