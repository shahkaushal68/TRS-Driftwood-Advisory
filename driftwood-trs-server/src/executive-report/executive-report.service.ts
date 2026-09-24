import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { db } from '../db';
import type { AiReviewResponseRow } from '../ai-review/ai-review.repository';
import {
  AI_REQUEST_STATUSES,
  ANALYST_REVIEW_STATUSES,
} from '../ai-review/constants/ai-review-status';
import { AiPromptsService, type ActivePromptResult } from '../ai-prompts/ai-prompts.service';
import { AiProviderConfigurationsService } from '../ai-provider-configurations/ai-provider-configurations.service';
import { OpenRouterClient } from '../ai-provider-configurations/providers/openrouter-client';
import type { IntakeDocument, ManualReview } from '../documents/documents.service';
import {
  ALL_DOMAINS,
  MANUAL_REVIEW_STATUSES,
  REQUIRED_EVIDENCE_BY_DOMAIN,
  TRS_DOMAIN_LABELS,
} from '../documents/constants/evidence';
import type { AppRole } from '../auth/roles';
import {
  ExecutiveReportRepository,
  type ExecutiveReportRow,
} from './executive-report.repository';
import {
  ELIGIBILITY_STATUS_LABELS,
  EXECUTIVE_REPORT_STATUSES,
} from './constants/executive-report-status';
import { ExecutiveReportPdfService } from './executive-report-pdf.service';
import { buildExecutiveReportPdfFilename } from './executive-report-pdf-filename.util';

/** Statuses a PDF may be downloaded for — draft/approved (Admin/Analyst only, enforced by
 *  the caller) and published. Anything else (generation_failed, under_review,
 *  needs_regeneration, ...) is not a complete/valid report to hand out as a document. */
const DOWNLOADABLE_STATUSES: readonly string[] = [
  EXECUTIVE_REPORT_STATUSES.DRAFT,
  EXECUTIVE_REPORT_STATUSES.APPROVED,
  EXECUTIVE_REPORT_STATUSES.PUBLISHED,
];

/** Per-required-category outcome of evaluating a customer's evidence reviews — the shared
 *  building block behind both the eligibility check and generation (so the two can never
 *  disagree about what counts as approved). */
export interface RequiredCategoryReviewStatus {
  domain: string;
  domainLabel: string;
  category: string;
  status: 'approved' | 'missing' | 'pending';
  reason: string;
  documentId: string | null;
  /** The `manual_review.id` or `ai_review_response.id` that made this category "approved" —
   *  null unless `status === 'approved'`. */
  reviewId: string | null;
  reviewSource: 'manual' | 'ai' | null;
}

export interface ExecutiveReportEligibilityResult {
  customerId: string;
  eligible: boolean;
  status: string;
  requiredCategories: number;
  approvedCategories: number;
  missingCategories: string[];
  pendingCategories: string[];
  reason: string;
}

/**
 * What the End User published-report endpoint returns — deliberately a narrow, separate
 * shape from `ExecutiveReportRow`, not that row with fields omitted. Never add a field here
 * without checking it against the ticket's exclusion list (no prompt ids, no source review
 * ids, no provider/model, no generation error, no analyst/internal audit fields).
 */
export interface PdfDownloadResult {
  buffer: Buffer;
  filename: string;
}

export interface EndUserExecutiveReportResult {
  customerId: string;
  reportStatus: string;
  reportVersion: number;
  publishedAt: Date | null;
  publishedBy: string | null;
  reportMarkdown: string | null;
}

/**
 * What the End User TRS Review Progress Dashboard's Executive Report section is allowed to
 * see — deliberately never includes `generatedReportMarkdown` or any other internal field,
 * regardless of `status`, so a draft/approved-but-unpublished report can never leak its
 * content through this shape even by future accident. `status` is the raw internal
 * `EXECUTIVE_REPORT_STATUSES` value (or `'not_ready'` when no report has been generated yet)
 * — the frontend maps it to customer-facing wording in one reusable utility, same convention
 * as `DOCUMENT_STATUS_LABELS`.
 */
export interface EndUserExecutiveReportStatusResult {
  status: string;
  published: boolean;
  publishedAt: Date | null;
  viewReportAvailable: boolean;
  downloadPdfAvailable: boolean;
}

