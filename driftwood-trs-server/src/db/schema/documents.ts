import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

import { user } from './auth';

/**
 * The full AI-generated analysis output stored as a single jsonb blob.
 *
 * Design rationale: the AI prompt can change at any time without requiring a DB migration.
 * All 11 sections are optional — the UI renders whichever keys are present.
 * Only `aiVerdict` and `reportStatus` live as separate columns because they drive
 * server-side workflow logic (filtering, publish gating). Everything else is here.
 *
 * The frontend (`AiAnalysisPanel` in AnalystDocumentDrawer.tsx) reads these exact keys
 * to render the 11 display sections. Adding a new key to the prompt output is picked up
 * by the UI automatically as long as the interface and display code are updated to match.
 */
export interface AiRawOutput {
  /** Metadata about the review: TRS domain, evidence category/type, and generation timestamp. */
  reviewHeader?: {
    domain?: string;
    domainLabel?: string;
    category?: string;
    evidenceType?: string;
    generatedAt?: string;
  };
  /**
   * High-level AI verdict summary.
   * `colorIndicator` drives the badge color (Green/Yellow/Red) shown in the UI.
   * `confidenceRating` is a free-text string (e.g. "High", "Medium", "Low — insufficient data").
   */
  topLevelAssessment?: {
    evidenceSufficiencySuggestion?: string;
    colorIndicator?: 'Green' | 'Yellow' | 'Red';
    confidenceRating?: string;
    recommendedAnalystAction?: string;
  };
  executiveSummary?: string;
  documentQualityReview?: string;
  /** Bulleted list of readiness signals found in the document. */
  systemOfRecordReadinessFindings?: string[];
  systemOfRecordCoverageReview?: string;
  /** Bulleted list of missing or insufficient evidence areas. */
  evidenceGaps?: string[];
  /**
   * Only populated when the AI cannot make a full determination.
   * The UI renders these as a numbered list for the analyst to answer manually.
   */
  humanValidationQuestions?: string[];
  /** Numbered list of recommended next steps for the analyst. */
  suggestedNextSteps?: string[];
  /** AI-drafted finding text the analyst can adopt or edit before publishing. */
  draftAnalystFinding?: string;
  limitationsAndUncertainties?: string;
}

