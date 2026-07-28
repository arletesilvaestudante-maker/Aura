import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { Pool } from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL não configurada.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  ssl: { rejectUnauthorized: true }
});

const directory = path.dirname(fileURLToPath(import.meta.url));
const client = await pool.connect();

try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS aura_schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const legacySchema = await client.query(`
    SELECT to_regclass('public.users') IS NOT NULL
       AND to_regclass('public.ai_interactions') IS NOT NULL
       AND to_regclass('public.generated_content') IS NOT NULL AS initialized
  `);
  if (legacySchema.rows[0]?.initialized) {
    await client.query(
      `INSERT INTO aura_schema_migrations (filename)
       VALUES ('001_init_schema.sql')
       ON CONFLICT (filename) DO NOTHING`
    );
  }

  const applied = new Set(
    (await client.query("SELECT filename FROM aura_schema_migrations")).rows.map(
      (row) => row.filename
    )
  );

  const files = fs.readdirSync(directory).filter((name) => name.endsWith(".sql")).sort();

  for (const filename of files) {
    if (applied.has(filename)) continue;
    const sql = fs.readFileSync(path.join(directory, filename), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query(
        "INSERT INTO aura_schema_migrations (filename) VALUES ($1)",
        [filename]
      );
      await client.query("COMMIT");
      console.log(`Migração aplicada: ${filename}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  client.release();
  await pool.end();
}