const APPROVED_AI_REVIEW_STATUSES: readonly string[] = [
  ANALYST_REVIEW_STATUSES.ANALYST_ACCEPTED,
  ANALYST_REVIEW_STATUSES.ANALYST_EDITED,
  ANALYST_REVIEW_STATUSES.PUBLISHED_TO_END_USER,
];

const IN_FLIGHT_AI_REQUEST_STATUSES: readonly string[] = [
  AI_REQUEST_STATUSES.PROCESSING,
  AI_REQUEST_STATUSES.NEEDS_RETRY,
];

/**
 * Determines Executive Transformation Readiness Report eligibility and orchestrates
 * generation. Every business rule this depends on is reused, not reimplemented:
 *  - required evidence categories: `REQUIRED_EVIDENCE_BY_DOMAIN` (same constant
 *    `DocumentsService.getEvidenceSummary` already uses)
 *  - document reset/resubmission state: `intake_document.resetRequired`/
 *    `resubmittedDocumentVersionId` (same columns `DocumentsService.resetDocument`/
 *    `resubmitDocument` already manage)
 *  - manual review completion: `manual_review.reviewStatus` (same table
 *    `DocumentsService.createManualReview`/`updateManualReview` already manage)
 *  - AI review analyst workflow: `ai_review_response.analystReviewStatus` (same table
 *    `AiReviewService` already manages)
 *  - the active Master Report prompt: `AiPromptsService.getActiveMasterReportPrompt`
 *  - the OpenRouter call: `OpenRouterClient` (the same class `AiReviewService` uses)
 *
 * There is no persisted `assessment` entity in this codebase — see the `executiveReport`
 * schema doc comment for how `assessmentId` is populated until one exists.
 */
@Injectable()
export class ExecutiveReportService {
  private readonly logger = new Logger(ExecutiveReportService.name);

  constructor(
    private readonly repository: ExecutiveReportRepository,
    private readonly aiPromptsService: AiPromptsService,
    private readonly aiProviderConfigurationsService: AiProviderConfigurationsService,
    private readonly openRouterClient: OpenRouterClient,
    private readonly pdfService: ExecutiveReportPdfService,
  ) {}

  async getEligibility(customerId: string): Promise<ExecutiveReportEligibilityResult> {
    await this.assertCustomerExists(customerId);

    const categoryStatuses = await this.evaluateRequiredCategories(customerId);
    const approved = categoryStatuses.filter((c) => c.status === 'approved');
    const missing = categoryStatuses.filter((c) => c.status === 'missing');
    const pending = categoryStatuses.filter((c) => c.status === 'pending');

    const masterPromptActive = await this.hasActiveMasterReportPrompt();

    const eligible = missing.length === 0 && pending.length === 0 && masterPromptActive;

    let reason: string;
    if (eligible) {
      reason = 'All required evidence categories have completed review.';
    } else if (!masterPromptActive) {
      reason =
        'Executive report cannot be generated until an active Master Transformation Readiness Report prompt exists.';
    } else {
      reason =
        'Executive report cannot be generated until all required evidence categories are approved.';
    }

    return {
      customerId,
      eligible,
      status: eligible ? ELIGIBILITY_STATUS_LABELS.READY : ELIGIBILITY_STATUS_LABELS.NOT_READY,
      requiredCategories: categoryStatuses.length,
      approvedCategories: approved.length,
      missingCategories: missing.map((c) => c.category),
      pendingCategories: pending.map((c) => c.category),
      reason,
    };
  }

  async getLatestReport(customerId: string): Promise<ExecutiveReportRow | null> {
    await this.assertCustomerExists(customerId);
    return this.repository.findLatestByCustomerId(customerId);
  }

