jest.mock('../db', () => ({
  db: {
    transaction: jest.fn((cb: (tx: unknown) => unknown) => cb({})),
  },
}));

import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';

import type { AiPromptsRepository } from '../ai-prompts/ai-prompts.repository';
import { PROMPT_STATUSES } from '../ai-prompts/constants/prompt-status';
import type { AiProviderConfigurationsService } from '../ai-provider-configurations/ai-provider-configurations.service';
import type {
  OpenRouterClient,
  OpenRouterReviewResult,
} from '../ai-provider-configurations/providers/openrouter-client';
import type { DecryptedAiProviderConfiguration } from '../ai-provider-configurations/ai-provider-configurations.types';
import type {
  AiReviewEligibilityResult,
  DocumentsService,
  IntakeDocument,
} from '../documents/documents.service';
import type { UploadService } from '../upload/upload.service';
import type { AiReviewRepository } from './ai-review.repository';
import { AiReviewService } from './ai-review.service';
import { AI_REQUEST_STATUSES, ANALYST_REVIEW_STATUSES } from './constants/ai-review-status';
import { DocumentTextExtractionService } from './document-text-extraction.service';

const FAKE_API_KEY = 'sk-or-should-never-appear-in-any-thrown-message-or-persisted-row';

const eligible: AiReviewEligibilityResult = {
  documentSubmissionId: 'doc-1',
  trsDomain: 'data_integrity_trust',
  evidenceCategory: 'System of Record Documentation',
  aiReviewEligible: true,
  activePromptId: 'template-1',
  activePromptVersion: 'v1.0',
  reason: 'Active prompt found',
};

