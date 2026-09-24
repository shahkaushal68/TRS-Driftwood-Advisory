import { Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, max, ne, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { db } from '../db';
import { promptTemplate, promptVersion } from '../db/schema';

export type PromptTemplateRow = typeof promptTemplate.$inferSelect;
export type PromptTemplateInsert = typeof promptTemplate.$inferInsert;
export type PromptVersionRow = typeof promptVersion.$inferSelect;
export type PromptVersionInsert = typeof promptVersion.$inferInsert;

/** Any Drizzle executor: the base `db` client or a transaction handle from `db.transaction()`. */
type Executor = NodePgDatabase | Parameters<Parameters<typeof db.transaction>[0]>[0];

@Injectable()
export class AiPromptsRepository {
  async insertTemplate(
    values: PromptTemplateInsert,
    executor: Executor = db,
  ): Promise<PromptTemplateRow> {
    const rows = await executor.insert(promptTemplate).values(values).returning();
    const row = rows[0];
    if (!row) throw new Error('Prompt template insert did not return a row');
    return row;
  }

  async findTemplateById(id: string, executor: Executor = db): Promise<PromptTemplateRow | null> {
    const rows = await executor
      .select()
      .from(promptTemplate)
      .where(and(eq(promptTemplate.id, id), isNull(promptTemplate.deletedAt)))
      .limit(1);

    return rows[0] ?? null;
  }

  async findTemplateByDomainCategory(
    trsDomainId: string,
    evidenceCategoryId: string,
    executor: Executor = db,
  ): Promise<PromptTemplateRow | null> {
    const rows = await executor
      .select()
      .from(promptTemplate)
      .where(
        and(
          eq(promptTemplate.trsDomainId, trsDomainId),
          eq(promptTemplate.evidenceCategoryId, evidenceCategoryId),
          isNull(promptTemplate.deletedAt),
        ),
      )
      .limit(1);

    return rows[0] ?? null;
  }

  /** Most recently created (non-deleted) template of a given `promptType`, regardless of
   *  status — used by `AiPromptsService.createTemplate` to enforce "only one Master Report
   *  template" the same way `findTemplateByDomainCategory` enforces domain/category
   *  uniqueness for category-scoped templates. */
  async findTemplateByPromptType(
    promptType: string,
    executor: Executor = db,
  ): Promise<PromptTemplateRow | null> {
    const rows = await executor
      .select()
      .from(promptTemplate)
      .where(and(eq(promptTemplate.promptType, promptType), isNull(promptTemplate.deletedAt)))
      .orderBy(desc(promptTemplate.createdAt))
      .limit(1);

    return rows[0] ?? null;
  }

  /** The active template of a given `promptType` — used by
   *  `AiPromptsService.getActiveMasterReportPrompt` to look up the Master Report prompt
   *  without a domain/category pair, mirroring `findTemplateByDomainCategory` for
   *  category-scoped active-prompt lookups. */
  async findActiveTemplateByPromptType(
    promptType: string,
    executor: Executor = db,
  ): Promise<PromptTemplateRow | null> {
    const rows = await executor
      .select()
      .from(promptTemplate)
      .where(
        and(
          eq(promptTemplate.promptType, promptType),
          eq(promptTemplate.status, 'active'),
          isNull(promptTemplate.deletedAt),
        ),
      )
      .orderBy(desc(promptTemplate.updatedAt))
      .limit(1);

    return rows[0] ?? null;
  }

  async listTemplates(
    filter: { trsDomainId?: string | undefined; evidenceCategoryId?: string | undefined },
    executor: Executor = db,
  ): Promise<PromptTemplateRow[]> {
    return executor
      .select()
      .from(promptTemplate)
      .where(
        and(
          isNull(promptTemplate.deletedAt),
          filter.trsDomainId ? eq(promptTemplate.trsDomainId, filter.trsDomainId) : undefined,
          filter.evidenceCategoryId
            ? eq(promptTemplate.evidenceCategoryId, filter.evidenceCategoryId)
            : undefined,
        ),
      )
      .orderBy(promptTemplate.trsDomainId, promptTemplate.evidenceCategoryId);
  }

  async updateTemplate(
    id: string,
    values: Partial<PromptTemplateInsert>,
    executor: Executor = db,
  ): Promise<PromptTemplateRow> {
    const rows = await executor
      .update(promptTemplate)
      .set(values)
      .where(eq(promptTemplate.id, id))
      .returning();

    const row = rows[0];
    if (!row) throw new Error('Prompt template update did not return a row');
    return row;
  }

  async insertVersion(
    values: PromptVersionInsert,
    executor: Executor = db,
  ): Promise<PromptVersionRow> {
    const rows = await executor.insert(promptVersion).values(values).returning();
    const row = rows[0];
    if (!row) throw new Error('Prompt version insert did not return a row');
    return row;
  }

  async findVersionById(id: string, executor: Executor = db): Promise<PromptVersionRow | null> {
    const rows = await executor
      .select()
      .from(promptVersion)
      .where(and(eq(promptVersion.id, id), isNull(promptVersion.deletedAt)))
      .limit(1);

    return rows[0] ?? null;
  }

  async findVersionsByTemplateId(
    promptTemplateId: string,
    executor: Executor = db,
  ): Promise<PromptVersionRow[]> {
    return executor
      .select()
      .from(promptVersion)
      .where(
        and(eq(promptVersion.promptTemplateId, promptTemplateId), isNull(promptVersion.deletedAt)),
      )
      .orderBy(desc(promptVersion.versionNumber));
  }

  async findMaxVersionNumber(promptTemplateId: string, executor: Executor = db): Promise<number> {
    const [result] = await executor
      .select({ maxVersion: max(promptVersion.versionNumber) })
      .from(promptVersion)
      .where(eq(promptVersion.promptTemplateId, promptTemplateId));

    return result?.maxVersion ?? 0;
  }

  async updateVersion(
    id: string,
    values: Partial<PromptVersionInsert>,
    executor: Executor = db,
  ): Promise<PromptVersionRow> {
    const rows = await executor
      .update(promptVersion)
      .set(values)
      .where(eq(promptVersion.id, id))
      .returning();

    const row = rows[0];
    if (!row) throw new Error('Prompt version update did not return a row');
    return row;
  }

  /**
   * Deactivates every other version of the template. Any version whose status was
   * `active` reverts to `draft` (it's no longer active but wasn't manually archived);
   * `archived`/`deleted` versions are left untouched.
   */
  async deactivateOtherVersions(
    promptTemplateId: string,
    excludeVersionId: string | null,
    executor: Executor = db,
  ): Promise<void> {
    await executor
      .update(promptVersion)
      .set({
        isActive: false,
        status: sql`case when ${promptVersion.status} = 'active' then 'draft' else ${promptVersion.status} end`,
      })
      .where(
        and(
          eq(promptVersion.promptTemplateId, promptTemplateId),
          excludeVersionId ? ne(promptVersion.id, excludeVersionId) : undefined,
        ),
      );
  }
}
