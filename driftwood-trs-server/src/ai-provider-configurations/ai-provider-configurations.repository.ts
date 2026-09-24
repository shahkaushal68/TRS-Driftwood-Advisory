import { Injectable } from '@nestjs/common';
import { desc, eq, ne } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { db } from '../db';
import { aiProviderConfiguration } from '../db/schema';

export type AiProviderConfigurationRow = typeof aiProviderConfiguration.$inferSelect;
type AiProviderConfigurationInsert = typeof aiProviderConfiguration.$inferInsert;

/** Any Drizzle executor: the base `db` client or a transaction handle from `db.transaction()`. */
type Executor = NodePgDatabase | Parameters<Parameters<typeof db.transaction>[0]>[0];

@Injectable()
export class AiProviderConfigurationsRepository {
  async findAll(executor: Executor = db): Promise<AiProviderConfigurationRow[]> {
    return executor
      .select()
      .from(aiProviderConfiguration)
      .orderBy(desc(aiProviderConfiguration.isActive), desc(aiProviderConfiguration.createdAt));
  }

  async findById(id: string, executor: Executor = db): Promise<AiProviderConfigurationRow | null> {
    const rows = await executor
      .select()
      .from(aiProviderConfiguration)
      .where(eq(aiProviderConfiguration.id, id))
      .limit(1);

    return rows[0] ?? null;
  }

  /** The single currently-active configuration, if any. Enforcing "at most one active" is
   *  the service's job (`deactivateAllExcept`); this just reads whatever that invariant left. */
  async findActive(executor: Executor = db): Promise<AiProviderConfigurationRow | null> {
    const rows = await executor
      .select()
      .from(aiProviderConfiguration)
      .where(eq(aiProviderConfiguration.isActive, true))
      .limit(1);

    return rows[0] ?? null;
  }

  async insert(
    values: AiProviderConfigurationInsert,
    executor: Executor = db,
  ): Promise<AiProviderConfigurationRow> {
    const rows = await executor.insert(aiProviderConfiguration).values(values).returning();
    const row = rows[0];
    if (!row) throw new Error('AI provider configuration insert did not return a row');
    return row;
  }

  async update(
    id: string,
    values: Partial<AiProviderConfigurationInsert>,
    executor: Executor = db,
  ): Promise<AiProviderConfigurationRow> {
    const rows = await executor
      .update(aiProviderConfiguration)
      .set(values)
      .where(eq(aiProviderConfiguration.id, id))
      .returning();

    const row = rows[0];
    if (!row) throw new Error('AI provider configuration update did not return a row');
    return row;
  }

  /** Sets `isActive = false` on every row except `excludeId`. */
  async deactivateAllExcept(excludeId: string | null, executor: Executor = db): Promise<void> {
    await executor
      .update(aiProviderConfiguration)
      .set({ isActive: false, updatedAt: new Date() })
      .where(excludeId ? ne(aiProviderConfiguration.id, excludeId) : undefined);
  }
}
