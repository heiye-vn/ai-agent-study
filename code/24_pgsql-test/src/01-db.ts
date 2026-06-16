import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const result = dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

if (result.error) {
  throw new Error(`Failed to load .env file: ${result.error.message}`);
}

const envVars = result.parsed;
if (!envVars || !envVars.DATABASE_URL) {
  throw new Error('DATABASE_URL is not defined in .env file');
}

const { Pool } = pg;

const pool = new Pool({
  connectionString: envVars.DATABASE_URL,
});

async function query(text: string, params?: any) {
  return pool.query(text, params);
}

export { pool, query };