  /**
   * Draft -> Approved. Only Admin/Analyst; only a report currently sitting in `draft` with
   * non-empty content can be approved (mirrors the ticket's Draft -> Approved -> Published
   * flow — there is no path back into `draft` from any other status here). Approving does
   * not publish it — those remain two explicit, separate operations (see `publishReport`).
   *
   * The status transition itself happens inside a DB transaction that re-reads the row with
   * `SELECT ... FOR UPDATE` (`ExecutiveReportRepository.findByIdForUpdate`) and re-checks its
   * status before writing. The cheap pre-check above (`findReportForCustomerOrThrow` +
   * `assertApprovable`) exists only to fail fast with a clear error for the common case
   * (already approved, wrong customer, missing report) without opening a transaction; it is
   * not what actually guards against a race. Two concurrent `approve` calls for the same
   * report always serialize on the row lock, so the second one to acquire it re-reads a
   * status of `approved` (written by the first) and is rejected with the same 409 — it can
   * never also flip the report to `approved` a second time or double-stamp
   * `approvedBy`/`approvedAt`.
   */
  async approveReport(
    customerId: string,
    reportId: string,
    initiatedByUserId: string,
    initiatedByRole: AppRole,
  ): Promise<ExecutiveReportRow> {
    this.assertAdminOrAnalyst(initiatedByRole);
    await this.assertCustomerExists(customerId);

    // Fail fast (no transaction needed) for the common not-found/cross-customer/wrong-status
    // cases before paying for a transaction + row lock.
    const report = await this.findReportForCustomerOrThrow(customerId, reportId);
    this.assertApprovable(report);

    return db.transaction(async (tx) => {
      const locked = await this.repository.findByIdForUpdate(reportId, tx);
      if (locked?.customerId !== customerId) {
        throw new NotFoundException('Executive report not found');
      }
      // Re-check under the row lock: a concurrent approval that committed between the
      // pre-check above and acquiring this lock must be caught here, not missed.
      this.assertApprovable(locked);

      const now = new Date();
      return this.repository.update(
        reportId,
        {
          reportStatus: EXECUTIVE_REPORT_STATUSES.APPROVED,
          approvedByUserId: initiatedByUserId,
          approvedAt: now,
          lastUpdatedByUserId: initiatedByUserId,
          lastUpdatedAt: now,
          updatedAt: now,
        },
        tx,
      );
    });
  }

  /**
   * Updates the draft content of an Executive Report — the only mutable field is
   * `generatedReportMarkdown` (see `UpdateExecutiveReportDto`); every other column is
   * system-owned. Only permitted while the report is still `draft` — once it has been
   * approved or published, editing it here would silently invalidate what was actually
   * approved/published, so any other status is rejected with 409 (same convention as
   * `approveReport`/`publishReport`). `updatedBy`/`updatedAt` are always the authenticated
   * caller and the current time — never taken from the request body.
   */
  async updateReport(
    customerId: string,
    reportId: string,
    generatedReportMarkdown: string,
    initiatedByUserId: string,
    initiatedByRole: AppRole,
  ): Promise<ExecutiveReportRow> {
    this.assertAdminOrAnalyst(initiatedByRole);
    await this.assertCustomerExists(customerId);
    const report = await this.findReportForCustomerOrThrow(customerId, reportId);

    if (report.reportStatus !== EXECUTIVE_REPORT_STATUSES.DRAFT) {
      throw new ConflictException(
        `Only a draft report can be updated (current status: ${report.reportStatus})`,
      );
    }

    const now = new Date();
    return this.repository.update(reportId, {
      generatedReportMarkdown,
      lastUpdatedByUserId: initiatedByUserId,
      lastUpdatedAt: now,
      updatedAt: now,
    });
  }

  /** Shared by the pre-check and the in-transaction re-check in `approveReport`. */
  private assertApprovable(report: ExecutiveReportRow): void {
    if (report.reportStatus !== EXECUTIVE_REPORT_STATUSES.DRAFT) {
      throw new ConflictException(
        `Only a draft report can be approved (current status: ${report.reportStatus})`,
      );
    }
    if (!report.generatedReportMarkdown || report.generatedReportMarkdown.trim().length === 0) {
      throw new ConflictException('Report has no content to approve');
    }
  }

