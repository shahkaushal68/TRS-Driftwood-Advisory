import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { PoolConfig } from 'pg';
import { config } from '../libs/config';
const isLocal =
  config.DATABASE_URL.includes('localhost') || config.DATABASE_URL.includes('127.0.0.1');
const poolConfig: PoolConfig = {
  connectionString: config.DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false },
};
export const pool = new Pool(poolConfig);
export const db = drizzle(pool);
