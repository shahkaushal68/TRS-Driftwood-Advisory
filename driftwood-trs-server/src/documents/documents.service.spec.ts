jest.mock('../db', () => ({
  db: {
    select: jest.fn(),
  },
}));

import { db } from '../db';
import type { AiPromptsRepository } from '../ai-prompts/ai-prompts.repository';
import { PROMPT_STATUSES } from '../ai-prompts/constants/prompt-status';
import type { UploadService } from '../upload/upload.service';
import { DOCUMENT_STATUSES } from './constants/evidence';
import { DocumentsService } from './documents.service';

/** Mocks the `db.select().from().where().limit(1)` chain `getDocument` performs. */
function mockDbSelect(rows: unknown[]) {
  const chain = {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(rows),
  };
  (db.select as jest.Mock).mockReturnValue(chain);
  return chain;
}

const baseDoc = {
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
  status: DOCUMENT_STATUSES.CLASSIFIED,
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

describe('DocumentsService.getAiReviewEligibility', () => {
  let aiPromptsRepository: jest.Mocked<
    Pick<AiPromptsRepository, 'findTemplateByDomainCategory' | 'findVersionById'>
  >;
  let service: DocumentsService;

  beforeEach(() => {
    jest.clearAllMocks();
    aiPromptsRepository = {
      findTemplateByDomainCategory: jest.fn(),
      findVersionById: jest.fn(),
    };
    service = new DocumentsService(
      {} as UploadService,
      aiPromptsRepository as unknown as AiPromptsRepository,
    );
  });

  it('1. allows AI review for a submitted (classified) document with an active prompt', async () => {
    mockDbSelect([baseDoc]);
    aiPromptsRepository.findTemplateByDomainCategory.mockResolvedValue(baseTemplate);
    aiPromptsRepository.findVersionById.mockResolvedValue(baseVersion);

    const result = await service.getAiReviewEligibility('doc-1', 'analyst-1', 'analyst');

    expect(result.aiReviewEligible).toBe(true);
    expect(result.activePromptId).toBe('template-1');
    expect(result.activePromptVersion).toBe('v1.0');
  });

  it('2. allows AI review for a resubmitted-then-reclassified document (same status check, resubmission lineage is irrelevant)', async () => {
    mockDbSelect([{ ...baseDoc, previousDocumentVersionId: 'old-doc-1' }]);
    aiPromptsRepository.findTemplateByDomainCategory.mockResolvedValue(baseTemplate);
    aiPromptsRepository.findVersionById.mockResolvedValue(baseVersion);

    const result = await service.getAiReviewEligibility('doc-1', 'analyst-1', 'analyst');

    expect(result.aiReviewEligible).toBe(true);
  });

  it('3. rejects when no prompt template exists for the domain/category ("no active prompt")', async () => {
    mockDbSelect([baseDoc]);
    aiPromptsRepository.findTemplateByDomainCategory.mockResolvedValue(null);

    const result = await service.getAiReviewEligibility('doc-1', 'analyst-1', 'analyst');

    expect(result.aiReviewEligible).toBe(false);
    expect(result.reason).toBe('No active prompt exists for this evidence category');
    expect(aiPromptsRepository.findVersionById).not.toHaveBeenCalled();
  });

  it('4. rejects a draft prompt template', async () => {
    mockDbSelect([baseDoc]);
    aiPromptsRepository.findTemplateByDomainCategory.mockResolvedValue({
      ...baseTemplate,
      status: PROMPT_STATUSES.DRAFT,
    });

    const result = await service.getAiReviewEligibility('doc-1', 'analyst-1', 'analyst');

    expect(result.aiReviewEligible).toBe(false);
    expect(result.reason).toBe('Prompt is inactive');
  });

  it('5. rejects when the template is active but its version is not (inactive version)', async () => {
    mockDbSelect([baseDoc]);
    aiPromptsRepository.findTemplateByDomainCategory.mockResolvedValue(baseTemplate);
    aiPromptsRepository.findVersionById.mockResolvedValue({
      ...baseVersion,
      isActive: false,
      status: PROMPT_STATUSES.DRAFT,
    });

    const result = await service.getAiReviewEligibility('doc-1', 'analyst-1', 'analyst');

    expect(result.aiReviewEligible).toBe(false);
    expect(result.reason).toBe('Prompt exists but has no active version');
  });

  it('6. rejects an archived prompt template', async () => {
    mockDbSelect([baseDoc]);
    aiPromptsRepository.findTemplateByDomainCategory.mockResolvedValue({
      ...baseTemplate,
      status: PROMPT_STATUSES.ARCHIVED,
    });

    const result = await service.getAiReviewEligibility('doc-1', 'analyst-1', 'analyst');

    expect(result.aiReviewEligible).toBe(false);
    expect(result.reason).toBe('Prompt is inactive');
  });

  it('7. rejects a document that is Reset / Resubmission Required', async () => {
    mockDbSelect([{ ...baseDoc, status: DOCUMENT_STATUSES.RESET_REQUIRED, resetRequired: true }]);
    aiPromptsRepository.findTemplateByDomainCategory.mockResolvedValue(baseTemplate);
    aiPromptsRepository.findVersionById.mockResolvedValue(baseVersion);

    const result = await service.getAiReviewEligibility('doc-1', 'analyst-1', 'analyst');

    expect(result.aiReviewEligible).toBe(false);
  });

  it('8. rejects a document that has not been submitted (uploaded, unclassified)', async () => {
    mockDbSelect([
      { ...baseDoc, status: DOCUMENT_STATUSES.UPLOADED, trsDomain: null, evidenceCategory: null },
    ]);

    const result = await service.getAiReviewEligibility('doc-1', 'analyst-1', 'analyst');

    expect(result.aiReviewEligible).toBe(false);
    expect(result.reason).toBe(
      'Document has not been classified with a TRS domain and evidence category',
    );
    expect(aiPromptsRepository.findTemplateByDomainCategory).not.toHaveBeenCalled();
  });
});
