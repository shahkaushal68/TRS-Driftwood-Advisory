import { Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { db } from '../db';
import { aiReviewRequest, aiReviewResponse } from '../db/schema';

export type AiReviewRequestRow = typeof aiReviewRequest.$inferSelect;
export type AiReviewRequestInsert = typeof aiReviewRequest.$inferInsert;
export type AiReviewResponseRow = typeof aiReviewResponse.$inferSelect;
export type AiReviewResponseInsert = typeof aiReviewResponse.$inferInsert;

/** Any Drizzle executor: the base `db` client or a transaction handle from `db.transaction()`. */
type Executor = NodePgDatabase | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Pure data access for `ai_review_request`/`ai_review_response` — no OpenRouter calls, no
 * eligibility checks, no orchestration. Mirrors `AiPromptsRepository`'s shape so the
 * (separate, later) execution flow can compose this with `AiPromptsRepository` and
 * `DocumentsService` the same way `DocumentsService.getAiReviewEligibility` already does.
 */
@Injectable()
export class AiReviewRepository {
  async insertRequest(
    values: AiReviewRequestInsert,
    executor: Executor = db,
  ): Promise<AiReviewRequestRow> {
    const rows = await executor.insert(aiReviewRequest).values(values).returning();
    const row = rows[0];
    if (!row) throw new Error('AI review request insert did not return a row');
    return row;
  }

  async findRequestById(id: string, executor: Executor = db): Promise<AiReviewRequestRow | null> {
    const rows = await executor
      .select()
      .from(aiReviewRequest)
      .where(eq(aiReviewRequest.id, id))
      .limit(1);

    return rows[0] ?? null;
  }

  async findRequestsByDocumentId(
    documentId: string,
    executor: Executor = db,
  ): Promise<AiReviewRequestRow[]> {
    return executor
      .select()
      .from(aiReviewRequest)
      .where(eq(aiReviewRequest.documentId, documentId))
      .orderBy(desc(aiReviewRequest.initiatedAt));
  }

  async updateRequest(
    id: string,
    values: Partial<AiReviewRequestInsert>,
    executor: Executor = db,
  ): Promise<AiReviewRequestRow> {
    const rows = await executor
      .update(aiReviewRequest)
      .set(values)
      .where(eq(aiReviewRequest.id, id))
      .returning();

    const row = rows[0];
    if (!row) throw new Error('AI review request update did not return a row');
    return row;
  }

  async insertResponse(
    values: AiReviewResponseInsert,
    executor: Executor = db,
  ): Promise<AiReviewResponseRow> {
    const rows = await executor.insert(aiReviewResponse).values(values).returning();
    const row = rows[0];
    if (!row) throw new Error('AI review response insert did not return a row');
    return row;
  }

  async findResponseById(id: string, executor: Executor = db): Promise<AiReviewResponseRow | null> {
    const rows = await executor
      .select()
      .from(aiReviewResponse)
      .where(eq(aiReviewResponse.id, id))
      .limit(1);

    return rows[0] ?? null;
  }

  async findResponseByRequestId(
    requestId: string,
    executor: Executor = db,
  ): Promise<AiReviewResponseRow | null> {
    const rows = await executor
      .select()
      .from(aiReviewResponse)
      .where(eq(aiReviewResponse.requestId, requestId))
      .limit(1);

    return rows[0] ?? null;
  }

  async findResponsesByDocumentId(
    documentId: string,
    executor: Executor = db,
  ): Promise<AiReviewResponseRow[]> {
    return executor
      .select()
      .from(aiReviewResponse)
      .where(eq(aiReviewResponse.documentId, documentId))
      .orderBy(desc(aiReviewResponse.createdAt));
  }

  async updateResponse(
    id: string,
    values: Partial<AiReviewResponseInsert>,
    executor: Executor = db,
  ): Promise<AiReviewResponseRow> {
    const rows = await executor
      .update(aiReviewResponse)
      .set(values)
      .where(eq(aiReviewResponse.id, id))
      .returning();

    const row = rows[0];
    if (!row) throw new Error('AI review response update did not return a row');
    return row;
  }
}