  /**
   * Approved -> Published. Only Admin/Analyst; only a report currently `approved` can be
   * published — this is the backend enforcement the ticket requires regardless of what the
   * frontend does or doesn't disable. Publishing a `draft`, `generation_failed`,
   * `under_review`, `needs_regeneration`, or already-`published` report is rejected with the
   * same 409, including re-publishing an already-published report (no idempotent no-op —
   * consistent with how this codebase treats other already-done mutations, e.g.
   * `DocumentsService.createManualReview`'s duplicate check).
   *
   * Same transactional row-lock pattern as `approveReport`: the cheap pre-check below
   * (`findReportForCustomerOrThrow` + `assertPublishable`) fails fast for the common
   * not-found/cross-customer/wrong-status cases without opening a transaction, but the actual
   * guarantee against a race comes from re-reading the row with `SELECT ... FOR UPDATE`
   * (`ExecutiveReportRepository.findByIdForUpdate`) inside `db.transaction` and re-checking its
   * status before writing. Two concurrent `publish` calls for the same report always serialize
   * on the row lock, so the second one to acquire it re-reads a status of `published` (written
   * by the first) and is rejected with the same 409 — it can never also flip the report to
   * `published` a second time or double-stamp `publishedBy`/`publishedAt`. Never touches
   * `approvedByUserId`/`approvedAt` — those remain exactly as `approveReport` set them.
   */
  async publishReport(
    customerId: string,
    reportId: string,
    initiatedByUserId: string,
    initiatedByRole: AppRole,
  ): Promise<ExecutiveReportRow> {
    this.assertAdminOrAnalyst(initiatedByRole);
    await this.assertCustomerExists(customerId);

    // Fail fast (no transaction needed) for the common not-found/cross-customer/wrong-status
    // cases before paying for a transaction + row lock.
    const report = await this.findReportForCustomerOrThrow(customerId, reportId);
    this.assertPublishable(report);

    return db.transaction(async (tx) => {
      const locked = await this.repository.findByIdForUpdate(reportId, tx);
      if (locked?.customerId !== customerId) {
        throw new NotFoundException('Executive report not found');
      }
      // Re-check under the row lock: a concurrent publish that committed between the
      // pre-check above and acquiring this lock must be caught here, not missed.
      this.assertPublishable(locked);

      const now = new Date();
      return this.repository.update(
        reportId,
        {
          reportStatus: EXECUTIVE_REPORT_STATUSES.PUBLISHED,
          publishedByUserId: initiatedByUserId,
          publishedAt: now,
          lastUpdatedByUserId: initiatedByUserId,
          lastUpdatedAt: now,
          updatedAt: now,
        },
        tx,
      );
    });
  }

  /** Shared by the pre-check and the in-transaction re-check in `publishReport`. */
  private assertPublishable(report: ExecutiveReportRow): void {
    if (report.reportStatus !== EXECUTIVE_REPORT_STATUSES.APPROVED) {
      throw new ConflictException(
        `Only an approved report can be published (current status: ${report.reportStatus})`,
      );
    }
    if (!report.generatedReportMarkdown || report.generatedReportMarkdown.trim().length === 0) {
      throw new ConflictException('Report has no content to publish');
    }
  }

  /**
   * The End User's own published Executive Report — customer identity comes solely from
   * `endUserId` (the authenticated session's own user id), never from a request parameter;
   * see the controller, which never accepts a customerId from the End User at all. Returns
   * `null` when nothing is published yet — including when a report exists but is only
   * `draft`/`approved`, which must remain invisible to the End User (ticket §9). Because
   * `ExecutiveReportRepository.findLatestPublishedByCustomerId` filters on
   * `reportStatus = 'published'` specifically (not "latest report overall"), a newer draft
   * generated after this version was published never shadows it — see ticket §10/§11.
   */
  async getPublishedReportForEndUser(endUserId: string): Promise<EndUserExecutiveReportResult | null> {
    const report = await this.repository.findLatestPublishedByCustomerId(endUserId);
    if (!report) return null;

    return {
      customerId: report.customerId,
      reportStatus: report.reportStatus,
      reportVersion: report.reportVersion,
      publishedAt: report.publishedAt,
      publishedBy: report.publishedByName,
      reportMarkdown: report.generatedReportMarkdown,
    };
  }

  /**
   * The End User's Executive Report *status* — unlike `getPublishedReportForEndUser`, this
   * looks at the customer's latest report regardless of status (via
   * `findLatestByCustomerId`, the same lookup Admin/Analyst screens use), so the dashboard can
   * show "Report Being Prepared" / "Report Under Internal Review" / "Report Approved" instead
   * of nothing at all while a report is in flight. It still never returns report content —
   * only a status string and availability flags — so this stays safe to call regardless of
   * how far along the report is.
   */
  async getReportStatusForEndUser(endUserId: string): Promise<EndUserExecutiveReportStatusResult> {
    const report = await this.repository.findLatestByCustomerId(endUserId);
    const published = report?.reportStatus === EXECUTIVE_REPORT_STATUSES.PUBLISHED;

    return {
      status: report?.reportStatus ?? EXECUTIVE_REPORT_STATUSES.NOT_READY,
      published,
      publishedAt: published ? (report?.publishedAt ?? null) : null,
      // Only a published report may ever be viewed/downloaded by the End User — mirrors
      // `getPublishedReportForEndUser`/`downloadPublishedReportPdfForEndUser`, which are the
      // only routes that actually serve report content or a PDF to this role.
      viewReportAvailable: published,
      downloadPdfAvailable: published,
    };
  }

