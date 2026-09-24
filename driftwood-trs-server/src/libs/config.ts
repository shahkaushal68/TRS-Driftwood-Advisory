import * as dotenv from 'dotenv';
import * as path from 'path';
import pino from 'pino';
import { z } from 'zod';

const root = process.cwd();
const nodeEnv = process.env['NODE_ENV'] ?? 'development';

dotenv.config({ path: path.join(root, '.env') });
dotenv.config({ path: path.join(root, `.env.${nodeEnv}`), override: true });
dotenv.config({ path: path.join(root, `.env.${nodeEnv}.local`), override: true });

const configSchema = z.object({
  // --- Server ---
  PORT: z.coerce.number().int().positive().default(8000),
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),

  // --- CORS ---
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  //  --- Database ---
  DATABASE_URL: z.string(
    'DATABASE_URL must be a valid URL (e.g. postgresql://user:password@host:port/dbname)',
  ),

  // --- Redis ---
  REDIS_USERNAME: z.string('REDIS_USERNAME is required'),
  REDIS_PASSWORD: z.string('REDIS_PASSWORD is required'),
  REDIS_HOST: z.string('REDIS_HOST is required'),
  REDIS_PORT: z.coerce
    .number('REDIS_PORT must be a number')
    .int()
    .positive('REDIS_PORT must be a positive integer'),

  // --- Auth ---
  BETTER_AUTH_SECRET: z
    .string()
    .min(
      32,
      'BETTER_AUTH_SECRET must be at least 32 characters — generate one with: openssl rand -base64 32',
    ),
  BETTER_AUTH_URL: z.url('BETTER_AUTH_URL must be a valid URL (e.g. http://localhost:8000)'),

  // --- API ---
  API_PREFIX: z.string().default('api'),

  // --- AWS ---
  AWS_ACCESS_KEY_ID: z.string('AWS_ACCESS_KEY_ID is required'),
  AWS_SECRET_ACCESS_KEY: z.string('AWS_SECRET_ACCESS_KEY is required'),
  AWS_REGION: z.string().default('us-east-1'),
  AWS_S3_BUCKET: z.string('AWS_S3_BUCKET is required — the S3 bucket name for file uploads'),
  AWS_S3_PRESIGN_EXPIRES_IN: z.coerce.number().int().positive().default(300),

  // --- Email (Resend) ---
  RESEND_API_KEY: z.string('RESEND_API_KEY is required — create one at resend.com/api-keys'),
  RESEND_FROM: z.email('RESEND_FROM is required — must be a verified sender at resend.com'),
  RESEND_LOCAL_TO: z.string().default('harsh+driftwood@godatanova.com'),
  RESEND_PASSWORD_RESET_TEMPLATE_ID: z.string(
    'RESEND_PASSWORD_RESET_TEMPLATE_ID is required — create the template at resend.com/emails/templates',
  ),
  RESEND_WELCOME_TEMPLATE_ID: z.string(
    'RESEND_WELCOME_TEMPLATE_ID is required — create the template at resend.com/emails/templates',
  ),

  // --- AI Provider Configuration ---
  AI_PROVIDER_CONFIG_ENCRYPTION_KEY: z
    .string()
    .length(
      64,
      'AI_PROVIDER_CONFIG_ENCRYPTION_KEY must be a 64-character hex string (32 bytes) — generate with `openssl rand -hex 32`',
    )
    .optional(),
});

export type Config = z.infer<typeof configSchema>;

const parsed = configSchema.safeParse(process.env);

if (!parsed.success) {
  const bootLogger = pino({ level: 'fatal' });
  bootLogger.fatal(
    { fields: z.treeifyError(parsed.error) },
    'Invalid environment variables — aborting startup',
  );
  process.exit(1);
}

export const config: Config = parsed.data;