const baseDoc: IntakeDocument = {
  id: 'doc-1',
  uploadedBy: 'customer-1',
  fileName: 'evidence.txt',
  fileType: 'text/plain',
  s3Key: 'uploads/evidence.txt',
  fileSize: 100,
  trsDomain: 'data_integrity_trust',
  evidenceCategory: 'System of Record Documentation',
  evidenceType: 'required',
  notes: null,
  status: 'classified',
  aiReviewStatus: 'pending',
  analystId: null,
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
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

const baseTemplate = {
  id: 'template-1',
  promptName: 'System of Record Prompt',
  promptDescription: null,
  trsDomainId: 'data_integrity_trust',
  evidenceCategoryId: 'System of Record Documentation',
  promptType: 'evidence_review',
  status: PROMPT_STATUSES.ACTIVE,
  activeVersionId: 'version-1',
  createdByUserId: null,
  updatedByUserId: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  deletedAt: null,
};

const baseVersion = {
  id: 'version-1',
  promptTemplateId: 'template-1',
  versionNumber: 1,
  versionLabel: 'v1.0',
  promptContent: 'You are an evidence reviewer...',
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
  apiKey: FAKE_API_KEY,
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

const baseRequestRow = {
  id: 'request-1',
  customerId: 'customer-1',
  documentId: 'doc-1',
  trsDomain: 'data_integrity_trust',
  evidenceCategory: 'System of Record Documentation',
  promptTemplateId: 'template-1',
  promptVersionId: 'version-1',
  provider: 'openrouter',
  model: 'openai/gpt-4o',
  initiatedByUserId: 'analyst-1',
  initiatedAt: new Date('2026-01-01T00:00:00Z'),
  status: AI_REQUEST_STATUSES.PROCESSING,
  errorMessage: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

const baseResponseRow = {
  id: 'response-1',
  requestId: 'request-1',
  documentId: 'doc-1',
  rawResponse: { id: 'chatcmpl-1' },
  structuredMarkdownResponse: 'Structured review output',
  parsedFindings: null,
  evidenceSufficiency: null,
  aiConfidence: null,
  primaryColorIndicator: null,
  recommendedAnalystAction: null,
  analystReviewStatus: ANALYST_REVIEW_STATUSES.AI_GENERATED,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

const openRouterSuccess: OpenRouterReviewResult = {
  ok: true,
  provider: 'openrouter',
  model: 'openai/gpt-4o',
  content: 'Structured review output',
  rawResponse: { id: 'chatcmpl-1' },
};

describe('AiReviewService.executeReview', () => {
  let documentsService: jest.Mocked<
    Pick<
      DocumentsService,
      | 'getAiReviewEligibility'
      | 'getDocument'
      | 'markAiReviewInProgress'
      | 'markAiReviewCompleted'
      | 'markAiReviewFailed'
    >
  >;
  let uploadService: jest.Mocked<Pick<UploadService, 'getObjectBuffer'>>;
  // Real instance, not a mock — it's pure logic with no external dependencies, and using it
  // for real exercises the actual `text/plain` extraction path end to end.
  const documentTextExtractionService = new DocumentTextExtractionService();
  let aiPromptsRepository: jest.Mocked<
    Pick<AiPromptsRepository, 'findTemplateById' | 'findVersionById'>
  >;
  let aiProviderConfigurationsService: jest.Mocked<
    Pick<AiProviderConfigurationsService, 'getActiveConfigForExecution'>
  >;
  let openRouterClient: jest.Mocked<Pick<OpenRouterClient, 'executeReview'>>;
  let aiReviewRepository: jest.Mocked<AiReviewRepository>;
  let service: AiReviewService;

  beforeEach(() => {
    documentsService = {
      getAiReviewEligibility: jest.fn().mockResolvedValue(eligible),
      getDocument: jest.fn().mockResolvedValue(baseDoc),
      markAiReviewInProgress: jest.fn().mockResolvedValue(undefined),
      markAiReviewCompleted: jest.fn().mockResolvedValue(undefined),
      markAiReviewFailed: jest.fn().mockResolvedValue(undefined),
    };
    uploadService = {
      getObjectBuffer: jest.fn().mockResolvedValue(Buffer.from('Document body text', 'utf-8')),
    };
    aiPromptsRepository = {
      findTemplateById: jest.fn().mockResolvedValue(baseTemplate),
      findVersionById: jest.fn().mockResolvedValue(baseVersion),
    };
    aiProviderConfigurationsService = {
      getActiveConfigForExecution: jest.fn().mockResolvedValue(baseProviderConfig),
    };
    openRouterClient = { executeReview: jest.fn().mockResolvedValue(openRouterSuccess) };
    aiReviewRepository = {
      insertRequest: jest.fn().mockResolvedValue(baseRequestRow),
      updateRequest: jest
        .fn()
        .mockResolvedValue({ ...baseRequestRow, status: AI_REQUEST_STATUSES.COMPLETED }),
      insertResponse: jest.fn().mockResolvedValue(baseResponseRow),
      findRequestById: jest.fn(),
      findRequestsByDocumentId: jest.fn(),
      findResponseById: jest.fn(),
      findResponseByRequestId: jest.fn(),
      findResponsesByDocumentId: jest.fn(),
      updateResponse: jest.fn(),
    };

    service = new AiReviewService(
      documentsService as unknown as DocumentsService,
      uploadService as unknown as UploadService,
      aiPromptsRepository as unknown as AiPromptsRepository,
      aiProviderConfigurationsService as unknown as AiProviderConfigurationsService,
      openRouterClient as unknown as OpenRouterClient,
      aiReviewRepository,
      documentTextExtractionService,
    );
  });

  // ================= AUTHORIZATION =================

  it('allows Admin to execute AI review', async () => {
    await expect(service.executeReview('doc-1', 'admin-1', 'admin')).resolves.toBeDefined();
  });

  it('allows Analyst to execute AI review', async () => {
    await expect(service.executeReview('doc-1', 'analyst-1', 'analyst')).resolves.toBeDefined();
  });

  it('forbids End Users and never calls OpenRouter or eligibility', async () => {
    await expect(service.executeReview('doc-1', 'user-1', 'user')).rejects.toThrow(
      ForbiddenException,
    );
    expect(documentsService.getAiReviewEligibility).not.toHaveBeenCalled();
    expect(openRouterClient.executeReview).not.toHaveBeenCalled();
  });

  // ================= ELIGIBILITY SHORT-CIRCUITS =================

  it('never calls OpenRouter and creates no records when the document is not eligible (no active prompt, draft, inactive, or archived — all surface the same way here)', async () => {
    documentsService.getAiReviewEligibility.mockResolvedValue({
      ...eligible,
      aiReviewEligible: false,
      activePromptId: null,
      activePromptVersion: null,
      reason: 'No active prompt exists for this evidence category',
    });

    await expect(service.executeReview('doc-1', 'analyst-1', 'analyst')).rejects.toThrow(
      BadRequestException,
    );
    expect(openRouterClient.executeReview).not.toHaveBeenCalled();
    expect(aiReviewRepository.insertRequest).not.toHaveBeenCalled();
    expect(aiReviewRepository.insertResponse).not.toHaveBeenCalled();
  });

  it('never calls OpenRouter for a Reset / Resubmission Required document', async () => {
    documentsService.getDocument.mockResolvedValue({ ...baseDoc, resetRequired: true });

    await expect(service.executeReview('doc-1', 'analyst-1', 'analyst')).rejects.toThrow(
      BadRequestException,
    );
    expect(openRouterClient.executeReview).not.toHaveBeenCalled();
    expect(aiReviewRepository.insertRequest).not.toHaveBeenCalled();
  });

  it('never calls OpenRouter for a document that has not been submitted (eligibility already rejects it)', async () => {
    documentsService.getAiReviewEligibility.mockResolvedValue({
      ...eligible,
      aiReviewEligible: false,
      activePromptId: null,
      activePromptVersion: null,
      trsDomain: null,
      evidenceCategory: null,
      reason: 'Document has not been classified with a TRS domain and evidence category',
    });

    await expect(service.executeReview('doc-1', 'analyst-1', 'analyst')).rejects.toThrow(
      BadRequestException,
    );
    expect(openRouterClient.executeReview).not.toHaveBeenCalled();
  });

  // ================= SUCCESSFUL OPENROUTER FLOW =================

  describe('on a successful OpenRouter response', () => {
    it('transitions the AI Request Processing -> Completed', async () => {
      await service.executeReview('doc-1', 'analyst-1', 'analyst');

      expect(aiReviewRepository.insertRequest).toHaveBeenCalledWith(
        expect.objectContaining({ status: AI_REQUEST_STATUSES.PROCESSING }),
      );
      expect(aiReviewRepository.updateRequest).toHaveBeenCalledWith(
        'request-1',
        expect.objectContaining({ status: AI_REQUEST_STATUSES.COMPLETED }),
        expect.anything(),
      );
    });

    it('creates the AI Response with Analyst Review Status = AI Generated', async () => {
      await service.executeReview('doc-1', 'analyst-1', 'analyst');

      expect(aiReviewRepository.insertResponse).toHaveBeenCalledWith(
        expect.objectContaining({ analystReviewStatus: ANALYST_REVIEW_STATUSES.AI_GENERATED }),
        expect.anything(),
      );
    });

    it('marks the document as ai_reviewed via DocumentsService (not written to directly)', async () => {
      await service.executeReview('doc-1', 'analyst-1', 'analyst');

      expect(documentsService.markAiReviewInProgress).toHaveBeenCalledWith('doc-1');
      expect(documentsService.markAiReviewCompleted).toHaveBeenCalledWith('doc-1');
      expect(documentsService.markAiReviewFailed).not.toHaveBeenCalled();
    });

    it('returns the full API-facing result', async () => {
      const result = await service.executeReview('doc-1', 'analyst-1', 'analyst');

      expect(result).toEqual({
        requestId: 'request-1',
        responseId: 'response-1',
        documentSubmissionId: 'doc-1',
        provider: 'openrouter',
        model: 'openai/gpt-4o',
        promptId: 'template-1',
        promptVersion: 'v1.0',
        reviewStatus: ANALYST_REVIEW_STATUSES.AI_GENERATED,
        draftInternalOnly: true,
        structuredOutput: null,
        rawMarkdown: 'Structured review output',
      });
    });

    // ================= PERSISTENCE =================

    it('persists every required AI Request field', async () => {
      await service.executeReview('doc-1', 'analyst-1', 'analyst');

      expect(aiReviewRepository.insertRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: baseDoc.uploadedBy,
          documentId: baseDoc.id,
          trsDomain: eligible.trsDomain,
          evidenceCategory: eligible.evidenceCategory,
          promptTemplateId: baseTemplate.id,
          promptVersionId: baseVersion.id,
          provider: baseProviderConfig.providerType,
          model: baseProviderConfig.defaultModel,
          initiatedByUserId: 'analyst-1',
          status: AI_REQUEST_STATUSES.PROCESSING,
          initiatedAt: expect.any(Date),
          createdAt: expect.any(Date),
        }),
      );
    });

    it('persists every required AI Response field, including the raw provider response', async () => {
      openRouterClient.executeReview.mockResolvedValue({
        ok: true,
        provider: 'openrouter',
        model: 'openai/gpt-4o',
        content: JSON.stringify({
          topLevelAssessment: {
            evidenceSufficiencySuggestion: 'strong',
            confidenceRating: 'high',
            colorIndicator: 'Green',
            recommendedAnalystAction: 'accept',
          },
        }),
        rawResponse: { id: 'chatcmpl-2', choices: [] },
      });

      await service.executeReview('doc-1', 'analyst-1', 'analyst');

      expect(aiReviewRepository.insertResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'request-1',
          documentId: baseDoc.id,
          rawResponse: { id: 'chatcmpl-2', choices: [] },
          evidenceSufficiency: 'strong',
          aiConfidence: 'high',
          primaryColorIndicator: 'Green',
          recommendedAnalystAction: 'accept',
          analystReviewStatus: ANALYST_REVIEW_STATUSES.AI_GENERATED,
        }),
        expect.anything(),
      );
    });

    it('sends the active prompt content and the extracted document content to OpenRouter', async () => {
      await service.executeReview('doc-1', 'analyst-1', 'analyst');

      expect(openRouterClient.executeReview).toHaveBeenCalledWith({
        promptContent: baseVersion.promptContent,
        documentContent: 'Document body text',
        model: baseProviderConfig.defaultModel,
      });
    });
  });

  // ================= FAILURE FLOW =================

  describe('when OpenRouter fails', () => {
    beforeEach(() => {
      openRouterClient.executeReview.mockResolvedValue({
        ok: false,
        errorCode: 'http_error',
        errorMessage: 'The AI provider returned an error (HTTP 500)',
      });
    });

    it('transitions the AI Request Processing -> Failed with a sanitized error message', async () => {
      await expect(service.executeReview('doc-1', 'analyst-1', 'analyst')).rejects.toThrow(
        InternalServerErrorException,
      );

      expect(aiReviewRepository.updateRequest).toHaveBeenCalledWith('request-1', {
        status: AI_REQUEST_STATUSES.FAILED,
        errorMessage: 'The AI provider returned an error (HTTP 500)',
        updatedAt: expect.any(Date),
      });
    });

    it('never creates an AI Response', async () => {
      await expect(service.executeReview('doc-1', 'analyst-1', 'analyst')).rejects.toThrow();
      expect(aiReviewRepository.insertResponse).not.toHaveBeenCalled();
    });

    it('marks the document ai_review_failed, not ai_reviewed', async () => {
      await expect(service.executeReview('doc-1', 'analyst-1', 'analyst')).rejects.toThrow();
      expect(documentsService.markAiReviewFailed).toHaveBeenCalledWith('doc-1');
      expect(documentsService.markAiReviewCompleted).not.toHaveBeenCalled();
    });

    it('never persists or throws the API key', async () => {
      let thrown: unknown;
      try {
        await service.executeReview('doc-1', 'analyst-1', 'analyst');
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(InternalServerErrorException);
      expect((thrown as Error).message).not.toContain(FAKE_API_KEY);
      const persistedCall = aiReviewRepository.updateRequest.mock.calls.find(
        (call) => (call[1] as { status?: string }).status === AI_REQUEST_STATUSES.FAILED,
      );
      expect(JSON.stringify(persistedCall)).not.toContain(FAKE_API_KEY);
    });
  });
});