  /**
   * Admin/Analyst PDF download — draft, approved, or published reports may all be
   * downloaded internally; anything else (generation_failed, under_review,
   * needs_regeneration) is rejected with the same 409 used elsewhere for an invalid status
   * transition. Never calls OpenRouter/AI — this only renders the already-stored
   * `generatedReportMarkdown`, via `ExecutiveReportPdfService`.
   */
  async downloadReportPdf(
    customerId: string,
    reportId: string,
    initiatedByRole: AppRole,
  ): Promise<PdfDownloadResult> {
    this.assertAdminOrAnalyst(initiatedByRole);
    await this.assertCustomerExists(customerId);
    const report = await this.findReportForCustomerOrThrow(customerId, reportId);

    if (!DOWNLOADABLE_STATUSES.includes(report.reportStatus)) {
      throw new ConflictException(
        `Report cannot be downloaded in its current status (${report.reportStatus})`,
      );
    }

    const customerName = (await this.repository.findCustomerNameById(customerId)) ?? customerId;
    const buffer = await this.pdfService.renderExecutiveReportPdf(
      {
        reportVersion: report.reportVersion,
        reportStatus: report.reportStatus,
        generatedReportMarkdown: report.generatedReportMarkdown,
        publishedAt: report.publishedAt,
      },
      customerName,
    );
    const filename = buildExecutiveReportPdfFilename(customerName, report.reportVersion, report.reportStatus);

    return { buffer, filename };
  }

  /**
   * End User PDF download — customer identity comes solely from `endUserId` (the
   * authenticated session's own id), exactly like `getPublishedReportForEndUser`, whose
   * published-only lookup this reuses wholesale rather than re-deriving "what counts as the
   * current published report" a second time.
   */
  async downloadPublishedReportPdfForEndUser(endUserId: string): Promise<PdfDownloadResult> {
    const report = await this.repository.findLatestPublishedByCustomerId(endUserId);
    if (!report) {
      throw new NotFoundException('No published Executive Report is available yet');
    }

    const customerName = (await this.repository.findCustomerNameById(endUserId)) ?? endUserId;
    const buffer = await this.pdfService.renderExecutiveReportPdf(
      {
        reportVersion: report.reportVersion,
        reportStatus: report.reportStatus,
        generatedReportMarkdown: report.generatedReportMarkdown,
        publishedAt: report.publishedAt,
      },
      customerName,
    );
    const filename = buildExecutiveReportPdfFilename(customerName, report.reportVersion, report.reportStatus);

    return { buffer, filename };
  }

  private assertAdminOrAnalyst(role: AppRole): void {
    if (role !== 'admin' && role !== 'analyst') {
      throw new ForbiddenException('Only Admin or Analyst users may perform this action');
    }
  }

  /**
   * Looks up a report by id and confirms it belongs to `customerId` — a report belonging to
   * a different customer is reported as NotFound, not Forbidden, so a caller can't use this
   * endpoint to probe whether a given reportId exists under another customer (ticket §5/§12).
   */
  private async findReportForCustomerOrThrow(
    customerId: string,
    reportId: string,
  ): Promise<ExecutiveReportRow> {
    const report = await this.repository.findById(reportId);
    if (report?.customerId !== customerId) {
      throw new NotFoundException('Executive report not found');
    }
    return report;
  }

