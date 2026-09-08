const { Pool } = require('pg');
require('dotenv').config();

// Uses standard PG* env vars, or a single DATABASE_URL if you're on
// a hosted provider like Supabase/Render/Railway.
const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
    : {
        host: process.env.PGHOST || 'localhost',
        port: process.env.PGPORT || 5432,
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD || 'postgres',
        database: process.env.PGDATABASE || 'attendance',
      }
);

module.exports = pool;
