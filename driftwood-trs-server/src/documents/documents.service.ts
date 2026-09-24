import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, count, desc, eq, isNotNull, isNull, ne } from 'drizzle-orm';
import { randomUUID } from 'crypto';

import { db } from '../db';
import {
  aiAnalysis,
  intakeDocument,
  intakeDocumentFinding,
  manualReview,
  user,
  type AiRawOutput,
} from '../db/schema';
import { UploadService } from '../upload/upload.service';
import { AiPromptsRepository } from '../ai-prompts/ai-prompts.repository';
import { PROMPT_STATUSES } from '../ai-prompts/constants/prompt-status';
import {
  ANALYST_VALIDATION_STATUSES,
  DOCUMENT_STATUSES,
  MANUAL_REVIEW_STATUSES,
  REQUIRED_EVIDENCE_BY_DOMAIN,
  ALL_DOMAINS,
  TRS_DOMAIN_LABELS,
} from './constants/evidence';
import type { AppRole } from '../auth/roles';
import type { ClassifyDocumentDto } from './dto/classify-document.dto';
import type { CreateFindingDto } from './dto/create-finding.dto';
import type { CreateManualReviewDto } from './dto/create-manual-review.dto';
import type { RegisterDocumentDto } from './dto/register-document.dto';
import type { ResetDocumentDto } from './dto/reset-document.dto';
import type { ResubmitDocumentDto } from './dto/resubmit-document.dto';
import type { SetSufficiencyDto } from './dto/set-sufficiency.dto';
import type { UpdateFindingDto } from './dto/update-finding.dto';
import type { UpdateAiAnalysisDto } from './dto/update-ai-analysis.dto';
import type { UpdateManualReviewDto } from './dto/update-manual-review.dto';
import {
  type PaginatedResponse,
  type PaginationQueryDto,
  paginatedResponse,
} from '../libs/pagination';

export type IntakeDocument = typeof intakeDocument.$inferSelect;
export type IntakeDocumentFinding = typeof intakeDocumentFinding.$inferSelect;
export type AiAnalysis = typeof aiAnalysis.$inferSelect;
export type ManualReview = typeof manualReview.$inferSelect;

export interface IntakeDocumentWithUser extends IntakeDocument {
  uploadedByUser: Pick<typeof user.$inferSelect, 'id' | 'name' | 'email'>;
}

export interface AiReviewEligibilityResult {
  documentSubmissionId: string;
  trsDomain: string | null;
  evidenceCategory: string | null;
  aiReviewEligible: boolean;
  activePromptId: string | null;
  activePromptVersion: string | null;
  reason: string;
}

export interface EvidenceDomainSummary {
  domain: string;
  domainLabel: string;
  requiredTotal: number;
  uploadedRequired: string[];
  missingRequired: string[];
  status: 'missing' | 'partial' | 'complete';
}

/**
 * Server-computed review-progress rollup for one TRS domain, backing the End User TRS Review
 * Progress Dashboard (see `getReviewProgress`). Every count here is derived from real
 * `intake_document` rows — never invented — so the frontend only ever renders numbers this
 * service produced, rather than re-deriving them from a raw document list itself.
 */
export interface DomainReviewProgress {
  domain: string;
  domainLabel: string;
  requiredTotal: number;
  submittedCount: number;
  aiReviewedCount: number;
  analystReviewedCount: number;
  approvedCount: number;
  status: 'not_started' | 'in_progress' | 'complete';
}

/**
 * One required evidence category's current review stage, for the dashboard's Evidence
 * Category Review Status table. `status` is the raw internal `DOCUMENT_STATUSES` value (or
 * `null` when the category has no submission yet) — deliberately not customer-facing wording;
 * the frontend owns mapping this to a customer-friendly label in one reusable utility (mirrors
 * how `DOCUMENT_STATUS_LABELS` already works for the admin/analyst UI).
 */
export interface CategoryReviewStatus {
  domain: string;
  domainLabel: string;
  evidenceCategory: string;
  documentId: string | null;
  status: string | null;
  resetRequired: boolean;
  updatedAt: Date | null;
}

export interface ReviewProgressResult {
  domains: DomainReviewProgress[];
  categories: CategoryReviewStatus[];
}

const AI_FINDING_TEMPLATES: {
  title: string;
  body: (domain: string, category: string, evidenceType: string) => string;
}[] = [
  {
    title: 'Initial Document Assessment',
    body: (domain, category) =>
      `This document has been classified under the "${category}" evidence category for the ${TRS_DOMAIN_LABELS[domain] ?? domain} domain. Based on the document classification, this submission appears to align with the expected evidence requirements for this category. No structural issues detected.`,
  },
  {
    title: 'Evidence Relevance Assessment',
    body: (domain, category) =>
      `The uploaded document provides documentation relevant to "${category}" within the ${TRS_DOMAIN_LABELS[domain] ?? domain} review framework. Based on the classification metadata and document type, this document appears to address key aspects of the domain requirements. Analyst review is recommended to validate completeness and confirm relevance against the POC evaluation criteria.`,
  },
  {
    title: 'Preliminary Sufficiency Indicator',
    body: (_domain, _category, evidenceType) =>
      `This document has been designated as "${evidenceType}" evidence. Based on the evidence type and classification, this document contributes to the evidence package submitted for this domain. The Analyst should assess whether this document — in combination with other submitted evidence — satisfies the overall domain requirements and assign an appropriate sufficiency rating.`,
  },
];

const CATEGORY_SIGNALS: Record<
  string,
  { readiness: string[]; gaps: string[]; steps: string[]; questions: string[] }
