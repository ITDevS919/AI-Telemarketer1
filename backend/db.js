import pkg from 'pg';

const { Pool } = pkg;

export const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || 'ai_telemarketer',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || ''
});

export async function initDatabase() {
  await pool.query(`
    create table if not exists calls (
      id serial primary key,
      call_sid text,
      version text,
      to_number text,
      voice_name text,
      created_at timestamptz default now(),
      status text,
      meta jsonb
    )
  `);
}