  async generateReport(
    customerId: string,
    initiatedByUserId: string,
    initiatedByRole: AppRole,
  ): Promise<ExecutiveReportRow> {
    // Only Admin/Analyst may generate an Executive Report. Defense in depth — the
    // controller route is expected to also guard itself with RolesGuard.
    if (initiatedByRole !== 'admin' && initiatedByRole !== 'analyst') {
      throw new ForbiddenException('Only Admin or Analyst users may generate an Executive Report');
    }

    // Eligibility gate — reject generation outright when any required category is missing
    // or pending, or no active Master Report prompt exists. Never reaches OpenRouter below
    // this point unless every one of those checks passed.
    const eligibility = await this.getEligibility(customerId);
    if (!eligibility.eligible) {
      throw new BadRequestException(eligibility.reason);
    }

    const categoryStatuses = await this.evaluateRequiredCategories(customerId);
    const approvedCategories = categoryStatuses.filter((c) => c.status === 'approved');
    if (approvedCategories.length !== categoryStatuses.length) {
      // Eligibility just reported every category approved — a stale/racing read here is a
      // contract violation, not a normal ineligibility outcome.
      throw new InternalServerErrorException(
        'Executive report eligibility changed since it was last checked',
      );
    }

    let masterPrompt: ActivePromptResult;
    try {
      masterPrompt = await this.aiPromptsService.getActiveMasterReportPrompt();
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new BadRequestException(
          'No active Master Transformation Readiness Report prompt exists',
        );
      }
      throw error;
    }

    const providerConfig = await this.aiProviderConfigurationsService.getActiveConfigForExecution();
    if (!providerConfig) {
      throw new InternalServerErrorException('No active AI provider configuration is set up');
    }

    const documentContent = (
      await Promise.all(approvedCategories.map((category) => this.buildCategorySection(category)))
    ).join('\n\n---\n\n');
    const sourceReviewIds = approvedCategories
      .map((category) => category.reviewId)
      .filter((id): id is string => id !== null);

    const reportVersion = await this.repository.findNextVersionNumber(customerId);
    const createdAt = new Date();

    const result = await this.openRouterClient.executeReview({
      promptContent: masterPrompt.activeVersion.promptContent,
      documentContent,
      model: providerConfig.defaultModel,
    });

    if (!result.ok) {
      const failedAt = new Date();
      await this.repository.insert({
        id: randomUUID(),
        customerId,
        assessmentId: customerId,
        reportVersion,
        reportStatus: EXECUTIVE_REPORT_STATUSES.GENERATION_FAILED,
        masterPromptId: masterPrompt.template.id,
        masterPromptVersionId: masterPrompt.activeVersion.id,
        provider: providerConfig.providerType,
        model: providerConfig.defaultModel,
        generatedReportMarkdown: null,
        sourceReviewIds,
        generatedByUserId: initiatedByUserId,
        generatedAt: failedAt,
        approvedByUserId: null,
        approvedAt: null,
        publishedByUserId: null,
        publishedAt: null,
        lastUpdatedByUserId: initiatedByUserId,
        lastUpdatedAt: failedAt,
        generationErrorMessage: result.errorMessage,
        createdAt,
        updatedAt: failedAt,
      });
      this.logger.warn(
        `Executive report generation failed for customer ${customerId}: ${result.errorMessage}`,
      );
      throw new InternalServerErrorException(result.errorMessage);
    }

