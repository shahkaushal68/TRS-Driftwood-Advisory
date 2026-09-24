import { Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, max } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { db } from '../db';
import {
  aiReviewRequest,
  aiReviewResponse,
  executiveReport,
  intakeDocument,
  manualReview,
  user,
} from '../db/schema';
import type { AiReviewRequestRow, AiReviewResponseRow } from '../ai-review/ai-review.repository';
import type { IntakeDocument, ManualReview } from '../documents/documents.service';
import { EXECUTIVE_REPORT_STATUSES } from './constants/executive-report-status';

/** The fields the End User published-report endpoint is allowed to see — see
 *  `ExecutiveReportService.getPublishedReportForEndUser`. Deliberately excludes every
 *  internal column (prompt ids, source review ids, provider/model, generation error, etc.)
 *  at the query level, not just by dropping them later in the service. */
export interface PublishedExecutiveReportForEndUser {
  id: string;
  customerId: string;
  reportStatus: string;
  reportVersion: number;
  publishedAt: Date | null;
  publishedByName: string | null;
  generatedReportMarkdown: string | null;
}

export type ExecutiveReportRow = typeof executiveReport.$inferSelect;
export type ExecutiveReportInsert = typeof executiveReport.$inferInsert;

/** Any Drizzle executor: the base `db` client or a transaction handle from `db.transaction()`. */
type Executor = NodePgDatabase | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Data access for the Executive Report feature. Owns `executive_report` persistence
 * (mirroring `AiReviewRepository`'s shape for its own tables) plus the read-only lookups
 * `ExecutiveReportService` needs across `intake_document`/`manual_review`/
 * `ai_review_request`/`ai_review_response` — tables this feature doesn't own but whose
 * owning services (`DocumentsService`, `AiReviewService`) don't expose reads shaped for
 * "evaluate every required category for a customer", so those reads live here rather than
 * being duplicated ad hoc in the service.
 */
@Injectable()
export class ExecutiveReportRepository {
  async insert(
    values: ExecutiveReportInsert,
    executor: Executor = db,
  ): Promise<ExecutiveReportRow> {
    const rows = await executor.insert(executiveReport).values(values).returning();
    const row = rows[0];
    if (!row) throw new Error('Executive report insert did not return a row');
    return row;
  }

  async findById(id: string, executor: Executor = db): Promise<ExecutiveReportRow | null> {
    const rows = await executor.select().from(executiveReport).where(eq(executiveReport.id, id)).limit(1);
    return rows[0] ?? null;
  }

  /**
   * Same lookup as `findById`, but takes a row lock (`SELECT ... FOR UPDATE`) — used inside
   * `ExecutiveReportService.approveReport`'s transaction so a second, concurrent approval
   * attempt blocks on this row until the first transaction commits, then re-reads the
   * now-`approved` status rather than racing it. Only meaningful when `executor` is a
   * transaction handle (`db.transaction()`); calling it against the base `db` client still
   * works but the lock is released immediately since there is no enclosing transaction.
   */
  async findByIdForUpdate(id: string, executor: Executor = db): Promise<ExecutiveReportRow | null> {
    const rows = await executor
      .select()
      .from(executiveReport)
      .where(eq(executiveReport.id, id))
      .for('update')
      .limit(1);
    return rows[0] ?? null;
  }

  async update(
    id: string,
    values: Partial<ExecutiveReportInsert>,
    executor: Executor = db,
  ): Promise<ExecutiveReportRow> {
    const rows = await executor
      .update(executiveReport)
      .set(values)
      .where(eq(executiveReport.id, id))
      .returning();

    const row = rows[0];
    if (!row) throw new Error('Executive report update did not return a row');
    return row;
  }

  /**
   * The current published Executive Report for a customer — i.e. the highest-versioned row
   * whose `reportStatus` is `published`, NOT simply the highest-versioned row overall. This
   * is what keeps a newer, still-draft/approved version invisible to the End User: a v2
   * sitting in `draft`/`approved` never matches this query, so a previously published v1
   * keeps being returned until v2 itself is published (see ticket §10/§11).
   *
   * Only the columns the End User is allowed to see are selected — internal fields (prompt
   * ids, source review ids, provider/model, generation error, etc.) never leave the
   * database for this query, rather than being fetched and then stripped in the service.
   * `publishedByName` is resolved via a join so the End User sees a human name instead of
   * an internal user id (see `ExecutiveReportService.getPublishedReportForEndUser`).
   */
  async findLatestPublishedByCustomerId(
    customerId: string,
    executor: Executor = db,
  ): Promise<PublishedExecutiveReportForEndUser | null> {
    const rows = await executor
      .select({
        id: executiveReport.id,
        customerId: executiveReport.customerId,
        reportStatus: executiveReport.reportStatus,
        reportVersion: executiveReport.reportVersion,
        publishedAt: executiveReport.publishedAt,
        publishedByName: user.name,
        generatedReportMarkdown: executiveReport.generatedReportMarkdown,
      })
      .from(executiveReport)
      .leftJoin(user, eq(executiveReport.publishedByUserId, user.id))
      .where(
        and(
          eq(executiveReport.customerId, customerId),
          eq(executiveReport.reportStatus, EXECUTIVE_REPORT_STATUSES.PUBLISHED),
        ),
      )
      .orderBy(desc(executiveReport.reportVersion))
      .limit(1);

    return rows[0] ?? null;
  }

  /** The latest version of a customer's Executive Report, or `null` if one has never been
   *  generated. */
  async findLatestByCustomerId(
    customerId: string,
    executor: Executor = db,
  ): Promise<ExecutiveReportRow | null> {
    const rows = await executor
      .select()
      .from(executiveReport)
      .where(eq(executiveReport.customerId, customerId))
      .orderBy(desc(executiveReport.reportVersion))
      .limit(1);

    return rows[0] ?? null;
  }

  /** The next `reportVersion` to use for a new generation request — versioning never
   *  overwrites a prior report (see the `executiveReport` schema doc comment). */
  async findNextVersionNumber(customerId: string, executor: Executor = db): Promise<number> {
    const [result] = await executor
      .select({ maxVersion: max(executiveReport.reportVersion) })
      .from(executiveReport)
      .where(eq(executiveReport.customerId, customerId));

    return (result?.maxVersion ?? 0) + 1;
  }

  /** `null` if no (undeleted) customer with this id exists. */
  async findCustomerById(
    customerId: string,
    executor: Executor = db,
  ): Promise<{ id: string } | null> {
    const rows = await executor
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.id, customerId), isNull(user.deletedAt)))
      .limit(1);

    return rows[0] ?? null;
  }

  /** The customer's display name, for the PDF header/filename — `null` if no (undeleted)
   *  customer with this id exists. */
  async findCustomerNameById(customerId: string, executor: Executor = db): Promise<string | null> {
    const rows = await executor
      .select({ name: user.name })
      .from(user)
      .where(and(eq(user.id, customerId), isNull(user.deletedAt)))
      .limit(1);

    return rows[0]?.name ?? null;
  }

  /** Every non-deleted document submission a customer has uploaded. */
  async findDocumentsForCustomer(
    customerId: string,
    executor: Executor = db,
  ): Promise<IntakeDocument[]> {
    return executor
      .select()
      .from(intakeDocument)
      .where(and(eq(intakeDocument.uploadedBy, customerId), isNull(intakeDocument.deletedAt)));
  }

  async findManualReviewByDocumentId(
    documentId: string,
    executor: Executor = db,
  ): Promise<ManualReview | null> {
    const rows = await executor
      .select()
      .from(manualReview)
      .where(eq(manualReview.documentId, documentId))
      .limit(1);

    return rows[0] ?? null;
  }

  async findManualReviewById(
    reviewId: string,
    executor: Executor = db,
  ): Promise<ManualReview | null> {
    const rows = await executor
      .select()
      .from(manualReview)
      .where(eq(manualReview.id, reviewId))
      .limit(1);

    return rows[0] ?? null;
  }

  /** The most recently created AI Review response for a document — "latest" is what counts
   *  toward eligibility (see `ExecutiveReportService`). */
  async findLatestAiReviewResponseByDocumentId(
    documentId: string,
    executor: Executor = db,
  ): Promise<AiReviewResponseRow | null> {
    const rows = await executor
      .select()
      .from(aiReviewResponse)
      .where(eq(aiReviewResponse.documentId, documentId))
      .orderBy(desc(aiReviewResponse.createdAt))
      .limit(1);

    return rows[0] ?? null;
  }

  async findAiReviewResponseById(
    reviewId: string,
    executor: Executor = db,
  ): Promise<AiReviewResponseRow | null> {
    const rows = await executor
      .select()
      .from(aiReviewResponse)
      .where(eq(aiReviewResponse.id, reviewId))
      .limit(1);

    return rows[0] ?? null;
  }

  /** The most recently initiated AI Review request for a document — used to detect an
   *  in-flight (`processing`/`needs_retry`) attempt when no response has been persisted yet. */
  async findLatestAiReviewRequestByDocumentId(
    documentId: string,
    executor: Executor = db,
  ): Promise<AiReviewRequestRow | null> {
    const rows = await executor
      .select()
      .from(aiReviewRequest)
      .where(eq(aiReviewRequest.documentId, documentId))
      .orderBy(desc(aiReviewRequest.initiatedAt))
      .limit(1);

    return rows[0] ?? null;
  }
}
