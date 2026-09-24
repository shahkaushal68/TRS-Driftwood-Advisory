import { index, jsonb, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';

import type { AiRawOutput } from './documents';
import { intakeDocument } from './documents';
import { promptTemplate, promptVersion } from './ai-prompts';
import { user } from './auth';

/**
 * The raw payload returned by the AI provider's chat-completion call (e.g. OpenRouter),
 * stored verbatim for audit/debugging. Shape is provider-defined and not enforced here —
 * the structured data the app actually reads lives in `aiReviewResponse.parsedFindings`
 * (typed as `AiRawOutput`, the same shape `ai_analysis.raw_output` already uses).
 */
export type AiProviderRawResponse = Record<string, unknown>;

/**
 * One row per AI Review attempt for a document submission. Created when a review is
 * triggered, updated as the provider call progresses. `trsDomain`/`evidenceCategory` and
 * `provider`/`model` are denormalized snapshots at the time of the request (same
 * denormalization pattern as `intake_document_finding.trsDomain`/`evidenceCategory`) so a
 * request's history stays accurate even if the document is later reclassified or the
 * active provider config/model changes.
 *
 * `promptTemplateId`/`promptVersionId` intentionally have no `onDelete` action (defaults
 * to Postgres `NO ACTION`) — neither prompt templates nor versions are ever hard-deleted
 * in this app (only archived via `status`), so a request row should never lose this
 * lineage. Same reasoning for `initiatedByUserId`.
 */
export const aiReviewRequest = pgTable(
  'ai_review_request',
  {
    id: text('id').primaryKey(),
    customerId: text('customer_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    documentId: text('document_id')
      .notNull()
      .references(() => intakeDocument.id, { onDelete: 'cascade' }),
    trsDomain: text('trs_domain').notNull(),
    evidenceCategory: text('evidence_category').notNull(),
    promptTemplateId: text('prompt_template_id')
      .notNull()
      .references(() => promptTemplate.id),
    promptVersionId: text('prompt_version_id')
      .notNull()
      .references(() => promptVersion.id),
    /** Snapshot of the provider/model actually used (e.g. 'openrouter', 'openai/gpt-4o') —
     *  not a FK to `ai_provider_configuration`, since the active config can change after
     *  the fact and this row should keep recording what was true at request time. */
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    initiatedByUserId: text('initiated_by_user_id')
      .notNull()
      .references(() => user.id),
    initiatedAt: timestamp('initiated_at').notNull(),
    status: text('status').notNull().default('processing'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [
    index('ai_review_request_document_id_idx').on(table.documentId),
    index('ai_review_request_customer_id_idx').on(table.customerId),
    index('ai_review_request_status_idx').on(table.status),
  ],
);

/**
 * One-to-one with `ai_review_request` — the persisted result of a completed request. Only
 * inserted once the provider call succeeds and a response has been parsed; failed/retrying
 * attempts are tracked entirely via `ai_review_request.status`/`errorMessage`, with no
 * response row.
 *
 * `documentId` is a denormalized copy of `aiReviewRequest.documentId` (same rationale as
 * `intake_document_finding` denormalizing domain/category from its parent document) so
 * document-scoped queries (e.g. "the current AI response for this document") don't need to
 * join through `ai_review_request`.
 *
 * Storage design mirrors `ai_analysis`: the full provider payload and full structured
 * findings are kept as jsonb/text blobs so this schema doesn't need to change when the
 * prompt or provider response shape changes. `evidenceSufficiency`, `aiConfidence`,
 * `primaryColorIndicator`, and `recommendedAnalystAction` are pulled out as their own
 * columns — same fields, same names, and same "nullable until the AI can classify them"
 * convention as `manual_review`'s equivalent columns — so the server can filter/query on
 * them without parsing jsonb.
 */
export const aiReviewResponse = pgTable(
  'ai_review_response',
  {
    id: text('id').primaryKey(),
    requestId: text('request_id')
      .notNull()
      .references(() => aiReviewRequest.id, { onDelete: 'cascade' }),
    documentId: text('document_id')
      .notNull()
      .references(() => intakeDocument.id, { onDelete: 'cascade' }),
    /** Full raw provider response, stored verbatim for audit/debugging. */
    rawResponse: jsonb('raw_response').notNull().$type<AiProviderRawResponse>(),
    /** Analyst-facing markdown rendering of the response, if generated. */
    structuredMarkdownResponse: text('structured_markdown_response'),
    /** Structured sections parsed out of the response — same shape as `ai_analysis.raw_output`. */
    parsedFindings: jsonb('parsed_findings').$type<AiRawOutput>(),
    evidenceSufficiency: text('evidence_sufficiency'),
    aiConfidence: text('ai_confidence'),
    primaryColorIndicator: text('primary_color_indicator'),
    recommendedAnalystAction: text('recommended_analyst_action'),
    /** Workflow status for analyst handling of this response — see ANALYST_REVIEW_STATUSES.
     *  Always starts at 'ai_generated' for a successfully persisted response. */
    analystReviewStatus: text('analyst_review_status').notNull().default('ai_generated'),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [
    unique('ai_review_response_request_id_uniq').on(table.requestId),
    index('ai_review_response_document_id_idx').on(table.documentId),
    index('ai_review_response_analyst_review_status_idx').on(table.analystReviewStatus),
  ],
);