    const completedAt = new Date();
    return this.repository.insert({
      id: randomUUID(),
      customerId,
      assessmentId: customerId,
      reportVersion,
      reportStatus: EXECUTIVE_REPORT_STATUSES.DRAFT,
      masterPromptId: masterPrompt.template.id,
      masterPromptVersionId: masterPrompt.activeVersion.id,
      provider: result.provider,
      model: result.model,
      generatedReportMarkdown: result.content,
      sourceReviewIds,
      generatedByUserId: initiatedByUserId,
      generatedAt: completedAt,
      approvedByUserId: null,
      approvedAt: null,
      publishedByUserId: null,
      publishedAt: null,
      lastUpdatedByUserId: initiatedByUserId,
      lastUpdatedAt: completedAt,
      generationErrorMessage: null,
      createdAt,
      updatedAt: completedAt,
    });
  }

  private async assertCustomerExists(customerId: string): Promise<void> {
    const customer = await this.repository.findCustomerById(customerId);
    if (!customer) throw new NotFoundException('Customer not found');
  }

  private async hasActiveMasterReportPrompt(): Promise<boolean> {
    try {
      await this.aiPromptsService.getActiveMasterReportPrompt();
      return true;
    } catch (error) {
      if (error instanceof NotFoundException) return false;
      throw error;
    }
  }

  /**
   * Evaluates every required evidence category (across all TRS domains) for a customer.
   * Only the latest valid review per category is considered:
   *  - the "current" document for a category is the one no later resubmission has
   *    superseded (`resubmittedDocumentVersionId` is null) — a reset-but-not-yet-resubmitted
   *    document is still "current" and is explicitly excluded from counting as approved
   *  - within that document, the latest `ai_review_response` (by `createdAt`) is what
   *    counts — so a rejected review followed by a newer accepted re-run counts as approved,
   *    while a rejected review that is itself the latest does not
   */
  private async evaluateRequiredCategories(
    customerId: string,
  ): Promise<RequiredCategoryReviewStatus[]> {
    const docs = await this.repository.findDocumentsForCustomer(customerId);

    const results: RequiredCategoryReviewStatus[] = [];

    for (const domain of ALL_DOMAINS) {
      const requiredCategories = REQUIRED_EVIDENCE_BY_DOMAIN[domain] ?? [];
      for (const category of requiredCategories) {
        const categoryDocs = docs.filter(
          (d) => d.trsDomain === domain && d.evidenceCategory === category,
        );
        const current =
          categoryDocs
            .filter((d) => !d.resubmittedDocumentVersionId)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;

        results.push(await this.evaluateCategory(domain, category, current));
      }
    }

    return results;
  }

  private async evaluateCategory(
    domain: string,
    category: string,
    doc: IntakeDocument | null,
  ): Promise<RequiredCategoryReviewStatus> {
    const domainLabel = TRS_DOMAIN_LABELS[domain] ?? domain;
    const base = { domain, domainLabel, category };

    if (!doc) {
      return {
        ...base,
        status: 'missing',
        reason: 'No evidence submitted for this category',
        documentId: null,
        reviewId: null,
        reviewSource: null,
      };
    }

    if (doc.resetRequired) {
      return {
        ...base,
        status: 'missing',
        reason: 'Evidence document was reset and is awaiting resubmission',
        documentId: doc.id,
        reviewId: null,
        reviewSource: null,
      };
    }

    const manual: ManualReview | null = await this.repository.findManualReviewByDocumentId(doc.id);

    if (manual?.reviewStatus === MANUAL_REVIEW_STATUSES.COMPLETED) {
      return {
        ...base,
        status: 'approved',
        reason: 'Manual review completed',
        documentId: doc.id,
        reviewId: manual.id,
        reviewSource: 'manual',
      };
    }

    const latestAiResponse: AiReviewResponseRow | null =
      await this.repository.findLatestAiReviewResponseByDocumentId(doc.id);

    if (latestAiResponse) {
      if (APPROVED_AI_REVIEW_STATUSES.includes(latestAiResponse.analystReviewStatus)) {
        return {
          ...base,
          status: 'approved',
          reason: `AI review ${latestAiResponse.analystReviewStatus.replace(/_/g, ' ')}`,
          documentId: doc.id,
          reviewId: latestAiResponse.id,
          reviewSource: 'ai',
        };
      }
      if (latestAiResponse.analystReviewStatus === ANALYST_REVIEW_STATUSES.ANALYST_REJECTED) {
        return {
          ...base,
          status: 'missing',
          reason: 'Latest AI review was rejected by an Analyst',
          documentId: doc.id,
          reviewId: null,
          reviewSource: null,
        };
      }
      // ai_generated / analyst_review_needed — completed by the AI, not yet actioned.
      return {
        ...base,
        status: 'pending',
        reason: 'AI review is awaiting Analyst action',
        documentId: doc.id,
        reviewId: latestAiResponse.id,
        reviewSource: 'ai',
      };
    }

    const latestRequest = await this.repository.findLatestAiReviewRequestByDocumentId(doc.id);
    if (latestRequest && IN_FLIGHT_AI_REQUEST_STATUSES.includes(latestRequest.status)) {
      return {
        ...base,
        status: 'pending',
        reason: 'AI review is in progress',
        documentId: doc.id,
        reviewId: null,
        reviewSource: null,
      };
    }

    if (manual) {
      // A manual review exists but hasn't been completed yet.
      return {
        ...base,
        status: 'pending',
        reason: 'Manual review is in progress',
        documentId: doc.id,
        reviewId: null,
        reviewSource: null,
      };
    }

    return {
      ...base,
      status: 'missing',
      reason: 'No completed review exists for this evidence category',
      documentId: doc.id,
      reviewId: null,
      reviewSource: null,
    };
  }

  /**
   * Renders one required category's approved review into a markdown section for the Master
   * Report prompt's input — using the existing database fields/structure (manual_review's
   * plain columns, or ai_review_response's parsed findings + its own queryable columns), not
   * inventing duplicate fields (see ticket §6/§7).
   */
  private async buildCategorySection(category: RequiredCategoryReviewStatus): Promise<string> {
    if (category.reviewSource === 'manual' && category.reviewId) {
      const review = await this.repository.findManualReviewById(category.reviewId);
      if (!review) {
        throw new InternalServerErrorException(
          `Manual review ${category.reviewId} referenced by eligibility could not be found`,
        );
      }
      return formatManualReviewSection(category, review);
    }

    if (category.reviewSource === 'ai' && category.reviewId) {
      const review = await this.repository.findAiReviewResponseById(category.reviewId);
      if (!review) {
        throw new InternalServerErrorException(
          `AI review response ${category.reviewId} referenced by eligibility could not be found`,
        );
      }
      return formatAiReviewSection(category, review);
    }

    throw new InternalServerErrorException(
      `Approved category "${category.category}" has no source review recorded`,
    );
  }
}

