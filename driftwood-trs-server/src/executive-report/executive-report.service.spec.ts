jest.mock('../db', () => ({
  db: {
    transaction: jest.fn((cb: (tx: unknown) => unknown) => cb({})),
  },
}));

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import type { AiReviewRequestRow, AiReviewResponseRow } from '../ai-review/ai-review.repository';
import { ANALYST_REVIEW_STATUSES } from '../ai-review/constants/ai-review-status';
import type { AiPromptsService } from '../ai-prompts/ai-prompts.service';
import { PROMPT_STATUSES } from '../ai-prompts/constants/prompt-status';
import { PROMPT_TYPES } from '../ai-prompts/constants/prompt-type';
import type { AiProviderConfigurationsService } from '../ai-provider-configurations/ai-provider-configurations.service';
import type { DecryptedAiProviderConfiguration } from '../ai-provider-configurations/ai-provider-configurations.types';
import type {
  OpenRouterClient,
  OpenRouterReviewResult,
} from '../ai-provider-configurations/providers/openrouter-client';
import type { IntakeDocument, ManualReview } from '../documents/documents.service';
import { MANUAL_REVIEW_STATUSES } from '../documents/constants/evidence';
import type { ExecutiveReportRepository, ExecutiveReportRow } from './executive-report.repository';
import { EXECUTIVE_REPORT_STATUSES } from './constants/executive-report-status';
import type { ExecutiveReportPdfService } from './executive-report-pdf.service';
import { ExecutiveReportService } from './executive-report.service';

const REQUIRED_CATEGORIES: { domain: string; category: string }[] = [
  { domain: 'data_integrity_trust', category: 'System of Record Documentation' },
  { domain: 'data_integrity_trust', category: 'Data Ownership / Stewardship' },
  { domain: 'data_integrity_trust', category: 'Data Definitions / Data Dictionary' },
  { domain: 'data_integrity_trust', category: 'Executive Reporting' },
  { domain: 'data_integrity_trust', category: 'Report Lineage / Source Mapping' },
  { domain: 'governance_decision_rights', category: 'Governance Charter' },
  { domain: 'governance_decision_rights', category: 'Decision Rights / RACI' },
  { domain: 'governance_decision_rights', category: 'Steering Committee Materials' },
  { domain: 'governance_decision_rights', category: 'Decision Log' },
  { domain: 'governance_decision_rights', category: 'Escalation Process' },
];

function makeDoc(index: number, overrides: Partial<IntakeDocument> = {}): IntakeDocument {
  const entry = REQUIRED_CATEGORIES[index];
  if (!entry) throw new Error(`No required category fixture at index ${String(index)}`);
  const { domain, category } = entry;
  return {
    id: `doc-${String(index)}`,
    uploadedBy: 'customer-1',
    fileName: `evidence-${String(index)}.txt`,
    fileType: 'text/plain',
    s3Key: `uploads/evidence-${String(index)}.txt`,
    fileSize: 100,
    trsDomain: domain,
    evidenceCategory: category,
    evidenceType: 'required',
    notes: null,
    status: 'analyst_reviewed',
    aiReviewStatus: 'completed',
    analystId: 'analyst-1',
    sufficiencyRating: null,
    analystValidationStatus: null,
    publishedAt: null,
    resetRequired: false,
    resetReason: null,
    requestedCorrection: null,
    resetByUserId: null,
    resetByName: null,
    resetAt: null,
    resetDueDate: null,
    previousDocumentVersionId: null,
    resubmittedDocumentVersionId: null,
    deletedAt: null,
    createdAt: new Date(2026, 0, index + 1),
    updatedAt: new Date(2026, 0, index + 1),
    ...overrides,
  };
}

function makeManualReview(index: number, overrides: Partial<ManualReview> = {}): ManualReview {
  return {
    id: `manual-review-${String(index)}`,
    documentId: `doc-${String(index)}`,
    reviewedBy: 'analyst-1',
    reviewSource: 'manual',
    reviewStatus: MANUAL_REVIEW_STATUSES.COMPLETED,
    executiveSummary: 'Executive summary',
    documentQualityReview: 'Good quality',
    readinessFindings: 'Readiness findings',
    evidenceGaps: 'None',
    humanValidationQuestions: 'None',
    suggestedNextSteps: 'None',
    draftAnalystFinding: 'Draft finding',
    limitations: 'None',
    evidenceSufficiency: 'strong',
    reviewerConfidence: 'high',
    primaryColorIndicator: 'Green',
    recommendedAnalystAction: 'accept',
    createdAt: new Date(2026, 0, index + 1),
    updatedAt: new Date(2026, 0, index + 1),
    ...overrides,
  };
}

function makeExecutiveReport(overrides: Partial<ExecutiveReportRow> = {}): ExecutiveReportRow {
  return {
    id: 'report-1',
    customerId: 'customer-1',
    assessmentId: 'customer-1',
    reportVersion: 1,
    reportStatus: EXECUTIVE_REPORT_STATUSES.DRAFT,
    masterPromptId: 'template-1',
    masterPromptVersionId: 'version-1',
    provider: 'openrouter',
    model: 'openai/gpt-4o',
    generatedReportMarkdown: '# Executive Transformation Readiness Report',
    sourceReviewIds: ['manual-review-0'],
    generatedByUserId: 'analyst-1',
    generatedAt: new Date(2026, 0, 1),
    approvedByUserId: null,
    approvedAt: null,
    publishedByUserId: null,
    publishedAt: null,
    lastUpdatedByUserId: 'analyst-1',
    lastUpdatedAt: new Date(2026, 0, 1),
    generationErrorMessage: null,
    createdAt: new Date(2026, 0, 1),
    updatedAt: new Date(2026, 0, 1),
    ...overrides,
  };
}

