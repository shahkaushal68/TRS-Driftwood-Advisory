jest.mock('../db', () => ({
  db: {
    select: jest.fn(),
  },
}));

import { db } from '../db';
import type { AiPromptsRepository } from '../ai-prompts/ai-prompts.repository';
import type { UploadService } from '../upload/upload.service';
import { DOCUMENT_STATUSES } from './constants/evidence';
import { DocumentsService } from './documents.service';

/** Mocks the `db.select().from().where()` chain `getReviewProgress` performs — no `.limit`,
 *  since the query returns every matching row. */
function mockDbSelect(rows: unknown[]) {
  const chain = {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockResolvedValue(rows),
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

describe('DocumentsService.getReviewProgress', () => {
  let service: DocumentsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DocumentsService({} as UploadService, {} as unknown as AiPromptsRepository);
  });

  it('reports every required category as not-submitted when the customer has no documents', async () => {
    mockDbSelect([]);

    const result = await service.getReviewProgress('customer-1');

    const dataDomain = result.domains.find((d) => d.domain === 'data_integrity_trust');
    expect(dataDomain).toMatchObject({
      requiredTotal: 5,
      submittedCount: 0,
      aiReviewedCount: 0,
      analystReviewedCount: 0,
      approvedCount: 0,
      status: 'not_started',
    });
    expect(result.categories.every((c) => c.status === null)).toBe(true);
  });

  it('counts a classified-only document as submitted but not yet AI/analyst reviewed', async () => {
    mockDbSelect([baseDoc]);

    const result = await service.getReviewProgress('customer-1');

    const dataDomain = result.domains.find((d) => d.domain === 'data_integrity_trust');
    expect(dataDomain).toMatchObject({
      submittedCount: 1,
      aiReviewedCount: 0,
      analystReviewedCount: 0,
      approvedCount: 0,
      status: 'in_progress',
    });
  });

  it('counts an analyst-validated document as submitted, AI reviewed, analyst reviewed, and approved', async () => {
    mockDbSelect([
      {
        ...baseDoc,
        status: DOCUMENT_STATUSES.ANALYST_REVIEWED,
        analystValidationStatus: 'validated',
      },
    ]);

    const result = await service.getReviewProgress('customer-1');

    const dataDomain = result.domains.find((d) => d.domain === 'data_integrity_trust');
    expect(dataDomain).toMatchObject({
      submittedCount: 1,
      aiReviewedCount: 1,
      analystReviewedCount: 1,
      approvedCount: 1,
    });

    const category = result.categories.find(
      (c) => c.evidenceCategory === 'System of Record Documentation',
    );
    expect(category).toMatchObject({
      documentId: 'doc-1',
      status: DOCUMENT_STATUSES.ANALYST_REVIEWED,
      resetRequired: false,
    });
  });

  it('marks a domain complete only once every required category is approved', async () => {
    const requiredCategories = [
      'System of Record Documentation',
      'Data Ownership / Stewardship',
      'Data Definitions / Data Dictionary',
      'Executive Reporting',
      'Report Lineage / Source Mapping',
    ];
    const approvedDocs = requiredCategories.map((category, index) => ({
      ...baseDoc,
      id: `doc-${String(index)}`,
      evidenceCategory: category,
      status: DOCUMENT_STATUSES.PUBLISHED_TO_END_USER,
      analystValidationStatus: 'validated',
    }));
    mockDbSelect(approvedDocs);

    const result = await service.getReviewProgress('customer-1');

    const dataDomain = result.domains.find((d) => d.domain === 'data_integrity_trust');
    expect(dataDomain).toMatchObject({ approvedCount: 5, requiredTotal: 5, status: 'complete' });
  });

  it('treats a reset-required document as submitted, but flags resetRequired on its category', async () => {
    mockDbSelect([{ ...baseDoc, status: DOCUMENT_STATUSES.RESET_REQUIRED, resetRequired: true }]);

    const result = await service.getReviewProgress('customer-1');

    const category = result.categories.find(
      (c) => c.evidenceCategory === 'System of Record Documentation',
    );
    expect(category?.resetRequired).toBe(true);
  });

  it('uses the most recently updated submission when a category has more than one document', async () => {
    const older = {
      ...baseDoc,
      id: 'doc-old',
      status: DOCUMENT_STATUSES.RESET_REQUIRED,
      resetRequired: true,
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    };
    const newer = {
      ...baseDoc,
      id: 'doc-new',
      status: DOCUMENT_STATUSES.CLASSIFIED,
      resetRequired: false,
      updatedAt: new Date('2026-02-01T00:00:00Z'),
    };
    mockDbSelect([older, newer]);

    const result = await service.getReviewProgress('customer-1');

    const category = result.categories.find(
      (c) => c.evidenceCategory === 'System of Record Documentation',
    );
    expect(category).toMatchObject({ documentId: 'doc-new', resetRequired: false });
  });
});