function field(label: string, value: string | null | undefined): string {
  return `**${label}:** ${value && value.trim().length > 0 ? value : '_Not provided_'}`;
}

function listField(label: string, values: readonly string[] | null | undefined): string {
  if (!values || values.length === 0) return `**${label}:** _Not provided_`;
  return `**${label}:**\n${values.map((v) => `- ${v}`).join('\n')}`;
}

function sectionHeader(category: RequiredCategoryReviewStatus): string {
  return `## ${category.domainLabel} — ${category.category}`;
}

function formatManualReviewSection(
  category: RequiredCategoryReviewStatus,
  review: ManualReview,
): string {
  return [
    sectionHeader(category),
    field('TRS Domain', category.domainLabel),
    field('Evidence Category', category.category),
    field('Executive Summary', review.executiveSummary),
    field('Document Quality Review', review.documentQualityReview),
    field('Readiness Findings', review.readinessFindings),
    field('Evidence Gaps', review.evidenceGaps),
    field('Human Validation Questions', review.humanValidationQuestions),
    field('Suggested Next Steps', review.suggestedNextSteps),
    field('Draft Analyst Finding', review.draftAnalystFinding),
    field('Limitations and Uncertainties', review.limitations),
    field('Evidence Sufficiency', review.evidenceSufficiency),
    field('Reviewer Confidence', review.reviewerConfidence),
    field('Primary Color Indicator', review.primaryColorIndicator),
    field('Recommended Analyst Action', review.recommendedAnalystAction),
    field('Review Source', review.reviewSource),
    field('Review Status', review.reviewStatus),
  ].join('\n\n');
}

function formatAiReviewSection(
  category: RequiredCategoryReviewStatus,
  review: AiReviewResponseRow,
): string {
  const findings = review.parsedFindings;
  return [
    sectionHeader(category),
    field('TRS Domain', category.domainLabel),
    field('Evidence Category', category.category),
    field('Executive Summary', findings?.executiveSummary ?? review.structuredMarkdownResponse),
    field('Document Quality Review', findings?.documentQualityReview),
    listField('Readiness Findings', findings?.systemOfRecordReadinessFindings),
    listField('Evidence Gaps', findings?.evidenceGaps),
    listField('Human Validation Questions', findings?.humanValidationQuestions),
    listField('Suggested Next Steps', findings?.suggestedNextSteps),
    field('Draft Analyst Finding', findings?.draftAnalystFinding),
    field('Limitations and Uncertainties', findings?.limitationsAndUncertainties),
    field('Evidence Sufficiency', review.evidenceSufficiency),
    field('Reviewer Confidence', review.aiConfidence),
    field('Primary Color Indicator', review.primaryColorIndicator),
    field('Recommended Analyst Action', review.recommendedAnalystAction),
    field('Review Source', 'ai'),
    field('Review Status', review.analystReviewStatus),
  ].join('\n\n');
}
