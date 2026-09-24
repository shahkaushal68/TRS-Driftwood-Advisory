import { boolean, index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import { user } from './auth';

/**
 * Stores AI provider gateway connection settings (POC scope: OpenRouter only).
 * `apiKey` holds the AES-256-GCM ciphertext, never the plaintext key — see `src/libs/encryption.ts`.
 * Only one row may have `isActive = true` at a time; this is enforced in
 * `AiProviderConfigurationsService`, not via a DB constraint, since Postgres has no
 * native "at most one true" check without a partial unique index migration.
 */
export const aiProviderConfiguration = pgTable(
  'ai_provider_configuration',
  {
    id: text('id').primaryKey(),
    providerName: text('provider_name').notNull(),
    providerType: text('provider_type').notNull(),
    gatewayType: text('gateway_type'),
    baseUrl: text('base_url').notNull(),
    apiKey: text('api_key').notNull(),
    apiKeyLastFour: text('api_key_last_four').notNull(),
    defaultModel: text('default_model').notNull(),
    fallbackModel: text('fallback_model'),
    environment: text('environment').notNull(),
    responseFormat: text('response_format').notNull(),
    timeoutSeconds: integer('timeout_seconds').notNull().default(60),
    maxTokens: integer('max_tokens').notNull().default(4000),
    isActive: boolean('is_active').notNull().default(false),
    supportsMultipleModels: boolean('supports_multiple_models').notNull().default(false),
    supportsFallback: boolean('supports_fallback').notNull().default(false),
    connectionStatus: text('connection_status').notNull().default('not_tested'),
    lastConnectionTestAt: timestamp('last_connection_test_at'),
    lastConnectionTestResult: text('last_connection_test_result'),
    lastConnectionError: text('last_connection_error'),
    createdByUserId: text('created_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    updatedByUserId: text('updated_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [index('ai_provider_configuration_is_active_idx').on(table.isActive)],
);
