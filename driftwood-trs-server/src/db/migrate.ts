import * as dotenv from 'dotenv';
import * as path from 'path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

const root = process.cwd();
const nodeEnv = process.env['NODE_ENV'] ?? 'development';

dotenv.config({ path: path.join(root, '.env') });
dotenv.config({ path: path.join(root, `.env.${nodeEnv}`), override: true });
dotenv.config({ path: path.join(root, `.env.${nodeEnv}.local`), override: true });

async function main() {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }

  const isLocal = url.includes('localhost') || url.includes('127.0.0.1');
  const pool = new Pool({ connectionString: url, ssl: isLocal ? false : { rejectUnauthorized: false } });
  const db = drizzle(pool);

  console.log('Running migrations...');
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrations complete.');

  await pool.end();
}

main().catch((err: unknown) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