> = {
  'System of Record Documentation': {
    readiness: ['Authoritative data source identified', 'System of record ownership documented'],
    gaps: ['Cross-system reconciliation evidence missing'],
    steps: [
      'Confirm system of record aligns with enterprise data architecture',
      'Validate ownership assignment against org chart',
    ],
    questions: [
      'Is this the single authoritative source for this data?',
      'Who is responsible for maintaining this system of record?',
      'How is data lineage tracked from this system?',
    ],
  },
  'Data Ownership / Stewardship': {
    readiness: ['Accountable data owner identified', 'Stewardship responsibilities documented'],
    gaps: ['Escalation path for data disputes not defined'],
    steps: ['Verify data owner has appropriate authority', 'Document stewardship review cadence'],
    questions: [
      'Does the data owner have formal accountability in the governance framework?',
      'Are stewardship responsibilities reviewed annually?',
    ],
  },
  'Data Definitions / Data Dictionary': {
    readiness: [
      'Business glossary entry present',
      'Technical definition aligned with business definition',
    ],
    gaps: ['Versioning history for definitions not captured'],
    steps: [
      'Confirm definitions are approved by data governance board',
      'Link definitions to source system fields',
    ],
    questions: [
      'Are these definitions used consistently across reporting?',
      'When were these definitions last reviewed?',
    ],
  },
  'Executive Reporting': {
    readiness: ['Report tied to executive audience', 'Metrics definition documented'],
    gaps: ['Data freshness and refresh schedule not specified'],
    steps: [
      'Confirm report is part of an official reporting cadence',
      'Validate metric definitions match the data dictionary',
    ],
    questions: [
      'Is this report reviewed by the executive team on a regular schedule?',
      'Are the KPIs in this report formally defined?',
    ],
  },
  'Report Lineage / Source Mapping': {
    readiness: ['Source systems identified', 'Transformation logic documented'],
    gaps: ['End-to-end lineage from raw to published not shown'],
    steps: ['Map all intermediate transformations', 'Confirm lineage is version-controlled'],
    questions: [
      'Can every metric in this report be traced to a source system?',
      'Is lineage automatically captured or manually maintained?',
    ],
  },
  'Data Governance Policy': {
    readiness: ['Policy document present', 'Approval and ownership noted'],
    gaps: ['Policy enforcement mechanism not described'],
    steps: [
      'Verify policy has been formally ratified',
      'Check if policy references are included in onboarding materials',
    ],
    questions: [
      'Is this policy enforced through automated controls?',
      'How often is this policy reviewed and updated?',
    ],
  },
  'Data Quality Monitoring': {
    readiness: ['Quality rules defined', 'Monitoring frequency established'],
    gaps: ['Threshold breach escalation process not documented'],
    steps: [
      'Confirm monitoring alerts are routed to the data owner',
      'Review recent quality scorecard results',
    ],
    questions: [
      'What happens when a data quality threshold is breached?',
      'Are quality metrics tracked over time?',
    ],
  },
  'Reconciliation Process': {
    readiness: ['Reconciliation steps documented', 'Responsible party identified'],
    gaps: ['Frequency and sign-off process not captured'],
    steps: [
      'Confirm reconciliation outputs are reviewed by a data owner',
      'Document exception handling process',
    ],
    questions: [
      'How are reconciliation discrepancies resolved?',
      'Is there a formal sign-off on reconciliation results?',
    ],
  },
  'Data Issue / Exception Log': {
    readiness: ['Log format defined', 'Issues tracked to resolution'],
    gaps: ['Root cause analysis process not described'],
    steps: [
      'Verify log is reviewed on a regular cadence',
      'Confirm open issues have owners assigned',
    ],
    questions: [
      'Are data issues categorized by severity?',
      'What is the SLA for resolving high-severity data issues?',
    ],
  },
  'Audit Trail / Change History': {
    readiness: ['Change events captured', 'Audit log access controlled'],
    gaps: ['Retention policy for audit records not specified'],
    steps: [
      'Confirm audit trail is tamper-evident',
      'Verify audit logs meet compliance requirements',
    ],
    questions: ['How long are audit records retained?', 'Who has access to review audit logs?'],
  },
  'Analytical Model Inputs': {
    readiness: ['Input data sources listed', 'Feature definitions documented'],
    gaps: ['Model retraining cadence not specified'],
    steps: [
      'Validate input data quality thresholds for model use',
      'Document model input versioning approach',
    ],
    questions: [
      'Are model inputs subject to the same data quality standards as reporting?',
      'How are input data changes communicated to model owners?',
    ],
  },
  'Access Control / Permissions': {
    readiness: ['Access roles defined', 'Permissions aligned with data classification'],
    gaps: ['Periodic access review schedule not documented'],
    steps: [
      'Confirm access control list is reviewed at least annually',
      'Validate least-privilege principle is applied',
    ],
    questions: [
      'How are access changes requested and approved?',
      'Is there a process for revoking access when roles change?',
    ],
  },
  'Data Integration / Interface Documentation': {
    readiness: ['Interface contract documented', 'Data schema shared with consuming systems'],
    gaps: ['Error handling and retry logic not specified'],
    steps: [
      'Validate interface documentation is version-controlled',
      'Confirm integration tests exist for critical data flows',
    ],
    questions: [
      'What is the process for communicating breaking schema changes?',
      'Are integration SLAs documented?',
    ],
  },
  'Governance Charter': {
    readiness: ['Charter document present', 'Scope and authority defined'],
    gaps: ['Charter ratification date not recorded'],
    steps: [
      'Verify charter has been approved by the appropriate governing body',
      'Confirm charter is referenced in committee meeting materials',
    ],
    questions: [
      'When was this charter last reviewed?',
      'Does the charter define decision authority and escalation paths?',
    ],
  },
  'Decision Rights / RACI': {
    readiness: ['RACI matrix documented', 'Decision owners assigned per data domain'],
    gaps: ['Decision escalation thresholds not defined'],
    steps: [
      'Confirm RACI is aligned with the governance charter',
      'Validate accountability assignments with HR records',
    ],
    questions: [
      'How are RACI assignments updated when organizational structures change?',
      'Are there documented examples of RACI application in past decisions?',
    ],
  },
  'Steering Committee Materials': {
    readiness: ['Committee membership documented', 'Meeting cadence established'],
    gaps: ['Attendance and quorum requirements not specified'],
    steps: [
      'Confirm committee charter references decision rights',
      'Review last three meeting minutes for evidence of active governance',
    ],
    questions: [
      'Does the steering committee have formal authority over data governance decisions?',
      'Are meeting outcomes documented and distributed?',
    ],
  },
  'Meeting Minutes': {
    readiness: ['Minutes are dated and attributed', 'Action items recorded'],
    gaps: ['Follow-up tracking mechanism not visible'],
    steps: [
      'Confirm minutes are stored in a version-controlled location',
      'Verify action items are assigned and tracked to completion',
    ],
    questions: [
      'Are minutes reviewed and approved by attendees?',
      'How are decisions from meetings communicated to stakeholders?',
    ],
  },
  'Decision Log': {
    readiness: ['Decisions recorded with rationale', 'Decision owners identified'],
    gaps: ['Review and expiry dates for past decisions not tracked'],
    steps: [
      'Validate log is maintained consistently after each governance meeting',
      'Confirm decisions reference relevant policies or charters',
    ],
    questions: [
      'How long are decision records retained?',
      'Is there a process to revisit and update outdated decisions?',
    ],
  },
  'Escalation Process': {
    readiness: ['Escalation triggers defined', 'Escalation path documented'],
    gaps: ['SLAs for escalation resolution not specified'],
    steps: [
      'Confirm escalation process is referenced in the governance charter',
      'Validate that escalation contacts are current',
    ],
    questions: [
      'What types of issues require escalation to the steering committee?',
      'Is there a tracked record of past escalations and their outcomes?',
    ],
  },
  'Transformation Roadmap / Program Charter': {
    readiness: ['Roadmap milestones documented', 'Program sponsor identified'],
    gaps: ['Dependencies on other programs not mapped'],
    steps: [
      'Verify roadmap is reviewed at steering committee meetings',
      'Confirm charter includes success metrics',
    ],
    questions: [
      'How are roadmap changes communicated to stakeholders?',
      'Is the transformation program aligned with the enterprise data strategy?',
    ],
  },
  'Risk Register': {
    readiness: ['Risks identified and categorized', 'Risk owners assigned'],
    gaps: ['Residual risk after mitigation not assessed'],
    steps: [
      'Confirm risk register is reviewed on a regular cadence',
      'Validate that risk ratings are consistent with enterprise risk framework',
    ],
    questions: [
      'How are new risks surfaced and added to the register?',
      'Are there open risks with no mitigation plan?',
    ],
  },
  'Change Control Process': {
    readiness: ['Change request process defined', 'Approval authority documented'],
    gaps: ['Rollback procedure not described'],
    steps: [
      'Confirm change control applies to data schema and pipeline changes',
      'Verify change log is maintained and accessible',
    ],
    questions: [
      'Is there an emergency change process for critical data fixes?',
      'How are impacted stakeholders notified of approved changes?',
    ],
  },
  'Cross-Functional Sponsorship': {
    readiness: ['Sponsor names and roles documented', 'Sponsorship scope defined'],
    gaps: ['Engagement frequency with sponsors not specified'],
    steps: [
      'Confirm sponsors have formal authority to commit resources',
      'Validate sponsorship is referenced in program charter',
    ],
    questions: [
      'Are sponsors actively engaged in governance decisions?',
      'How is sponsor alignment maintained across organizational changes?',
    ],
  },
  'Compliance / Legal Oversight': {
    readiness: ['Compliance requirements identified', 'Legal review documented'],
    gaps: ['Regulatory update monitoring process not described'],
    steps: [
      'Confirm compliance obligations are mapped to data governance controls',
      'Verify legal review was completed for applicable regulations',
    ],
    questions: [
      'How are new regulatory requirements tracked and incorporated?',
      'Is there a compliance attestation process for data governance?',
    ],
  },
  'Human Override / Exception Authority': {
    readiness: ['Override conditions defined', 'Authorized approvers listed'],
    gaps: ['Audit trail for overrides not specified'],
    steps: [
      'Confirm override process requires documented rationale',
      'Validate override authority aligns with the RACI matrix',
    ],
    questions: [
      'Are overrides tracked and reviewed periodically?',
      'What controls exist to prevent unauthorized exceptions?',
    ],
  },
  'Version-Controlled Governance Documentation': {
    readiness: ['Version history maintained', 'Change log present'],
    gaps: ['Approval workflow for version promotion not documented'],
    steps: [
      'Verify documentation is stored in a version control system',
      'Confirm stakeholders are notified of version updates',
    ],
    questions: [
      'How are document versions approved before publication?',
      'Is there a process for deprecating outdated versions?',
    ],
  },
  'Governance Failure Review': {
    readiness: ['Failure cases documented', 'Root cause analysis completed'],
    gaps: ['Remediation tracking not captured'],
    steps: [
      'Confirm failure reviews are presented at steering committee',
      'Validate corrective actions are assigned and tracked',
    ],
    questions: [
      'Are governance failures categorized by type and severity?',
      'How are lessons learned incorporated into process improvements?',
    ],
  },
};