export const intakeDocument = pgTable(
  'intake_document',
  {
    id: text('id').primaryKey(),
    uploadedBy: text('uploaded_by')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    fileName: text('file_name').notNull(),
    fileType: text('file_type').notNull(),
    s3Key: text('s3_key').notNull(),
    fileSize: integer('file_size'),
    trsDomain: text('trs_domain'),
    evidenceCategory: text('evidence_category'),
    evidenceType: text('evidence_type'),
    notes: text('notes'),
    status: text('status').notNull().default('uploaded'),
    aiReviewStatus: text('ai_review_status').notNull().default('pending'),
    analystId: text('analyst_id').references(() => user.id, { onDelete: 'set null' }),
    sufficiencyRating: text('sufficiency_rating'),
    analystValidationStatus: text('analyst_validation_status'),
    publishedAt: timestamp('published_at'),
    /**
     * Document-Level Evidence Reset (Admin-only, see DocumentsService.resetDocument).
     * Resetting never deletes the original upload — `resetRequired` plus `status:
     * 'reset_required'` just flag it as awaiting a new version from the customer.
     */
    resetRequired: boolean('reset_required').notNull().default(false),
    resetReason: text('reset_reason'),
    requestedCorrection: text('requested_correction'),
    resetByUserId: text('reset_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    resetByName: text('reset_by_name'),
    resetAt: timestamp('reset_at'),
    resetDueDate: timestamp('reset_due_date'),
    /**
     * Document resubmission (see DocumentsService.resubmitDocument). Resubmitting a reset
     * document never overwrites it — a new `intake_document` row is created for the new
     * file, and the two rows are cross-linked here. Self-referencing FK, hence the
     * deferred `AnyPgColumn` callback (the table isn't done being defined yet).
     */
    previousDocumentVersionId: text('previous_document_version_id').references(
      (): AnyPgColumn => intakeDocument.id,
      { onDelete: 'set null' },
    ),
    resubmittedDocumentVersionId: text('resubmitted_document_version_id').references(
      (): AnyPgColumn => intakeDocument.id,
      { onDelete: 'set null' },
    ),
    deletedAt: timestamp('deleted_at'),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [
    index('intake_document_uploaded_by_idx').on(table.uploadedBy),
    index('intake_document_status_idx').on(table.status),
    index('intake_document_trs_domain_idx').on(table.trsDomain),
  ],
);

export const intakeDocumentFinding = pgTable(
  'intake_document_finding',
  {
    id: text('id').primaryKey(),
    documentId: text('document_id')
      .notNull()
      .references(() => intakeDocument.id, { onDelete: 'cascade' }),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    trsDomain: text('trs_domain').notNull(),
    evidenceCategory: text('evidence_category').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    sufficiencyRating: text('sufficiency_rating'),
    isAiGenerated: boolean('is_ai_generated').notNull().default(false),
    publishedAt: timestamp('published_at'),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [
    index('intake_document_finding_document_id_idx').on(table.documentId),
    index('intake_document_finding_created_by_idx').on(table.createdBy),
  ],
);

/**
 * One-to-one with `intake_document`. Created when the AI review job runs.
 *
 * Storage design: the entire AI response is stored in `raw_output` (jsonb) so the
 * DB schema never needs to change when the AI prompt is updated. The shape is typed
 * via `AiRawOutput` at the application layer but not enforced at the DB level.
 *
 * The two columns kept separate (`ai_verdict`, `report_status`) are the only fields
 * that the server queries/filters on directly — everything else lives in `raw_output`.
 */
export const aiAnalysis = pgTable(
  'ai_analysis',
  {
    id: text('id').primaryKey(),
    documentId: text('document_id')
      .notNull()
      .references(() => intakeDocument.id, { onDelete: 'cascade' }),
    /** Full AI response blob. Shape defined by `AiRawOutput`. Never partially updated — always replaced wholesale. */
    rawOutput: jsonb('raw_output').notNull().$type<AiRawOutput>(),
    /** Analyst-confirmed verdict. Separate column so the server can filter by verdict without parsing jsonb. */
    aiVerdict: text('ai_verdict'),
    /** 'draft' until an analyst publishes the report; drives visibility to the document owner. */
    reportStatus: text('report_status').notNull().default('draft'),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [
    unique('ai_analysis_document_id_uniq').on(table.documentId),
    index('ai_analysis_document_id_idx').on(table.documentId),
  ],
);

/**
 * Manual Review — the human-authored counterpart to `ai_analysis`, used when no active
 * AI prompt is available for a document's evidence category (see AiReviewAvailabilityNotice
 * on the frontend). One-to-one with `intake_document`, same shape rationale as `ai_analysis`
 * except every field is a plain typed column (no jsonb blob) since there is no AI prompt
 * output to keep schema-flexible for — the field set here is fixed by the ticket, not by
 * a prompt.
 */
export const manualReview = pgTable(
  'manual_review',
  {
    id: text('id').primaryKey(),
    documentId: text('document_id')
      .notNull()
      .references(() => intakeDocument.id, { onDelete: 'cascade' }),
    reviewedBy: text('reviewed_by').references(() => user.id, { onDelete: 'set null' }),
    /** Always 'manual' today — kept as its own column (rather than inferred) so a future
     *  non-manual review source can share this table without a schema change. */
    reviewSource: text('review_source').notNull().default('manual'),
    /** 'draft' until the analyst marks the review complete. */
    reviewStatus: text('review_status').notNull().default('draft'),
    executiveSummary: text('executive_summary'),
    documentQualityReview: text('document_quality_review'),
    readinessFindings: text('readiness_findings'),
    evidenceGaps: text('evidence_gaps'),
    humanValidationQuestions: text('human_validation_questions'),
    suggestedNextSteps: text('suggested_next_steps'),
    draftAnalystFinding: text('draft_analyst_finding'),
    limitations: text('limitations'),
    evidenceSufficiency: text('evidence_sufficiency'),
    reviewerConfidence: text('reviewer_confidence'),
    primaryColorIndicator: text('primary_color_indicator'),
    recommendedAnalystAction: text('recommended_analyst_action'),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [
    unique('manual_review_document_id_uniq').on(table.documentId),
    index('manual_review_document_id_idx').on(table.documentId),
  ],
);
