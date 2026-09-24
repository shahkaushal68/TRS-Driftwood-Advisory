import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

import { user } from './auth';

/**
 * A Prompt Template is the stable identity for "the AI prompt used for TRS domain X /
 * evidence category Y" — or, for `promptType: 'master_transformation_readiness_report'`
 * (see `PROMPT_TYPES` in `src/ai-prompts/constants/prompt-type.ts`), the single
 * customer-level Master Transformation Readiness Report prompt, which is not scoped to any
 * one domain/category. Its actual instructions live in `promptVersion` rows — the template
 * only tracks metadata and which version is currently active.
 *
 * `trsDomainId`/`evidenceCategoryId` are nullable for exactly that reason: every
 * category-scoped template still sets both (enforced in `AiPromptsService.createTemplate`,
 * not at the DB level), while the Master Report template leaves both null. The existing
 * `prompt_template_domain_category_uniq` constraint still prevents two category-scoped
 * templates from colliding — Postgres treats each `(NULL, NULL)` pair as distinct, so it
 * does not (and is not needed to) constrain the Master Report template; that template's
 * own one-per-`promptType` invariant is enforced in the service instead, the same way
 * `AiProviderConfigurationsService` enforces "only one active configuration" in code rather
 * than via a DB constraint.
 *
 * `activeVersionId` and `promptVersion.promptTemplateId` are mutually referencing; the
 * FK below uses a deferred callback (`AnyPgColumn`) so Drizzle can resolve the circular
 * reference between the two tables declared in this file.
 */
export const promptTemplate = pgTable(
  'prompt_template',
  {
    id: text('id').primaryKey(),
    promptName: text('prompt_name').notNull(),
    promptDescription: text('prompt_description'),
    trsDomainId: text('trs_domain_id'),
    evidenceCategoryId: text('evidence_category_id'),
    promptType: text('prompt_type').notNull(),
    status: text('status').notNull().default('draft'),
    activeVersionId: text('active_version_id').references((): AnyPgColumn => promptVersion.id, {
      onDelete: 'set null',
    }),
    createdByUserId: text('created_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    updatedByUserId: text('updated_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [
    unique('prompt_template_domain_category_uniq').on(
      table.trsDomainId,
      table.evidenceCategoryId,
    ),
    index('prompt_template_domain_category_idx').on(table.trsDomainId, table.evidenceCategoryId),
    index('prompt_template_status_idx').on(table.status),
  ],
);

/**
 * A Prompt Version is an immutable snapshot of prompt content. New edits always create a
 * new row — existing versions are never overwritten, only ever superseded by activating
 * another version (see `AiPromptsService.activateVersion`).
 */
export const promptVersion = pgTable(
  'prompt_version',
  {
    id: text('id').primaryKey(),
    promptTemplateId: text('prompt_template_id')
      .notNull()
      .references(() => promptTemplate.id, { onDelete: 'cascade' }),
    versionNumber: integer('version_number').notNull(),
    versionLabel: text('version_label').notNull(),
    promptContent: text('prompt_content').notNull(),
    outputFormat: text('output_format').notNull().default('markdown'),
    status: text('status').notNull().default('draft'),
    isActive: boolean('is_active').notNull().default(false),
    changeSummary: text('change_summary'),
    createdByUserId: text('created_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    activatedByUserId: text('activated_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    activatedAt: timestamp('activated_at'),
    archivedByUserId: text('archived_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    archivedAt: timestamp('archived_at'),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [
    unique('prompt_version_template_version_number_uniq').on(
      table.promptTemplateId,
      table.versionNumber,
    ),
    index('prompt_version_template_id_idx').on(table.promptTemplateId),
    index('prompt_version_is_active_idx').on(table.isActive),
  ],
);