const DEFAULT_SIGNALS = {
  readiness: ['Document classification verified', 'Evidence submitted for review'],
  gaps: ['Additional context may be required for complete assessment'],
  steps: [
    'Analyst to review document against domain requirements',
    'Confirm evidence completeness with domain owner',
  ],
  questions: [
    'Does this document address all required aspects of the evidence category?',
    'Are there supplementary documents that should be submitted?',
  ],
};

interface AiAnalysisPayload {
  rawOutput: AiRawOutput;
  aiVerdict: 'pass' | 'review' | 'failed';
}

function deriveVerdict(suggestion: string): 'pass' | 'review' | 'failed' {
  if (suggestion === 'strong') return 'pass';
  if (suggestion === 'insufficient' || suggestion === 'not_relevant') return 'failed';
  return 'review';
}

function colorFromSufficiency(suggestion: string): 'Green' | 'Yellow' | 'Red' {
  if (suggestion === 'strong') return 'Green';
  if (suggestion === 'insufficient' || suggestion === 'not_relevant') return 'Red';
  return 'Yellow';
}

function hashDocumentId(documentId: string): number {
  let hash = 0;
  for (let i = 0; i < documentId.length; i++) {
    const char = documentId.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function generateMockAiAnalysis(
  documentId: string,
  domain: string,
  category: string,
  evidenceType: string,
): AiAnalysisPayload {
  const hash = hashDocumentId(documentId);
  const domainLabel = TRS_DOMAIN_LABELS[domain] ?? domain;
  const signals = CATEGORY_SIGNALS[category] ?? DEFAULT_SIGNALS;

  const evidenceSufficiencyMap: Record<string, string> = {
    required: 'partial',
    optional: 'strong',
    other: 'needs_human_followup',
  };
  const confidenceOptions = ['high', 'medium', 'low'] as const;

  const evidenceSufficiencySuggestion =
    evidenceSufficiencyMap[evidenceType] ?? 'needs_human_followup';
  const confidenceRating = confidenceOptions[hash % 3] ?? 'medium';
  const colorIndicator = colorFromSufficiency(evidenceSufficiencySuggestion);
  const aiVerdict = deriveVerdict(evidenceSufficiencySuggestion);

  const includeValidationQuestions =
    evidenceSufficiencySuggestion === 'needs_human_followup' ||
    evidenceSufficiencySuggestion === 'partial';

  const rawOutput: AiRawOutput = {
    reviewHeader: {
      domain,
      domainLabel,
      category,
      evidenceType,
      generatedAt: new Date().toISOString(),
    },
    topLevelAssessment: {
      evidenceSufficiencySuggestion,
      colorIndicator,
      confidenceRating,
      recommendedAnalystAction: 'edit',
    },
    executiveSummary: `This document has been submitted as evidence for the "${category}" category within the ${domainLabel} domain. Based on the document metadata and classification, the submission appears to address core requirements for this evidence type. Analyst review is required to confirm completeness and accuracy.`,
    documentQualityReview: `The document has been classified under "${category}" as ${evidenceType} evidence. Document metadata is complete and the submission is structurally sound. Content analysis was not performed — analyst should verify that the document content directly supports the claimed evidence category.`,
    systemOfRecordReadinessFindings: signals.readiness,
    systemOfRecordCoverageReview: `Coverage assessment is based on document classification and metadata only. The submitted document is expected to address "${category}" requirements for the ${domainLabel} domain. Additional documents may be required to demonstrate complete coverage of all domain requirements.`,
    evidenceGaps: signals.gaps,
    humanValidationQuestions: includeValidationQuestions ? signals.questions : [],
    suggestedNextSteps: signals.steps,
    draftAnalystFinding: `AI-generated preliminary finding: This document, classified as "${category}" evidence (${evidenceType}), has been reviewed based on metadata and classification. The evidence sufficiency is assessed as ${evidenceSufficiencySuggestion} with ${confidenceRating} confidence. Analyst validation and final determination required before publishing.`,
    limitationsAndUncertainties:
      'Analysis is based on document metadata and classification only — document content was not read. AI confidence ratings and sufficiency suggestions are preliminary and must be validated by a qualified Analyst before any findings are published.',
  };

  return { rawOutput, aiVerdict };
}

const DOCUMENT_SORT_COLUMNS = {
  createdAt: intakeDocument.createdAt,
  trsDomain: intakeDocument.trsDomain,
  evidenceCategory: intakeDocument.evidenceCategory,
} as const;

function requireReturnedRow<T>(rows: T[], message: string): T {
  const row = rows[0];
  if (row === undefined) throw new InternalServerErrorException(message);
  return row;
}

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly uploadService: UploadService,
    private readonly aiPromptsRepository: AiPromptsRepository,
  ) {}

  async registerDocument(userId: string, dto: RegisterDocumentDto): Promise<IntakeDocument> {
    const now = new Date();
    const id = randomUUID();

    const rows = await db
      .insert(intakeDocument)
      .values({
        id,
        uploadedBy: userId,
        fileName: dto.fileName,
        fileType: dto.fileType,
        s3Key: dto.s3Key,
        fileSize: dto.fileSize ?? null,
        status: DOCUMENT_STATUSES.UPLOADED,
        aiReviewStatus: 'pending',
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return requireReturnedRow(rows, 'Document registration did not return a row');
  }

  async listMyDocuments(
    userId: string,
    query: PaginationQueryDto,
  ): Promise<PaginatedResponse<IntakeDocument>> {
    const whereClause = and(
      eq(intakeDocument.uploadedBy, userId),
      isNull(intakeDocument.deletedAt),
    );
    const sortCol =
      (
        DOCUMENT_SORT_COLUMNS as Record<
          string,
          (typeof DOCUMENT_SORT_COLUMNS)[keyof typeof DOCUMENT_SORT_COLUMNS]
        >
      )[query.sortBy] ?? intakeDocument.createdAt;
    const orderBy = query.sortDirection === 'asc' ? asc(sortCol) : desc(sortCol);
    const offset = (query.pageNumber - 1) * query.perPage;

    const [[countResult], data] = await Promise.all([
      db.select({ total: count() }).from(intakeDocument).where(whereClause),
      db
        .select()
        .from(intakeDocument)
        .where(whereClause)
        .orderBy(orderBy)
        .limit(query.perPage)
        .offset(offset),
    ]);

    return paginatedResponse(data, countResult?.total ?? 0, query);
  }

  async getAllDocuments(
    userId: string | undefined,
    query: PaginationQueryDto,
  ): Promise<PaginatedResponse<IntakeDocumentWithUser>> {
    const whereClause = and(
      userId ? eq(intakeDocument.uploadedBy, userId) : undefined,
      isNull(intakeDocument.deletedAt),
    );
    const sortCol =
      (
        DOCUMENT_SORT_COLUMNS as Record<
          string,
          (typeof DOCUMENT_SORT_COLUMNS)[keyof typeof DOCUMENT_SORT_COLUMNS]
        >
      )[query.sortBy] ?? intakeDocument.createdAt;
    const orderBy = query.sortDirection === 'asc' ? asc(sortCol) : desc(sortCol);
    const offset = (query.pageNumber - 1) * query.perPage;

    const [[countResult], data] = await Promise.all([
      db.select({ total: count() }).from(intakeDocument).where(whereClause),
      db
        .select({
          id: intakeDocument.id,
          uploadedBy: intakeDocument.uploadedBy,
          fileName: intakeDocument.fileName,
          fileType: intakeDocument.fileType,
          s3Key: intakeDocument.s3Key,
          fileSize: intakeDocument.fileSize,
          trsDomain: intakeDocument.trsDomain,
          evidenceCategory: intakeDocument.evidenceCategory,
          evidenceType: intakeDocument.evidenceType,
          notes: intakeDocument.notes,
          status: intakeDocument.status,
          aiReviewStatus: intakeDocument.aiReviewStatus,
          analystId: intakeDocument.analystId,
          sufficiencyRating: intakeDocument.sufficiencyRating,
          analystValidationStatus: intakeDocument.analystValidationStatus,
          publishedAt: intakeDocument.publishedAt,
          resetRequired: intakeDocument.resetRequired,
          resetReason: intakeDocument.resetReason,
          requestedCorrection: intakeDocument.requestedCorrection,
          resetByUserId: intakeDocument.resetByUserId,
          resetByName: intakeDocument.resetByName,
          resetAt: intakeDocument.resetAt,
          resetDueDate: intakeDocument.resetDueDate,
          previousDocumentVersionId: intakeDocument.previousDocumentVersionId,
          resubmittedDocumentVersionId: intakeDocument.resubmittedDocumentVersionId,
          deletedAt: intakeDocument.deletedAt,
          createdAt: intakeDocument.createdAt,
          updatedAt: intakeDocument.updatedAt,
          uploadedByUser: {
            id: user.id,
            name: user.name,
            email: user.email,
          },
        })
        .from(intakeDocument)
        .innerJoin(user, eq(intakeDocument.uploadedBy, user.id))
        .where(whereClause)
        .orderBy(orderBy)
        .limit(query.perPage)
        .offset(offset),
    ]);

    return paginatedResponse(data, countResult?.total ?? 0, query);
  }

  async getDocument(
    documentId: string,
    requesterId: string,
    requesterRole: AppRole,
  ): Promise<IntakeDocument> {
    const rows = await db
      .select()
      .from(intakeDocument)
      .where(and(eq(intakeDocument.id, documentId), isNull(intakeDocument.deletedAt)))
      .limit(1);

    const doc = rows[0];
    if (!doc) throw new NotFoundException('Document not found');

    if (requesterRole === 'user' && doc.uploadedBy !== requesterId) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return doc;
  }

  /**
   * Determines whether a document submission is eligible for AI Review. This is a
   * pure read/lookup check — it never calls OpenRouter or any AI provider, and never
   * triggers or executes a review.
   *
   * AI Review is eligible only when ALL of the following hold:
   *  - the document has been classified with a TRS domain + evidence category
   *  - an (undeleted) Prompt Template exists for that domain/category pair
   *  - that Prompt Template's status is 'active'
   *  - that Prompt Template has an active version which is itself active/undeleted
   *  - the document submission's own status permits AI review, i.e. `classified`
   *    (the same precondition already enforced by `submitForAiReview`/`batchTriggerAiReview`)
   */
  async getAiReviewEligibility(
    documentId: string,
    requesterId: string,
    requesterRole: AppRole,
  ): Promise<AiReviewEligibilityResult> {
    const doc = await this.getDocument(documentId, requesterId, requesterRole);

    const trsDomain = doc.trsDomain;
    const evidenceCategory = doc.evidenceCategory;

    const ineligible = (reason: string): AiReviewEligibilityResult => ({
      documentSubmissionId: doc.id,
      trsDomain,
      evidenceCategory,
      aiReviewEligible: false,
      activePromptId: null,
      activePromptVersion: null,
      reason,
    });

    if (!trsDomain || !evidenceCategory) {
      return ineligible('Document has not been classified with a TRS domain and evidence category');
    }

    const template = await this.aiPromptsRepository.findTemplateByDomainCategory(
      trsDomain,
      evidenceCategory,
    );
    if (!template) {
      return ineligible('No active prompt exists for this evidence category');
    }
    if (template.status !== PROMPT_STATUSES.ACTIVE) {
      return ineligible('Prompt is inactive');
    }
    if (!template.activeVersionId) {
      return ineligible('Prompt exists but has no active version');
    }

    const activeVersion = await this.aiPromptsRepository.findVersionById(template.activeVersionId);
    if (
      !activeVersion ||
      !activeVersion.isActive ||
      activeVersion.status !== PROMPT_STATUSES.ACTIVE
    ) {
      return ineligible('Prompt exists but has no active version');
    }

    // Re-running is allowed from any status a document can reach *without* an analyst
    // having made an explicit terminal call on it: `classified` (never reviewed),
    // `ai_reviewed`/`ai_review_failed` (the real pipeline's own outcomes — lets an Analyst
    // retry after a failure, or re-run one that only ever went through the legacy mock
    // "Submit for AI Review" bulk flow and so has no real `ai_review_response` yet), and
    // `analyst_reviewed` (an Analyst re-running before publishing). Deliberately excludes
    // `uploaded` (not yet classified — already caught above), `ai_review_in_progress`
    // (already running), `published_to_end_user` (already published — re-running could
    // silently invalidate what was published), and the analyst-assigned terminal calls
    // `insufficient_evidence`/`rejected_not_relevant`/`reset_required`.
    const rerunnableStatuses: readonly string[] = [
      DOCUMENT_STATUSES.CLASSIFIED,
      DOCUMENT_STATUSES.AI_REVIEWED,
      DOCUMENT_STATUSES.AI_REVIEW_FAILED,
      DOCUMENT_STATUSES.ANALYST_REVIEWED,
    ];
    if (!rerunnableStatuses.includes(doc.status)) {
      return ineligible('Document is not eligible for AI review in its current status');
    }

    return {
      documentSubmissionId: doc.id,
      trsDomain,
      evidenceCategory,
      aiReviewEligible: true,
      activePromptId: template.id,
      activePromptVersion: activeVersion.versionLabel,
      reason: 'Active prompt found',
    };
  }

  /**
   * These three mirror the exact status/aiReviewStatus transitions `submitForAiReview`
   * already applies around its own (mocked) AI call, factored out so the real,
   * OpenRouter-backed flow (`AiReviewService.executeReview`) can apply the same
   * transitions without duplicating `submitForAiReview` itself or reaching into
   * `intakeDocument` directly from another module. No new status values — reuses
   * `DOCUMENT_STATUSES.AI_REVIEW_IN_PROGRESS`/`AI_REVIEWED`/`AI_REVIEW_FAILED`.
   */
  async markAiReviewInProgress(documentId: string): Promise<void> {
    await db
      .update(intakeDocument)
      .set({
        status: DOCUMENT_STATUSES.AI_REVIEW_IN_PROGRESS,
        aiReviewStatus: 'in_progress',
        updatedAt: new Date(),
      })
      .where(eq(intakeDocument.id, documentId));
  }

  async markAiReviewCompleted(documentId: string): Promise<void> {
    await db
      .update(intakeDocument)
      .set({
        status: DOCUMENT_STATUSES.AI_REVIEWED,
        aiReviewStatus: 'completed',
        updatedAt: new Date(),
      })
      .where(eq(intakeDocument.id, documentId));
  }

  async markAiReviewFailed(documentId: string): Promise<void> {
    await db
      .update(intakeDocument)
      .set({
        status: DOCUMENT_STATUSES.AI_REVIEW_FAILED,
        aiReviewStatus: 'failed',
        updatedAt: new Date(),
      })
      .where(eq(intakeDocument.id, documentId));
  }

  async classifyDocument(
    documentId: string,
    requesterId: string,
    requesterRole: AppRole,
    dto: ClassifyDocumentDto,
  ): Promise<IntakeDocument> {
    const doc = await this.getDocument(documentId, requesterId, requesterRole);

    if (requesterRole === 'user' && doc.uploadedBy !== requesterId) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const lockedStatuses: readonly string[] = [
      DOCUMENT_STATUSES.AI_REVIEW_IN_PROGRESS,
      DOCUMENT_STATUSES.AI_REVIEWED,
      DOCUMENT_STATUSES.ANALYST_REVIEWED,
      DOCUMENT_STATUSES.PUBLISHED_TO_END_USER,
    ];

    if (lockedStatuses.includes(doc.status)) {
      throw new BadRequestException(
        'Document classification cannot be changed after AI review has started',
      );
    }

    const rows = await db
      .update(intakeDocument)
      .set({
        trsDomain: dto.trsDomain,
        evidenceCategory: dto.evidenceCategory,
        evidenceType: dto.evidenceType,
        notes: dto.notes ?? null,
        status: DOCUMENT_STATUSES.CLASSIFIED,
        updatedAt: new Date(),
      })
      .where(eq(intakeDocument.id, documentId))
      .returning();

    return requireReturnedRow(rows, 'Document classification did not return a row');
  }

  async getEvidenceSummary(userId: string): Promise<EvidenceDomainSummary[]> {
    const docs = await db
      .select()
      .from(intakeDocument)
      .where(
        and(
          eq(intakeDocument.uploadedBy, userId),
          ne(intakeDocument.status, DOCUMENT_STATUSES.REJECTED_NOT_RELEVANT),
          isNotNull(intakeDocument.trsDomain),
          isNotNull(intakeDocument.evidenceCategory),
          isNull(intakeDocument.deletedAt),
        ),
      );

    return ALL_DOMAINS.map((domain) => {
      const required = REQUIRED_EVIDENCE_BY_DOMAIN[domain] ?? [];
      const domainDocs = docs.filter((d) => d.trsDomain === domain);
      const uploadedCategories = new Set(domainDocs.map((d) => d.evidenceCategory));
      const uploadedRequired = required.filter((r) => uploadedCategories.has(r));
      const missingRequired = required.filter((r) => !uploadedCategories.has(r));

      let status: 'missing' | 'partial' | 'complete';
      if (uploadedRequired.length === 0) status = 'missing';
      else if (uploadedRequired.length === required.length) status = 'complete';
      else status = 'partial';

      return {
        domain,
        domainLabel: TRS_DOMAIN_LABELS[domain] ?? domain,
        requiredTotal: required.length,
        uploadedRequired,
        missingRequired,
        status,
      };
    });
  }

  /**
   * Server-computed review-progress rollup for the End User TRS Review Progress Dashboard —
   * per-domain counts (submitted / AI reviewed / analyst reviewed / approved) plus a
   * per-category review stage. Computed here, once, from the same `intake_document` rows
   * `getEvidenceSummary` already reads, so the frontend dashboard never re-derives these
   * counts (or a customer-visible "approved" total) from a raw document list itself.
   *
   * For a required category with more than one non-rejected submission (e.g. after a reset +
   * resubmit), the most recently updated document is treated as that category's current
   * state — an older, superseded submission never masks a newer one's progress.
   */
  async getReviewProgress(userId: string): Promise<ReviewProgressResult> {
    const docs = await db
      .select()
      .from(intakeDocument)
      .where(
        and(
          eq(intakeDocument.uploadedBy, userId),
          ne(intakeDocument.status, DOCUMENT_STATUSES.REJECTED_NOT_RELEVANT),
          isNotNull(intakeDocument.trsDomain),
          isNotNull(intakeDocument.evidenceCategory),
          isNull(intakeDocument.deletedAt),
        ),
      );

    // AI review is done once a document has moved past `ai_review_in_progress`.
    const aiReviewedStatuses: string[] = [
      DOCUMENT_STATUSES.AI_REVIEWED,
      DOCUMENT_STATUSES.ANALYST_REVIEWED,
      DOCUMENT_STATUSES.PUBLISHED_TO_END_USER,
      DOCUMENT_STATUSES.INSUFFICIENT_EVIDENCE,
    ];
    // Analyst review is done once a verdict (validated/rejected) or a terminal status has
    // been recorded — `in_review` alone means an analyst has opened it but not decided yet.
    const analystReviewedStatuses: string[] = [
      DOCUMENT_STATUSES.ANALYST_REVIEWED,
      DOCUMENT_STATUSES.PUBLISHED_TO_END_USER,
      DOCUMENT_STATUSES.INSUFFICIENT_EVIDENCE,
    ];

    const categories: CategoryReviewStatus[] = [];
    const domains: DomainReviewProgress[] = ALL_DOMAINS.map((domain) => {
      const required = REQUIRED_EVIDENCE_BY_DOMAIN[domain] ?? [];
      const domainLabel = TRS_DOMAIN_LABELS[domain] ?? domain;
      const domainDocs = docs.filter((d) => d.trsDomain === domain);

      let submittedCount = 0;
      let aiReviewedCount = 0;
      let analystReviewedCount = 0;
      let approvedCount = 0;

      for (const category of required) {
        // Latest-updated non-rejected submission for this category, if any.
        const candidateDocs = domainDocs
          .filter((d) => d.evidenceCategory === category)
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
        const current = candidateDocs[0] ?? null;

        if (current) {
          submittedCount++;
          if (
            aiReviewedStatuses.includes(current.status) ||
            current.aiReviewStatus === 'completed'
          )
            aiReviewedCount++;
          if (analystReviewedStatuses.includes(current.status)) analystReviewedCount++;
          if (
            current.analystValidationStatus === ANALYST_VALIDATION_STATUSES.VALIDATED ||
            current.status === DOCUMENT_STATUSES.PUBLISHED_TO_END_USER
          )
            approvedCount++;
        }

        categories.push({
          domain,
          domainLabel,
          evidenceCategory: category,
          documentId: current?.id ?? null,
          status: current?.status ?? null,
          resetRequired: current?.resetRequired ?? false,
          updatedAt: current?.updatedAt ?? null,
        });
      }

      let status: 'not_started' | 'in_progress' | 'complete';
      if (submittedCount === 0) status = 'not_started';
      else if (required.length > 0 && approvedCount === required.length) status = 'complete';
      else status = 'in_progress';

      return {
        domain,
        domainLabel,
        requiredTotal: required.length,
        submittedCount,
        aiReviewedCount,
        analystReviewedCount,
        approvedCount,
        status,
      };
    });

    return { domains, categories };
  }

  async getDocumentFindings(
    documentId: string,
    requesterId: string,
    requesterRole: AppRole,
  ): Promise<IntakeDocumentFinding[]> {
    await this.getDocument(documentId, requesterId, requesterRole);

    const isAnalystOrAdmin = requesterRole === 'analyst' || requesterRole === 'admin';

    return db
      .select()
      .from(intakeDocumentFinding)
      .where(
        and(
          eq(intakeDocumentFinding.documentId, documentId),
          isAnalystOrAdmin ? undefined : isNotNull(intakeDocumentFinding.publishedAt),
        ),
      )
      .orderBy(desc(intakeDocumentFinding.createdAt));
  }

  async getDocumentSignedUrl(
    documentId: string,
    requesterId: string,
    requesterRole: AppRole,
  ): Promise<{ url: string; fileName: string; fileType: string }> {
    const doc = await this.getDocument(documentId, requesterId, requesterRole);
    const url = await this.uploadService.getPresignedGetUrl(doc.s3Key);
    return { url, fileName: doc.fileName, fileType: doc.fileType };
  }

  async submitForAiReview(documentId: string, triggeredBy: string): Promise<IntakeDocument> {
    const rows = await db
      .select()
      .from(intakeDocument)
      .where(and(eq(intakeDocument.id, documentId), isNull(intakeDocument.deletedAt)))
      .limit(1);

    const doc = rows[0];
    if (!doc) throw new NotFoundException('Document not found');

    if (doc.status !== DOCUMENT_STATUSES.CLASSIFIED) {
      throw new BadRequestException('Document must be classified before submitting for AI review');
    }

    const now = new Date();

    await db
      .update(intakeDocument)
      .set({
        status: DOCUMENT_STATUSES.AI_REVIEW_IN_PROGRESS,
        aiReviewStatus: 'in_progress',
        updatedAt: now,
      })
      .where(eq(intakeDocument.id, documentId));

    const mockAnalysis = generateMockAiAnalysis(
      documentId,
      doc.trsDomain ?? '',
      doc.evidenceCategory ?? '',
      doc.evidenceType ?? 'required',
    );

    const verdict = mockAnalysis.aiVerdict;
    const reportStatus = verdict === 'pass' ? 'published' : 'draft';

    await db.insert(aiAnalysis).values({
      id: randomUUID(),
      documentId,
      rawOutput: mockAnalysis.rawOutput,
      aiVerdict: verdict,
      reportStatus,
      createdAt: now,
      updatedAt: now,
    });

    const findingPublishedAt = verdict === 'pass' ? now : null;
    const findings = AI_FINDING_TEMPLATES.map((template) => ({
      id: randomUUID(),
      documentId,
      createdBy: triggeredBy,
      trsDomain: doc.trsDomain ?? '',
      evidenceCategory: doc.evidenceCategory ?? '',
      title: template.title,
      body: template.body(
        doc.trsDomain ?? '',
        doc.evidenceCategory ?? '',
        doc.evidenceType ?? 'required',
      ),
      sufficiencyRating: null,
      isAiGenerated: true,
      publishedAt: findingPublishedAt,
      createdAt: now,
      updatedAt: now,
    }));

    await db.insert(intakeDocumentFinding).values(findings);

    const finalDocStatus =
      verdict === 'pass' ? DOCUMENT_STATUSES.PUBLISHED_TO_END_USER : DOCUMENT_STATUSES.AI_REVIEWED;

    const updated = await db
      .update(intakeDocument)
      .set({
        status: finalDocStatus,
        aiReviewStatus: 'completed',
        sufficiencyRating:
          mockAnalysis.rawOutput.topLevelAssessment?.evidenceSufficiencySuggestion ?? null,
        analystValidationStatus: verdict === 'pass' ? 'validated' : 'in_review',
        ...(verdict === 'pass' ? { publishedAt: now } : {}),
        updatedAt: now,
      })
      .where(eq(intakeDocument.id, documentId))
      .returning();

    return requireReturnedRow(updated, 'AI review update did not return a row');
  }

  async batchTriggerAiReview(
    userId: string,
  ): Promise<{ submitted: number; skipped: number; failed: number }> {
    const { status: currentStatus } = await this.getUserAiReviewStatus(userId);
    if (currentStatus !== 'idle') {
      throw new ConflictException('AI review has already been submitted for this user');
    }

    const docs = await db
      .select()
      .from(intakeDocument)
      .where(and(eq(intakeDocument.uploadedBy, userId), isNull(intakeDocument.deletedAt)));

    let submitted = 0;
    let skipped = 0;
    let failed = 0;

    try {
      for (const doc of docs) {
        if (doc.status !== DOCUMENT_STATUSES.CLASSIFIED) {
          skipped++;
          continue;
        }

        try {
          await this.submitForAiReview(doc.id, userId);
          submitted++;
        } catch (err) {
          this.logger.error(`submitForAiReview failed for document ${doc.id}`, err);
          await db
            .update(intakeDocument)
            .set({
              aiReviewStatus: 'failed',
              status: DOCUMENT_STATUSES.AI_REVIEW_FAILED,
              updatedAt: new Date(),
            })
            .where(eq(intakeDocument.id, doc.id));
          failed++;
        }
      }

      await this.setUserAiReviewStatus(userId, 'completed');
    } catch (err) {
      this.logger.error('batchTriggerAiReview unexpected error', err);
      await this.setUserAiReviewStatus(userId, 'failed');
      throw err;
    }

    return { submitted, skipped, failed };
  }

  async getUserAiReviewStatus(
    userId: string,
  ): Promise<{ status: string; submittedAt: Date | null }> {
    const rows = await db
      .select({
        aiReviewStatus: user.aiReviewStatus,
        aiReviewSubmittedAt: user.aiReviewSubmittedAt,
      })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    const u = rows[0];
    if (!u) throw new NotFoundException('User not found');

    return { status: u.aiReviewStatus, submittedAt: u.aiReviewSubmittedAt };
  }

  async setUserAiReviewStatus(
    userId: string,
    status: 'idle' | 'completed' | 'failed',
  ): Promise<void> {
    if (status === 'completed') {
      await db
        .update(user)
        .set({ aiReviewStatus: status, aiReviewSubmittedAt: new Date() })
        .where(eq(user.id, userId));
    } else {
      await db.update(user).set({ aiReviewStatus: status }).where(eq(user.id, userId));
    }
  }

  async getAiReviewSummary(
    userId: string,
  ): Promise<{ classified: number; unclassified: number; alreadyProcessed: number }> {
    const docs = await db
      .select({ status: intakeDocument.status })
      .from(intakeDocument)
      .where(and(eq(intakeDocument.uploadedBy, userId), isNull(intakeDocument.deletedAt)));

    const alreadyProcessedStatuses = [
      DOCUMENT_STATUSES.AI_REVIEW_IN_PROGRESS,
      DOCUMENT_STATUSES.AI_REVIEWED,
      DOCUMENT_STATUSES.ANALYST_REVIEWED,
      DOCUMENT_STATUSES.PUBLISHED_TO_END_USER,
      DOCUMENT_STATUSES.AI_REVIEW_FAILED,
    ];

    let classified = 0;
    let unclassified = 0;
    let alreadyProcessed = 0;

    for (const doc of docs) {
      if (doc.status === DOCUMENT_STATUSES.CLASSIFIED) classified++;
      else if (doc.status === DOCUMENT_STATUSES.UPLOADED) unclassified++;
      else if (
        alreadyProcessedStatuses.includes(doc.status as (typeof alreadyProcessedStatuses)[number])
      )
        alreadyProcessed++;
    }

    return { classified, unclassified, alreadyProcessed };
  }

  async getAiAnalysis(
    documentId: string,
    requesterId: string,
    requesterRole: AppRole,
  ): Promise<AiAnalysis | null> {
    const docRows = await db
      .select()
      .from(intakeDocument)
      .where(eq(intakeDocument.id, documentId))
      .limit(1);

    const doc = docRows[0];
    if (!doc) throw new NotFoundException('Document not found');

    if (requesterRole === 'user') {
      if (
        doc.status !== DOCUMENT_STATUSES.PUBLISHED_TO_END_USER ||
        doc.uploadedBy !== requesterId
      ) {
        return null;
      }
    }

    const rows = await db
      .select()
      .from(aiAnalysis)
      .where(eq(aiAnalysis.documentId, documentId))
      .limit(1);

    const analysis = rows[0] ?? null;

    if (requesterRole === 'user' && analysis?.reportStatus !== 'published') {
      return null;
    }

    return analysis;
  }

  async createFinding(
    documentId: string,
    analystId: string,
    dto: CreateFindingDto,
  ): Promise<IntakeDocumentFinding> {
    const rows = await db
      .select()
      .from(intakeDocument)
      .where(and(eq(intakeDocument.id, documentId), isNull(intakeDocument.deletedAt)))
      .limit(1);

    const doc = rows[0];
    if (!doc) throw new NotFoundException('Document not found');

    const now = new Date();
    const id = randomUUID();

    const inserted = await db
      .insert(intakeDocumentFinding)
      .values({
        id,
        documentId,
        createdBy: analystId,
        trsDomain: doc.trsDomain ?? '',
        evidenceCategory: doc.evidenceCategory ?? '',
        title: dto.title,
        body: dto.body,
        sufficiencyRating: dto.sufficiencyRating ?? null,
        isAiGenerated: false,
        publishedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return requireReturnedRow(inserted, 'Finding creation did not return a row');
  }

  async updateFinding(
    documentId: string,
    findingId: string,
    dto: UpdateFindingDto,
  ): Promise<IntakeDocumentFinding> {
    const rows = await db
      .select()
      .from(intakeDocumentFinding)
      .where(
        and(
          eq(intakeDocumentFinding.id, findingId),
          eq(intakeDocumentFinding.documentId, documentId),
        ),
      )
      .limit(1);

    if (!rows[0]) throw new NotFoundException('Finding not found');

    const updatePayload: Partial<typeof intakeDocumentFinding.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (dto.title !== undefined) updatePayload.title = dto.title;
    if (dto.body !== undefined) updatePayload.body = dto.body;
    if (dto.sufficiencyRating !== undefined)
      updatePayload.sufficiencyRating = dto.sufficiencyRating;

    const updated = await db
      .update(intakeDocumentFinding)
      .set(updatePayload)
      .where(eq(intakeDocumentFinding.id, findingId))
      .returning();

    return requireReturnedRow(updated, 'Finding update did not return a row');
  }

  async deleteFinding(documentId: string, findingId: string): Promise<void> {
    const rows = await db
      .select()
      .from(intakeDocumentFinding)
      .where(
        and(
          eq(intakeDocumentFinding.id, findingId),
          eq(intakeDocumentFinding.documentId, documentId),
        ),
      )
      .limit(1);

    if (!rows[0]) throw new NotFoundException('Finding not found');

    await db.delete(intakeDocumentFinding).where(eq(intakeDocumentFinding.id, findingId));
  }

  async setSufficiency(
    documentId: string,
    analystId: string,
    dto: SetSufficiencyDto,
  ): Promise<IntakeDocument> {
    const rows = await db
      .select()
      .from(intakeDocument)
      .where(and(eq(intakeDocument.id, documentId), isNull(intakeDocument.deletedAt)))
      .limit(1);

    const doc = rows[0];
    if (!doc) throw new NotFoundException('Document not found');

    const notReviewableStatuses: readonly string[] = [
      DOCUMENT_STATUSES.UPLOADED,
      DOCUMENT_STATUSES.CLASSIFIED,
      DOCUMENT_STATUSES.AI_REVIEW_IN_PROGRESS,
    ];

    if (notReviewableStatuses.includes(doc.status)) {
      throw new BadRequestException('Document must complete AI review before setting sufficiency');
    }

    let newStatus: string;
    if (dto.analystValidationStatus === 'rejected' || dto.sufficiencyRating === 'not_relevant') {
      newStatus = DOCUMENT_STATUSES.REJECTED_NOT_RELEVANT;
    } else if (dto.sufficiencyRating === 'insufficient') {
      newStatus = DOCUMENT_STATUSES.INSUFFICIENT_EVIDENCE;
    } else {
      newStatus = DOCUMENT_STATUSES.ANALYST_REVIEWED;
    }

    const updated = await db
      .update(intakeDocument)
      .set({
        sufficiencyRating: dto.sufficiencyRating,
        analystValidationStatus: dto.analystValidationStatus,
        analystId,
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(intakeDocument.id, documentId))
      .returning();

    return requireReturnedRow(updated, 'Sufficiency update did not return a row');
  }

  async deleteDocument(documentId: string, userId: string): Promise<void> {
    const rows = await db
      .select()
      .from(intakeDocument)
      .where(and(eq(intakeDocument.id, documentId), isNull(intakeDocument.deletedAt)))
      .limit(1);

    const doc = rows[0];
    if (!doc) throw new NotFoundException('Document not found');

    if (doc.uploadedBy !== userId) {
      throw new ForbiddenException('Insufficient permissions');
    }

    await db.delete(intakeDocumentFinding).where(eq(intakeDocumentFinding.documentId, documentId));

    await db.delete(intakeDocument).where(eq(intakeDocument.id, documentId));

    await this.uploadService.deleteObject(doc.s3Key);
  }

  async publishFindings(documentId: string, analystId: string): Promise<IntakeDocument> {
    const rows = await db
      .select()
      .from(intakeDocument)
      .where(and(eq(intakeDocument.id, documentId), isNull(intakeDocument.deletedAt)))
      .limit(1);

    const doc = rows[0];
    if (!doc) throw new NotFoundException('Document not found');

    const publishableStatuses: readonly string[] = [
      DOCUMENT_STATUSES.AI_REVIEWED,
      DOCUMENT_STATUSES.ANALYST_REVIEWED,
    ];

    if (!publishableStatuses.includes(doc.status)) {
      throw new BadRequestException(
        'Document must be AI reviewed or Analyst reviewed before publishing',
      );
    }

    const now = new Date();

    await db
      .update(intakeDocumentFinding)
      .set({ publishedAt: now, updatedAt: now })
      .where(
        and(
          eq(intakeDocumentFinding.documentId, documentId),
          isNull(intakeDocumentFinding.publishedAt),
        ),
      );

    const updated = await db
      .update(intakeDocument)
      .set({
        status: DOCUMENT_STATUSES.PUBLISHED_TO_END_USER,
        publishedAt: now,
        analystId,
        updatedAt: now,
      })
      .where(eq(intakeDocument.id, documentId))
      .returning();

    return requireReturnedRow(updated, 'Publish update did not return a row');
  }

  /**
   * Saves an updated AI analysis for a document.
   *
   * `rawOutput` is always replaced wholesale — there is no partial merge of individual fields.
   * This matches the storage design: the entire AI response lives in one jsonb blob, so the
   * caller (the admin panel) sends the full updated object when the analyst edits any section.
   *
   * `aiVerdict` is updated separately because it drives server-side filtering and is kept as
   * its own column rather than buried inside `rawOutput`.
   */
  async updateAiAnalysis(
    documentId: string,
    _analystId: string,
    dto: UpdateAiAnalysisDto,
  ): Promise<AiAnalysis> {
    const rows = await db
      .select()
      .from(aiAnalysis)
      .where(eq(aiAnalysis.documentId, documentId))
      .limit(1);

    if (!rows[0]) throw new NotFoundException('AI analysis not found');

    const updatePayload: Partial<typeof aiAnalysis.$inferInsert> = { updatedAt: new Date() };

    if (dto.rawOutput !== undefined) updatePayload.rawOutput = dto.rawOutput;
    if (dto.aiVerdict !== undefined) updatePayload.aiVerdict = dto.aiVerdict;

    const updated = await db
      .update(aiAnalysis)
      .set(updatePayload)
      .where(eq(aiAnalysis.documentId, documentId))
      .returning();

    return requireReturnedRow(updated, 'AI analysis update did not return a row');
  }

  async publishAiAnalysisReport(documentId: string, analystId: string): Promise<IntakeDocument> {
    const docRows = await db
      .select({ id: intakeDocument.id })
      .from(intakeDocument)
      .where(and(eq(intakeDocument.id, documentId), isNull(intakeDocument.deletedAt)))
      .limit(1);
    if (!docRows[0]) throw new NotFoundException('Document not found');

    const analysisRows = await db
      .select()
      .from(aiAnalysis)
      .where(eq(aiAnalysis.documentId, documentId))
      .limit(1);

    if (!analysisRows[0]) throw new NotFoundException('AI analysis not found');

    const now = new Date();

    await db
      .update(aiAnalysis)
      .set({ reportStatus: 'published', updatedAt: now })
      .where(eq(aiAnalysis.documentId, documentId));

    await db
      .update(intakeDocumentFinding)
      .set({ publishedAt: now, updatedAt: now })
      .where(
        and(
          eq(intakeDocumentFinding.documentId, documentId),
          isNull(intakeDocumentFinding.publishedAt),
        ),
      );

    const updated = await db
      .update(intakeDocument)
      .set({
        status: DOCUMENT_STATUSES.PUBLISHED_TO_END_USER,
        publishedAt: now,
        analystId,
        updatedAt: now,
      })
      .where(eq(intakeDocument.id, documentId))
      .returning();

    return requireReturnedRow(updated, 'Publish update did not return a row');
  }

  /**
   * Document-Level Evidence Reset (Admin-only). Unlike `resetUserDocuments`, this only
   * ever touches the single targeted document — every other document for the customer is
   * left untouched. The original upload is preserved (soft flags only, never deleted);
   * see `resubmitDocument` for how the customer clears this state.
   */
  async resetDocument(
    documentId: string,
    adminUserId: string,
    adminName: string,
    dto: ResetDocumentDto,
  ): Promise<IntakeDocument> {
    const rows = await db
      .select()
      .from(intakeDocument)
      .where(and(eq(intakeDocument.id, documentId), isNull(intakeDocument.deletedAt)))
      .limit(1);

    const doc = rows[0];
    if (!doc) throw new NotFoundException('Document not found');

    // @IsNotEmpty() on the DTO only rejects '', null, and undefined — it does not trim,
    // so a whitespace-only reason would otherwise pass validation.
    if (dto.resetReason.trim().length === 0) {
      throw new BadRequestException('Reset reason is required');
    }

    if (doc.resetRequired) {
      throw new ConflictException(
        'This document has already been reset and is awaiting resubmission',
      );
    }

    // No document-versioning concept exists yet in this schema, so "latest version"
    // has nothing to compare against — this document is always the one being reset.

    const now = new Date();
    const updated = await db
      .update(intakeDocument)
      .set({
        status: DOCUMENT_STATUSES.RESET_REQUIRED,
        resetRequired: true,
        resetReason: dto.resetReason,
        requestedCorrection: dto.requestedCorrection ?? null,
        resetByUserId: adminUserId,
        resetByName: adminName,
        resetAt: now,
        resetDueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        updatedAt: now,
      })
      .where(eq(intakeDocument.id, documentId))
      .returning();

    return requireReturnedRow(updated, 'Document reset did not return a row');
  }

  /**
   * Resubmission after a Document-Level Evidence Reset. The client already ran the same
   * presign + S3 PUT flow as a normal upload — this only finalizes the DB side: the
   * previous (reset) document is never overwritten, a brand new `intake_document` row is
   * inserted for the new file, and the two rows are cross-linked via
   * `previousDocumentVersionId` / `resubmittedDocumentVersionId`.
   */
  async resubmitDocument(
    documentId: string,
    userId: string,
    dto: ResubmitDocumentDto,
  ): Promise<IntakeDocument> {
    const rows = await db
      .select()
      .from(intakeDocument)
      .where(and(eq(intakeDocument.id, documentId), isNull(intakeDocument.deletedAt)))
      .limit(1);

    const doc = rows[0];
    if (!doc) throw new NotFoundException('Document not found');

    if (doc.uploadedBy !== userId) {
      throw new ForbiddenException('Insufficient permissions');
    }

    if (!doc.resetRequired || doc.status !== DOCUMENT_STATUSES.RESET_REQUIRED) {
      throw new BadRequestException('Document is not awaiting resubmission');
    }

    const now = new Date();
    const newDocumentId = randomUUID();

    const updatedPrevious = await db.transaction(async (tx) => {
      await tx.insert(intakeDocument).values({
        id: newDocumentId,
        uploadedBy: userId,
        fileName: dto.fileName,
        fileType: dto.fileType,
        s3Key: dto.s3Key,
        fileSize: dto.fileSize ?? null,
        status: DOCUMENT_STATUSES.UPLOADED,
        aiReviewStatus: 'pending',
        previousDocumentVersionId: documentId,
        createdAt: now,
        updatedAt: now,
      });

      return tx
        .update(intakeDocument)
        .set({
          resetRequired: false,
          status: DOCUMENT_STATUSES.RESUBMITTED,
          resubmittedDocumentVersionId: newDocumentId,
          updatedAt: now,
        })
        .where(eq(intakeDocument.id, documentId))
        .returning();
    });

    return requireReturnedRow(updatedPrevious, 'Document resubmission did not return a row');
  }

  async resetUserDocuments(userId: string): Promise<void> {
    const now = new Date();

    await db
      .update(intakeDocument)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(intakeDocument.uploadedBy, userId), isNull(intakeDocument.deletedAt)));

    await db
      .update(user)
      .set({ aiReviewStatus: 'idle', aiReviewSubmittedAt: null })
      .where(eq(user.id, userId));
  }

  getEvidenceCategories(): Record<string, readonly string[]> {
    return REQUIRED_EVIDENCE_BY_DOMAIN;
  }

  /**
   * Manual Review — the human-authored counterpart to AI Review, used when no active AI
   * prompt is available for a document's evidence category. One-to-one with `intake_document`,
   * same as `ai_analysis`; see `manualReview` in db/schema/documents.ts.
   */
  async createManualReview(reviewerId: string, dto: CreateManualReviewDto): Promise<ManualReview> {
    const docRows = await db
      .select({ id: intakeDocument.id })
      .from(intakeDocument)
      .where(and(eq(intakeDocument.id, dto.documentId), isNull(intakeDocument.deletedAt)))
      .limit(1);
    if (!docRows[0]) throw new NotFoundException('Document not found');

    const existing = await db
      .select({ id: manualReview.id })
      .from(manualReview)
      .where(eq(manualReview.documentId, dto.documentId))
      .limit(1);
    if (existing[0]) {
      throw new ConflictException('A manual review already exists for this document');
    }

    const now = new Date();
    const rows = await db
      .insert(manualReview)
      .values({
        id: randomUUID(),
        documentId: dto.documentId,
        reviewedBy: reviewerId,
        reviewStatus: dto.reviewStatus ?? MANUAL_REVIEW_STATUSES.DRAFT,
        executiveSummary: dto.executiveSummary ?? null,
        documentQualityReview: dto.documentQualityReview ?? null,
        readinessFindings: dto.readinessFindings ?? null,
        evidenceGaps: dto.evidenceGaps ?? null,
        humanValidationQuestions: dto.humanValidationQuestions ?? null,
        suggestedNextSteps: dto.suggestedNextSteps ?? null,
        draftAnalystFinding: dto.draftAnalystFinding ?? null,
        limitations: dto.limitations ?? null,
        evidenceSufficiency: dto.evidenceSufficiency ?? null,
        reviewerConfidence: dto.reviewerConfidence ?? null,
        primaryColorIndicator: dto.primaryColorIndicator ?? null,
        recommendedAnalystAction: dto.recommendedAnalystAction ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return requireReturnedRow(rows, 'Manual review creation did not return a row');
  }

  async getManualReviewByDocumentId(documentId: string): Promise<ManualReview> {
    const rows = await db
      .select()
      .from(manualReview)
      .where(eq(manualReview.documentId, documentId))
      .limit(1);

    const review = rows[0];
    if (!review) throw new NotFoundException('Manual review not found');
    return review;
  }

  async updateManualReview(reviewId: string, dto: UpdateManualReviewDto): Promise<ManualReview> {
    const rows = await db
      .select({ id: manualReview.id })
      .from(manualReview)
      .where(eq(manualReview.id, reviewId))
      .limit(1);
    if (!rows[0]) throw new NotFoundException('Manual review not found');

    const updatePayload: Partial<typeof manualReview.$inferInsert> = { updatedAt: new Date() };

    if (dto.reviewStatus !== undefined) updatePayload.reviewStatus = dto.reviewStatus;
    if (dto.executiveSummary !== undefined) updatePayload.executiveSummary = dto.executiveSummary;
    if (dto.documentQualityReview !== undefined) {
      updatePayload.documentQualityReview = dto.documentQualityReview;
    }
    if (dto.readinessFindings !== undefined)
      updatePayload.readinessFindings = dto.readinessFindings;
    if (dto.evidenceGaps !== undefined) updatePayload.evidenceGaps = dto.evidenceGaps;
    if (dto.humanValidationQuestions !== undefined) {
      updatePayload.humanValidationQuestions = dto.humanValidationQuestions;
    }
    if (dto.suggestedNextSteps !== undefined)
      updatePayload.suggestedNextSteps = dto.suggestedNextSteps;
    if (dto.draftAnalystFinding !== undefined) {
      updatePayload.draftAnalystFinding = dto.draftAnalystFinding;
    }
    if (dto.limitations !== undefined) updatePayload.limitations = dto.limitations;
    if (dto.evidenceSufficiency !== undefined) {
      updatePayload.evidenceSufficiency = dto.evidenceSufficiency;
    }
    if (dto.reviewerConfidence !== undefined)
      updatePayload.reviewerConfidence = dto.reviewerConfidence;
    if (dto.primaryColorIndicator !== undefined) {
      updatePayload.primaryColorIndicator = dto.primaryColorIndicator;
    }
    if (dto.recommendedAnalystAction !== undefined) {
      updatePayload.recommendedAnalystAction = dto.recommendedAnalystAction;
    }

    const updated = await db
      .update(manualReview)
      .set(updatePayload)
      .where(eq(manualReview.id, reviewId))
      .returning();

    return requireReturnedRow(updated, 'Manual review update did not return a row');
  }
}