function makeAiReviewResponse(
  index: number,
  overrides: Partial<AiReviewResponseRow> = {},
): AiReviewResponseRow {
  return {
    id: `ai-response-${String(index)}`,
    requestId: `ai-request-${String(index)}`,
    documentId: `doc-${String(index)}`,
    rawResponse: { id: 'chatcmpl-1' },
    structuredMarkdownResponse: 'Structured review output',
    parsedFindings: {
      executiveSummary: 'AI executive summary',
      documentQualityReview: 'AI document quality review',
      systemOfRecordReadinessFindings: ['Finding 1'],
      evidenceGaps: ['Gap 1'],
      humanValidationQuestions: ['Question 1'],
      suggestedNextSteps: ['Step 1'],
      draftAnalystFinding: 'AI draft finding',
      limitationsAndUncertainties: 'None',
    },
    evidenceSufficiency: 'strong',
    aiConfidence: 'high',
    primaryColorIndicator: 'Green',
    recommendedAnalystAction: 'accept',
    analystReviewStatus: ANALYST_REVIEW_STATUSES.ANALYST_ACCEPTED,
    createdAt: new Date(2026, 0, index + 1),
    updatedAt: new Date(2026, 0, index + 1),
    ...overrides,
  };
}

const baseMasterTemplate = {
  id: 'master-template-1',
  promptName: 'Master Transformation Readiness Report',
  promptDescription: null,
  trsDomainId: null,
  evidenceCategoryId: null,
  promptType: PROMPT_TYPES.MASTER_TRANSFORMATION_READINESS_REPORT,
  status: PROMPT_STATUSES.ACTIVE,
  activeVersionId: 'master-version-1',
  createdByUserId: null,
  updatedByUserId: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  deletedAt: null,
};

const baseMasterVersion = {
  id: 'master-version-1',
  promptTemplateId: 'master-template-1',
  versionNumber: 1,
  versionLabel: 'v1.0',
  promptContent: 'You are generating a Master Transformation Readiness Report...',
  outputFormat: 'markdown',
  status: PROMPT_STATUSES.ACTIVE,
  isActive: true,
  changeSummary: null,
  createdByUserId: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  activatedByUserId: null,
  activatedAt: new Date('2026-01-01T00:00:00Z'),
  archivedByUserId: null,
  archivedAt: null,
  deletedAt: null,
};

const baseProviderConfig: DecryptedAiProviderConfiguration = {
  id: 'config-1',
  providerName: 'OpenRouter',
  providerType: 'openrouter',
  gatewayType: null,
  baseUrl: 'https://openrouter.ai/api/v1',
  apiKeyLastFour: '7890',
  apiKey: 'sk-or-fake',
  defaultModel: 'openai/gpt-4o',
  fallbackModel: null,
  environment: 'production',
  responseFormat: 'markdown',
  timeoutSeconds: 30,
  maxTokens: 4000,
  isActive: true,
  supportsMultipleModels: false,
  supportsFallback: false,
  connectionStatus: 'connected',
  lastConnectionTestAt: null,
  lastConnectionTestResult: null,
  lastConnectionError: null,
  createdByUserId: null,
  updatedByUserId: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

const openRouterSuccess: OpenRouterReviewResult = {
  ok: true,
  provider: 'openrouter',
  model: 'openai/gpt-4o',
  content: '# Executive Transformation Readiness Report\n\nOverall readiness: Green.',
  rawResponse: { id: 'chatcmpl-master-1' },
};

describe('ExecutiveReportService', () => {
  let repository: jest.Mocked<ExecutiveReportRepository>;
  let aiPromptsService: jest.Mocked<Pick<AiPromptsService, 'getActiveMasterReportPrompt'>>;
  let aiProviderConfigurationsService: jest.Mocked<
    Pick<AiProviderConfigurationsService, 'getActiveConfigForExecution'>
  >;
  let openRouterClient: jest.Mocked<Pick<OpenRouterClient, 'executeReview'>>;
  let pdfService: jest.Mocked<Pick<ExecutiveReportPdfService, 'renderExecutiveReportPdf'>>;
  let service: ExecutiveReportService;

  // Per-document overrides for the 10 required categories' reviews. `null` in a map means
  // "nothing recorded" — reset before every test, populated to "all approved via manual
  // review" as the default baseline, then overridden per test.
  let manualReviewsByDoc: Map<string, ManualReview | null>;
  let aiResponsesByDoc: Map<string, AiReviewResponseRow | null>;
  let aiRequestsByDoc: Map<string, AiReviewRequestRow | null>;
  let docs: IntakeDocument[];

  beforeEach(() => {
    docs = REQUIRED_CATEGORIES.map((_, index) => makeDoc(index));
    manualReviewsByDoc = new Map(
      REQUIRED_CATEGORIES.map((_, index) => [`doc-${String(index)}`, makeManualReview(index)]),
    );
    aiResponsesByDoc = new Map(
      REQUIRED_CATEGORIES.map((_, index) => [`doc-${String(index)}`, null]),
    );
    aiRequestsByDoc = new Map(
      REQUIRED_CATEGORIES.map((_, index) => [`doc-${String(index)}`, null]),
    );
    const findByIdMock = jest.fn().mockResolvedValue(null);

    repository = {
      insert: jest.fn().mockImplementation((values: unknown) => ({
        ...(values as Record<string, unknown>),
      })),
      findLatestByCustomerId: jest.fn().mockResolvedValue(null),
      findNextVersionNumber: jest.fn().mockResolvedValue(1),
      findCustomerById: jest.fn().mockResolvedValue({ id: 'customer-1' }),
      findDocumentsForCustomer: jest.fn().mockImplementation(() => Promise.resolve(docs)),
      findManualReviewByDocumentId: jest
        .fn()
        .mockImplementation((documentId: string) =>
          Promise.resolve(manualReviewsByDoc.get(documentId) ?? null),
        ),
      findManualReviewById: jest.fn().mockImplementation((reviewId: string) => {
        const review = [...manualReviewsByDoc.values()].find((r) => r?.id === reviewId);
        return Promise.resolve(review ?? null);
      }),
      findLatestAiReviewResponseByDocumentId: jest
        .fn()
        .mockImplementation((documentId: string) =>
          Promise.resolve(aiResponsesByDoc.get(documentId) ?? null),
        ),
      findAiReviewResponseById: jest.fn().mockImplementation((reviewId: string) => {
        const review = [...aiResponsesByDoc.values()].find((r) => r?.id === reviewId);
        return Promise.resolve(review ?? null);
      }),
      findLatestAiReviewRequestByDocumentId: jest
        .fn()
        .mockImplementation((documentId: string) =>
          Promise.resolve(aiRequestsByDoc.get(documentId) ?? null),
        ),
      // `findByIdForUpdate` is the same mock function as `findById` — approveReport's
      // in-transaction row-lock re-read is expected to see exactly whatever `findById` was
      // set up to return, so tests only ever need to stub one of them.
      findById: findByIdMock,
      findByIdForUpdate: findByIdMock,
      update: jest.fn().mockImplementation((id: string, values: unknown) => ({
        id,
        ...(values as Record<string, unknown>),
      })),
      findLatestPublishedByCustomerId: jest.fn().mockResolvedValue(null),
      findCustomerNameById: jest.fn().mockResolvedValue('Demo Customer'),
    };

    pdfService = {
      renderExecutiveReportPdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-fake')),
    };

    aiPromptsService = {
      getActiveMasterReportPrompt: jest
        .fn()
        .mockResolvedValue({ template: baseMasterTemplate, activeVersion: baseMasterVersion }),
    };
    aiProviderConfigurationsService = {
      getActiveConfigForExecution: jest.fn().mockResolvedValue(baseProviderConfig),
    };
    openRouterClient = { executeReview: jest.fn().mockResolvedValue(openRouterSuccess) };

    service = new ExecutiveReportService(
      repository,
      aiPromptsService as unknown as AiPromptsService,
      aiProviderConfigurationsService as unknown as AiProviderConfigurationsService,
      openRouterClient as unknown as OpenRouterClient,
      pdfService as unknown as ExecutiveReportPdfService,
    );
  });

  // ================= Test 1 =================
  it('is eligible when all required evidence categories have approved reviews', async () => {
    const result = await service.getEligibility('customer-1');

    expect(result).toEqual({
      customerId: 'customer-1',
      eligible: true,
      status: 'Ready to Generate',
      requiredCategories: 10,
      approvedCategories: 10,
      missingCategories: [],
      pendingCategories: [],
      reason: 'All required evidence categories have completed review.',
    });
  });

  // ================= Test 2 =================
  it('is ineligible when one required category is missing', async () => {
    docs = docs.filter((d) => d.evidenceCategory !== 'Decision Log');
    manualReviewsByDoc.delete('doc-8'); // Decision Log is index 8

    const result = await service.getEligibility('customer-1');

    expect(result.eligible).toBe(false);
    expect(result.status).toBe('Not Ready');
    expect(result.approvedCategories).toBe(9);
    expect(result.missingCategories).toContain('Decision Log');
    expect(result.reason).toBe(
      'Executive report cannot be generated until all required evidence categories are approved.',
    );
  });

  // ================= Test 3 =================
  it('is ineligible when one required category is pending', async () => {
    // Escalation Process (index 9) has an AI review that hasn't been actioned yet.
    manualReviewsByDoc.delete('doc-9');
    aiResponsesByDoc.set(
      'doc-9',
      makeAiReviewResponse(9, { analystReviewStatus: ANALYST_REVIEW_STATUSES.AI_GENERATED }),
    );

    const result = await service.getEligibility('customer-1');

    expect(result.eligible).toBe(false);
    expect(result.pendingCategories).toContain('Escalation Process');
  });

  // ================= Test 4 =================
  it('is ineligible when a required document is reset and awaiting resubmission', async () => {
    docs = docs.map((d) =>
      d.evidenceCategory === 'Governance Charter' ? { ...d, resetRequired: true } : d,
    );

    const result = await service.getEligibility('customer-1');

    expect(result.eligible).toBe(false);
    expect(result.missingCategories).toContain('Governance Charter');
  });

  // ================= Test 5 =================
  it('counts a category approved when the AI review is Analyst Accepted', async () => {
    manualReviewsByDoc.delete('doc-0');
    aiResponsesByDoc.set(
      'doc-0',
      makeAiReviewResponse(0, { analystReviewStatus: ANALYST_REVIEW_STATUSES.ANALYST_ACCEPTED }),
    );

    const result = await service.getEligibility('customer-1');

    expect(result.eligible).toBe(true);
    expect(result.approvedCategories).toBe(10);
  });

  // ================= Test 6 =================
  it('counts a category approved when the AI review is Analyst Edited and completed', async () => {
    manualReviewsByDoc.delete('doc-0');
    aiResponsesByDoc.set(
      'doc-0',
      makeAiReviewResponse(0, { analystReviewStatus: ANALYST_REVIEW_STATUSES.ANALYST_EDITED }),
    );

    const result = await service.getEligibility('customer-1');

    expect(result.eligible).toBe(true);
    expect(result.approvedCategories).toBe(10);
  });

  // ================= Test 7 =================
  it('counts a category approved when a Manual Analyst review is completed', async () => {
    manualReviewsByDoc.set(
      'doc-0',
      makeManualReview(0, {
        reviewedBy: 'analyst-1',
        reviewStatus: MANUAL_REVIEW_STATUSES.COMPLETED,
      }),
    );

    const result = await service.getEligibility('customer-1');

    expect(result.eligible).toBe(true);
    expect(result.approvedCategories).toBe(10);
  });

  // ================= Test 8 =================
  it('counts a category approved when a Manual Admin review is completed', async () => {
    manualReviewsByDoc.set(
      'doc-0',
      makeManualReview(0, {
        reviewedBy: 'admin-1',
        reviewStatus: MANUAL_REVIEW_STATUSES.COMPLETED,
      }),
    );

    const result = await service.getEligibility('customer-1');

    expect(result.eligible).toBe(true);
    expect(result.approvedCategories).toBe(10);
  });

  // ================= Test 9 =================
  it('counts the latest approved review when a rejected review has a newer approved replacement', async () => {
    // Only the latest ai_review_response is ever surfaced by the repository (the same way
    // `findLatestAiReviewResponseByDocumentId` orders by createdAt desc) — an older rejected
    // attempt for this document is superseded by this newer, accepted one.
    manualReviewsByDoc.delete('doc-0');
    aiResponsesByDoc.set(
      'doc-0',
      makeAiReviewResponse(0, {
        id: 'ai-response-0-latest',
        analystReviewStatus: ANALYST_REVIEW_STATUSES.ANALYST_ACCEPTED,
      }),
    );

    const result = await service.getEligibility('customer-1');

    expect(result.eligible).toBe(true);
    expect(result.approvedCategories).toBe(10);
  });

  it('does not count a category approved when the latest review is rejected', async () => {
    manualReviewsByDoc.delete('doc-0');
    aiResponsesByDoc.set(
      'doc-0',
      makeAiReviewResponse(0, { analystReviewStatus: ANALYST_REVIEW_STATUSES.ANALYST_REJECTED }),
    );

    const result = await service.getEligibility('customer-1');

    expect(result.eligible).toBe(false);
    expect(result.missingCategories).toContain('System of Record Documentation');
  });

  // ================= Test 10 =================
  it('blocks generation and never calls OpenRouter when the Master Report prompt is missing/inactive', async () => {
    aiPromptsService.getActiveMasterReportPrompt.mockRejectedValue(
      new NotFoundException('No active Master Transformation Readiness Report prompt found'),
    );

    await expect(service.generateReport('customer-1', 'analyst-1', 'analyst')).rejects.toThrow(
      BadRequestException,
    );
    expect(openRouterClient.executeReview).not.toHaveBeenCalled();
    expect(repository.insert).not.toHaveBeenCalled();

    const eligibility = await service.getEligibility('customer-1');
    expect(eligibility.eligible).toBe(false);
  });

  // ================= Test 11 =================
  it('persists Generation Failed status and error information when OpenRouter fails', async () => {
    openRouterClient.executeReview.mockResolvedValue({
      ok: false,
      errorCode: 'http_error',
      errorMessage: 'The AI provider returned an error (HTTP 500)',
    });

    await expect(service.generateReport('customer-1', 'analyst-1', 'analyst')).rejects.toThrow();

    expect(repository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        reportStatus: EXECUTIVE_REPORT_STATUSES.GENERATION_FAILED,
        generationErrorMessage: 'The AI provider returned an error (HTTP 500)',
        masterPromptId: baseMasterTemplate.id,
        masterPromptVersionId: baseMasterVersion.id,
        generatedByUserId: 'analyst-1',
      }),
    );
  });

  // ================= Test 12 =================
  describe('on successful generation', () => {
    let report: ExecutiveReportRow;

    beforeEach(async () => {
      report = await service.generateReport('customer-1', 'analyst-1', 'analyst');
    });

    it('calls OpenRouter exactly once', () => {
      expect(openRouterClient.executeReview).toHaveBeenCalledTimes(1);
    });

    it('stores the report as Draft / Internal Review Required', () => {
      expect(report.reportStatus).toBe(EXECUTIVE_REPORT_STATUSES.DRAFT);
      expect(report.generatedReportMarkdown).toBe(openRouterSuccess.content);
    });

    it('stores the prompt id and version id', () => {
      expect(report.masterPromptId).toBe(baseMasterTemplate.id);
      expect(report.masterPromptVersionId).toBe(baseMasterVersion.id);
    });

    it('stores the source review ids for every required category', () => {
      expect(report.sourceReviewIds).toHaveLength(10);
      expect(report.sourceReviewIds).toEqual(expect.arrayContaining(['manual-review-0']));
    });

    it('stores the generated timestamp and generated-by user', () => {
      expect(report.generatedAt).toBeInstanceOf(Date);
      expect(report.generatedByUserId).toBe('analyst-1');
    });
  });

  it('rejects End Users and never calls OpenRouter or eligibility', async () => {
    await expect(service.generateReport('customer-1', 'user-1', 'user')).rejects.toThrow(
      ForbiddenException,
    );
    expect(openRouterClient.executeReview).not.toHaveBeenCalled();
    expect(repository.findDocumentsForCustomer).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when the customer does not exist', async () => {
    repository.findCustomerById.mockResolvedValue(null);

    await expect(service.getEligibility('missing-customer')).rejects.toThrow(NotFoundException);
  });

  // ================= approveReport =================
  describe('approveReport', () => {
    // ================= Test 1 (approve half) =================
    it('approves a draft report and stamps approvedBy/approvedAt', async () => {
      const draft = makeExecutiveReport({ reportStatus: EXECUTIVE_REPORT_STATUSES.DRAFT });
      repository.findById.mockResolvedValue(draft);

      const result = await service.approveReport('customer-1', 'report-1', 'analyst-1', 'analyst');

      expect(result.reportStatus).toBe(EXECUTIVE_REPORT_STATUSES.APPROVED);
      expect(repository.update).toHaveBeenCalledWith(
        'report-1',
        expect.objectContaining({
          reportStatus: EXECUTIVE_REPORT_STATUSES.APPROVED,
          approvedByUserId: 'analyst-1',
          approvedAt: expect.any(Date),
        }),
        expect.anything(),
      );
    });

    it('rejects approving a report that is not a draft', async () => {
      repository.findById.mockResolvedValue(
        makeExecutiveReport({ reportStatus: EXECUTIVE_REPORT_STATUSES.APPROVED }),
      );

      await expect(
        service.approveReport('customer-1', 'report-1', 'analyst-1', 'analyst'),
      ).rejects.toThrow(ConflictException);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('rejects End Users attempting to approve', async () => {
      await expect(
        service.approveReport('customer-1', 'report-1', 'user-1', 'user'),
      ).rejects.toThrow(ForbiddenException);
      expect(repository.findById).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the report belongs to a different customer', async () => {
      repository.findById.mockResolvedValue(
        makeExecutiveReport({ customerId: 'customer-2', reportStatus: EXECUTIVE_REPORT_STATUSES.DRAFT }),
      );

      await expect(
        service.approveReport('customer-1', 'report-1', 'analyst-1', 'analyst'),
      ).rejects.toThrow(NotFoundException);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('rejects approving a draft report with no content', async () => {
      repository.findById.mockResolvedValue(
        makeExecutiveReport({
          reportStatus: EXECUTIVE_REPORT_STATUSES.DRAFT,
          generatedReportMarkdown: '   ',
        }),
      );

      await expect(
        service.approveReport('customer-1', 'report-1', 'analyst-1', 'analyst'),
      ).rejects.toThrow(ConflictException);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('blocks a concurrent double-approve: the row-lock re-check sees the status another transaction already flipped', async () => {
      // First read (the fast pre-check, before any transaction) sees a draft. By the time
      // the transaction acquires the row lock and re-reads via `findByIdForUpdate`, a
      // concurrent approval has already committed `approved` — the re-check inside the
      // transaction must catch this and reject, never double-write.
      repository.findById
        .mockResolvedValueOnce(makeExecutiveReport({ reportStatus: EXECUTIVE_REPORT_STATUSES.DRAFT }))
        .mockResolvedValueOnce(makeExecutiveReport({ reportStatus: EXECUTIVE_REPORT_STATUSES.APPROVED }));

      await expect(
        service.approveReport('customer-1', 'report-1', 'analyst-1', 'analyst'),
      ).rejects.toThrow(ConflictException);
      expect(repository.update).not.toHaveBeenCalled();
    });
  });

  // ================= updateReport =================
  describe('updateReport', () => {
    it('updates the markdown content of a draft report and stamps updatedBy/updatedAt from the auth context, not the body', async () => {
      const draft = makeExecutiveReport({ reportStatus: EXECUTIVE_REPORT_STATUSES.DRAFT });
      repository.findById.mockResolvedValue(draft);

      const result = await service.updateReport(
        'customer-1',
        'report-1',
        '# Edited content',
        'analyst-1',
        'analyst',
      );

      expect(result.generatedReportMarkdown).toBe('# Edited content');
      expect(repository.update).toHaveBeenCalledWith(
        'report-1',
        expect.objectContaining({
          generatedReportMarkdown: '# Edited content',
          lastUpdatedByUserId: 'analyst-1',
          lastUpdatedAt: expect.any(Date),
          updatedAt: expect.any(Date),
        }),
      );
      // Only the whitelisted content field plus audit fields sourced from the auth
      // context are ever passed to the repository — never status, ids, or lineage fields
      // (those aren't even parameters `updateReport` accepts).
      expect(repository.update).not.toHaveBeenCalledWith(
        'report-1',
        expect.objectContaining({ reportStatus: expect.anything() }),
      );
    });

    it('rejects updating a report that is not a draft (e.g. approved/published)', async () => {
      repository.findById.mockResolvedValue(
        makeExecutiveReport({ reportStatus: EXECUTIVE_REPORT_STATUSES.APPROVED }),
      );

      await expect(
        service.updateReport('customer-1', 'report-1', 'new content', 'analyst-1', 'analyst'),
      ).rejects.toThrow(ConflictException);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('rejects updating a published report', async () => {
      repository.findById.mockResolvedValue(
        makeExecutiveReport({ reportStatus: EXECUTIVE_REPORT_STATUSES.PUBLISHED }),
      );

      await expect(
        service.updateReport('customer-1', 'report-1', 'new content', 'analyst-1', 'analyst'),
      ).rejects.toThrow(ConflictException);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('rejects End Users attempting to update, without looking up the report', async () => {
      await expect(
        service.updateReport('customer-1', 'report-1', 'new content', 'user-1', 'user'),
      ).rejects.toThrow(ForbiddenException);
      expect(repository.findById).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the report belongs to a different customer (cross-customer access blocked)', async () => {
      repository.findById.mockResolvedValue(
        makeExecutiveReport({ customerId: 'customer-2', reportStatus: EXECUTIVE_REPORT_STATUSES.DRAFT }),
      );

      await expect(
        service.updateReport('customer-1', 'report-1', 'new content', 'analyst-1', 'analyst'),
      ).rejects.toThrow(NotFoundException);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when no report exists with that id', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        service.updateReport('customer-1', 'missing-report', 'new content', 'analyst-1', 'analyst'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when the customer does not exist', async () => {
      repository.findCustomerById.mockResolvedValue(null);

      await expect(
        service.updateReport('missing-customer', 'report-1', 'new content', 'analyst-1', 'analyst'),
      ).rejects.toThrow(NotFoundException);
      expect(repository.findById).not.toHaveBeenCalled();
    });
  });

  // ================= publishReport =================
  describe('publishReport', () => {
    // ================= Test 1 (publish half) =================
    it('publishes an approved report and stamps publishedBy/publishedAt', async () => {
      const approved = makeExecutiveReport({
        reportStatus: EXECUTIVE_REPORT_STATUSES.APPROVED,
        approvedByUserId: 'analyst-1',
        approvedAt: new Date(2026, 0, 2),
      });
      repository.findById.mockResolvedValue(approved);

      const result = await service.publishReport('customer-1', 'report-1', 'admin-1', 'admin');

      expect(result.reportStatus).toBe(EXECUTIVE_REPORT_STATUSES.PUBLISHED);
      expect(repository.update).toHaveBeenCalledWith(
        'report-1',
        expect.objectContaining({
          reportStatus: EXECUTIVE_REPORT_STATUSES.PUBLISHED,
          publishedByUserId: 'admin-1',
          publishedAt: expect.any(Date),
        }),
        expect.anything(),
      );
      // Approval metadata already on the row is preserved — publish only updates the
      // publish-related fields, it doesn't overwrite approvedByUserId/approvedAt.
      expect(repository.update).toHaveBeenCalledWith(
        'report-1',
        expect.not.objectContaining({ approvedByUserId: expect.anything() }),
        expect.anything(),
      );
    });

    it('rejects publishing an approved report with no content', async () => {
      repository.findById.mockResolvedValue(
        makeExecutiveReport({
          reportStatus: EXECUTIVE_REPORT_STATUSES.APPROVED,
          generatedReportMarkdown: '   ',
        }),
      );

      await expect(
        service.publishReport('customer-1', 'report-1', 'analyst-1', 'analyst'),
      ).rejects.toThrow(ConflictException);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('blocks a concurrent double-publish: the row-lock re-check sees the status another transaction already flipped', async () => {
      // First read (the fast pre-check, before any transaction) sees an approved report. By
      // the time the transaction acquires the row lock and re-reads via `findByIdForUpdate`, a
      // concurrent publish has already committed `published` — the re-check inside the
      // transaction must catch this and reject, never double-write.
      repository.findById
        .mockResolvedValueOnce(
          makeExecutiveReport({ reportStatus: EXECUTIVE_REPORT_STATUSES.APPROVED }),
        )
        .mockResolvedValueOnce(
          makeExecutiveReport({ reportStatus: EXECUTIVE_REPORT_STATUSES.PUBLISHED }),
        );

      await expect(
        service.publishReport('customer-1', 'report-1', 'analyst-1', 'analyst'),
      ).rejects.toThrow(ConflictException);
      expect(repository.update).not.toHaveBeenCalled();
    });

    // ================= Test 2 =================
    it('rejects publishing a draft report', async () => {
      repository.findById.mockResolvedValue(
        makeExecutiveReport({ reportStatus: EXECUTIVE_REPORT_STATUSES.DRAFT }),
      );

      await expect(
        service.publishReport('customer-1', 'report-1', 'analyst-1', 'analyst'),
      ).rejects.toThrow(ConflictException);
      expect(repository.update).not.toHaveBeenCalled();
    });

    // ================= Test 3 =================
    it('rejects publishing a Generation Failed report', async () => {
      repository.findById.mockResolvedValue(
        makeExecutiveReport({ reportStatus: EXECUTIVE_REPORT_STATUSES.GENERATION_FAILED }),
      );

      await expect(
        service.publishReport('customer-1', 'report-1', 'analyst-1', 'analyst'),
      ).rejects.toThrow(ConflictException);
      expect(repository.update).not.toHaveBeenCalled();
    });

    // ================= Test 4 =================
    it('rejects publishing an unreviewed (Under Review) report', async () => {
      repository.findById.mockResolvedValue(
        makeExecutiveReport({ reportStatus: EXECUTIVE_REPORT_STATUSES.UNDER_REVIEW }),
      );

      await expect(
        service.publishReport('customer-1', 'report-1', 'analyst-1', 'analyst'),
      ).rejects.toThrow(ConflictException);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('rejects re-publishing an already-published report', async () => {
      repository.findById.mockResolvedValue(
        makeExecutiveReport({ reportStatus: EXECUTIVE_REPORT_STATUSES.PUBLISHED }),
      );

      await expect(
        service.publishReport('customer-1', 'report-1', 'analyst-1', 'analyst'),
      ).rejects.toThrow(ConflictException);
      expect(repository.update).not.toHaveBeenCalled();
    });

    // ================= Test 10 =================
    it('rejects End Users attempting to publish, without looking up the report', async () => {
      await expect(
        service.publishReport('customer-1', 'report-1', 'user-1', 'user'),
      ).rejects.toThrow(ForbiddenException);
      expect(repository.findById).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the report belongs to a different customer', async () => {
      repository.findById.mockResolvedValue(
        makeExecutiveReport({
          customerId: 'customer-2',
          reportStatus: EXECUTIVE_REPORT_STATUSES.APPROVED,
        }),
      );

      await expect(
        service.publishReport('customer-1', 'report-1', 'analyst-1', 'analyst'),
      ).rejects.toThrow(NotFoundException);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when no report exists with that id', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        service.publishReport('customer-1', 'missing-report', 'analyst-1', 'analyst'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ================= getPublishedReportForEndUser =================
  describe('getPublishedReportForEndUser', () => {
    // ================= Test 5 =================
    it("returns the End User's published report, with only the intended fields", async () => {
      repository.findLatestPublishedByCustomerId.mockResolvedValue({
        id: 'report-1',
        customerId: 'customer-1',
        reportStatus: EXECUTIVE_REPORT_STATUSES.PUBLISHED,
        reportVersion: 1,
        publishedAt: new Date(2026, 0, 3),
        publishedByName: 'Admin Name',
        generatedReportMarkdown: '# Executive Transformation Readiness Report',
      });

      const result = await service.getPublishedReportForEndUser('customer-1');

      expect(result).toEqual({
        customerId: 'customer-1',
        reportStatus: EXECUTIVE_REPORT_STATUSES.PUBLISHED,
        reportVersion: 1,
        publishedAt: new Date(2026, 0, 3),
        publishedBy: 'Admin Name',
        reportMarkdown: '# Executive Transformation Readiness Report',
      });
      // No internal fields — prompt ids, source review ids, provider/model, generation
      // error, or any other internal audit field — ever appear on the End User result.
      expect(result).not.toHaveProperty('masterPromptId');
      expect(result).not.toHaveProperty('masterPromptVersionId');
      expect(result).not.toHaveProperty('sourceReviewIds');
      expect(result).not.toHaveProperty('provider');
      expect(result).not.toHaveProperty('model');
      expect(result).not.toHaveProperty('generationErrorMessage');
      expect(result).not.toHaveProperty('approvedByUserId');
      expect(result).not.toHaveProperty('generatedByUserId');
    });

    // ================= Test 6 =================
    it('returns null when the customer has no published report', async () => {
      repository.findLatestPublishedByCustomerId.mockResolvedValue(null);

      await expect(service.getPublishedReportForEndUser('customer-1')).resolves.toBeNull();
    });

    // ================= Test 7 =================
    it("scopes strictly to the requesting End User's own id — never a value the caller supplies elsewhere", async () => {
      repository.findLatestPublishedByCustomerId.mockResolvedValue(null);

      await service.getPublishedReportForEndUser('customer-a');

      expect(repository.findLatestPublishedByCustomerId).toHaveBeenCalledWith('customer-a');
      expect(repository.findLatestPublishedByCustomerId).not.toHaveBeenCalledWith('customer-b');
    });

    // ================= Test 8 =================
    it('never surfaces a newer draft even when one exists for the same customer', async () => {
      // The repository is the one responsible for filtering to `reportStatus: 'published'`
      // only (see ExecutiveReportRepository.findLatestPublishedByCustomerId) — from the
      // service's point of view, a customer with a published v1 and a draft v2 simply never
      // resolves the draft here; the repository mock returning the published v1 (not v2)
      // is exactly that contract being honored.
      repository.findLatestPublishedByCustomerId.mockResolvedValue({
        id: 'report-1',
        customerId: 'customer-1',
        reportStatus: EXECUTIVE_REPORT_STATUSES.PUBLISHED,
        reportVersion: 1,
        publishedAt: new Date(2026, 0, 3),
        publishedByName: 'Admin Name',
        generatedReportMarkdown: 'Published v1 content',
      });

      const result = await service.getPublishedReportForEndUser('customer-1');

      expect(result?.reportVersion).toBe(1);
      expect(result?.reportMarkdown).toBe('Published v1 content');
    });

    // ================= Test 9 =================
    it('surfaces the new version once it becomes the published one', async () => {
      repository.findLatestPublishedByCustomerId.mockResolvedValue({
        id: 'report-2',
        customerId: 'customer-1',
        reportStatus: EXECUTIVE_REPORT_STATUSES.PUBLISHED,
        reportVersion: 2,
        publishedAt: new Date(2026, 0, 5),
        publishedByName: 'Admin Name',
        generatedReportMarkdown: 'Published v2 content',
      });

      const result = await service.getPublishedReportForEndUser('customer-1');

      expect(result?.reportVersion).toBe(2);
      expect(result?.reportMarkdown).toBe('Published v2 content');
    });
  });

  // ================= downloadReportPdf (Admin/Analyst) =================
  describe('downloadReportPdf', () => {
    it.each([
      ['Admin', 'admin' as const, EXECUTIVE_REPORT_STATUSES.DRAFT],
      ['Analyst', 'analyst' as const, EXECUTIVE_REPORT_STATUSES.DRAFT],
      ['Admin', 'admin' as const, EXECUTIVE_REPORT_STATUSES.APPROVED],
      ['Analyst', 'analyst' as const, EXECUTIVE_REPORT_STATUSES.APPROVED],
      ['Admin', 'admin' as const, EXECUTIVE_REPORT_STATUSES.PUBLISHED],
      ['Analyst', 'analyst' as const, EXECUTIVE_REPORT_STATUSES.PUBLISHED],
    ])('%s can download a %s report', async (_label, role, reportStatus) => {
      repository.findById.mockResolvedValue(makeExecutiveReport({ reportStatus }));

      const result = await service.downloadReportPdf('customer-1', 'report-1', role);

      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.filename).toContain('.pdf');
      expect(pdfService.renderExecutiveReportPdf).toHaveBeenCalledWith(
        expect.objectContaining({ reportStatus }),
        'Demo Customer',
      );
    });

    it.each([
      ['Generation Failed', EXECUTIVE_REPORT_STATUSES.GENERATION_FAILED],
      ['Under Review', EXECUTIVE_REPORT_STATUSES.UNDER_REVIEW],
      ['Needs Regeneration', EXECUTIVE_REPORT_STATUSES.NEEDS_REGENERATION],
    ])('blocks downloading a %s report', async (_label, reportStatus) => {
      repository.findById.mockResolvedValue(makeExecutiveReport({ reportStatus }));

      await expect(service.downloadReportPdf('customer-1', 'report-1', 'analyst')).rejects.toThrow(
        ConflictException,
      );
      expect(pdfService.renderExecutiveReportPdf).not.toHaveBeenCalled();
    });

    it('rejects an unauthorized (End User) download attempt without looking up the report', async () => {
      await expect(service.downloadReportPdf('customer-1', 'report-1', 'user')).rejects.toThrow(
        ForbiddenException,
      );
      expect(repository.findById).not.toHaveBeenCalled();
      expect(pdfService.renderExecutiveReportPdf).not.toHaveBeenCalled();
    });

    it('rejects a report that belongs to a different customer (not found, not forbidden)', async () => {
      repository.findById.mockResolvedValue(
        makeExecutiveReport({ customerId: 'customer-2', reportStatus: EXECUTIVE_REPORT_STATUSES.DRAFT }),
      );

      await expect(
        service.downloadReportPdf('customer-1', 'report-1', 'analyst'),
      ).rejects.toThrow(NotFoundException);
      expect(pdfService.renderExecutiveReportPdf).not.toHaveBeenCalled();
    });

    it('builds a filename that reflects the customer name, version, and Draft/Internal suffix', async () => {
      repository.findById.mockResolvedValue(
        makeExecutiveReport({ reportStatus: EXECUTIVE_REPORT_STATUSES.DRAFT, reportVersion: 3 }),
      );
      repository.findCustomerNameById.mockResolvedValue('CallNest Inc');

      const result = await service.downloadReportPdf('customer-1', 'report-1', 'analyst');

      expect(result.filename).toBe(
        'CallNest_Inc_TRS_MasterTransformationReadinessReport_v3_Draft_Internal.pdf',
      );
    });

    it('builds a "Published" filename for a published report', async () => {
      repository.findById.mockResolvedValue(
        makeExecutiveReport({ reportStatus: EXECUTIVE_REPORT_STATUSES.PUBLISHED, reportVersion: 1 }),
      );
      repository.findCustomerNameById.mockResolvedValue('CallNest Inc');

      const result = await service.downloadReportPdf('customer-1', 'report-1', 'admin');

      expect(result.filename).toBe(
        'CallNest_Inc_TRS_MasterTransformationReadinessReport_v1_Published.pdf',
      );
    });
  });

  // ================= downloadPublishedReportPdfForEndUser =================
  describe('downloadPublishedReportPdfForEndUser', () => {
    it('downloads the End User’s own published report', async () => {
      repository.findLatestPublishedByCustomerId.mockResolvedValue({
        id: 'report-1',
        customerId: 'customer-1',
        reportStatus: EXECUTIVE_REPORT_STATUSES.PUBLISHED,
        reportVersion: 1,
        publishedAt: new Date(2026, 0, 3),
        publishedByName: 'Admin Name',
        generatedReportMarkdown: 'Published content',
      });
      repository.findCustomerNameById.mockResolvedValue('CallNest Inc');

      const result = await service.downloadPublishedReportPdfForEndUser('customer-1');

      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.filename).toBe(
        'CallNest_Inc_TRS_MasterTransformationReadinessReport_v1_Published.pdf',
      );
    });

    it('throws NotFoundException when the customer has no published report (draft/approved/rejected/failed all excluded)', async () => {
      repository.findLatestPublishedByCustomerId.mockResolvedValue(null);

      await expect(
        service.downloadPublishedReportPdfForEndUser('customer-1'),
      ).rejects.toThrow(NotFoundException);
      expect(pdfService.renderExecutiveReportPdf).not.toHaveBeenCalled();
    });

    it('scopes strictly to the requesting End User’s own id — Customer B can never fetch Customer A’s report', async () => {
      repository.findLatestPublishedByCustomerId.mockImplementation((customerId: string) =>
        Promise.resolve(
          customerId === 'customer-a'
            ? {
                id: 'report-a',
                customerId: 'customer-a',
                reportStatus: EXECUTIVE_REPORT_STATUSES.PUBLISHED,
                reportVersion: 1,
                publishedAt: new Date(2026, 0, 3),
                publishedByName: 'Admin Name',
                generatedReportMarkdown: 'Customer A content',
              }
            : null,
        ),
      );

      await expect(service.downloadPublishedReportPdfForEndUser('customer-b')).rejects.toThrow(
        NotFoundException,
      );
      const resultA = await service.downloadPublishedReportPdfForEndUser('customer-a');
      expect(resultA.buffer).toBeInstanceOf(Buffer);
    });
  });
});
