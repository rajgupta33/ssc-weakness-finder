import "dotenv/config";
import { mkdir } from "node:fs/promises";
import pg from "pg";

let db;
export async function getDb() {
  if (db) return db;
  if (process.env.DATABASE_URL) {
    db = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000,
    });
  } else {
    if (process.env.VERCEL)
      throw new Error(
        "Connect PostgreSQL and set DATABASE_URL before deploying.",
      );
    db = (async () => {
      const { PGlite } = await import("@electric-sql/pglite");
      await mkdir(".data", { recursive: true });
      return new PGlite(process.env.PGLITE_DATA_DIR || ".data/db");
    })();
  }
  return db;
}
export async function query(sql, params = []) {
  return (await getDb()).query(sql, params);
}
export async function transaction(fn) {
  const connection = await getDb();
  if (!connection.connect)
    return connection.transaction((tx) =>
      fn((sql, params = []) => tx.query(sql, params)),
    );
  const client = connection.connect ? await connection.connect() : connection;
  try {
    await client.query("BEGIN");
    const result = await fn((sql, params = []) => client.query(sql, params));
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    if (client !== connection) client.release();
  }
}

export async function initDb() {
  const statements = [
    `CREATE TABLE IF NOT EXISTS modules (code TEXT PRIMARY KEY, diagnostic_id TEXT NOT NULL, name TEXT NOT NULL, revision_text TEXT NOT NULL, display_order INTEGER NOT NULL, expected_count INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS diagnostics (id TEXT PRIMARY KEY, title TEXT NOT NULL, subject TEXT NOT NULL, chapter TEXT NOT NULL, question_count INTEGER NOT NULL, is_active BOOLEAN NOT NULL DEFAULT TRUE)`,
    `CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY, question_code TEXT NOT NULL UNIQUE, subject TEXT NOT NULL, chapter_slug TEXT NOT NULL,
      primary_module_code TEXT NOT NULL REFERENCES modules(code), sub_module TEXT NOT NULL, difficulty TEXT NOT NULL,
      prompt TEXT NOT NULL, option_a TEXT NOT NULL, option_b TEXT NOT NULL, option_c TEXT NOT NULL, option_d TEXT NOT NULL,
      correct_option TEXT NOT NULL, explanation TEXT NOT NULL, rule_summary TEXT NOT NULL,
      exam_name TEXT NOT NULL, paper_stage TEXT, exam_year INTEGER NOT NULL, exam_date TEXT, shift TEXT,
      source_type TEXT NOT NULL, source_url TEXT NOT NULL, source_note TEXT,
      verification_status TEXT NOT NULL, verified_by TEXT, verified_at TEXT,
      is_live BOOLEAN NOT NULL DEFAULT FALSE, display_order INTEGER NOT NULL,
      CHECK (correct_option IN ('A','B','C','D')),
      CHECK (verification_status IN ('unverified','checked','verified')),
      CHECK (NOT is_live OR (verification_status='verified' AND verified_by IS NOT NULL AND verified_at IS NOT NULL))
    )`,
    `CREATE TABLE IF NOT EXISTS diagnostic_questions (diagnostic_id TEXT NOT NULL REFERENCES diagnostics(id), question_id TEXT NOT NULL REFERENCES questions(id), display_order INTEGER NOT NULL, PRIMARY KEY(diagnostic_id,question_id), UNIQUE(diagnostic_id,display_order))`,
    `CREATE TABLE IF NOT EXISTS attempts (id TEXT PRIMARY KEY, diagnostic_id TEXT NOT NULL REFERENCES diagnostics(id), student_name TEXT NOT NULL, status TEXT NOT NULL, started_at TEXT NOT NULL, first_answered_at TEXT, submitted_at TEXT, score INTEGER, accuracy DOUBLE PRECISION, correct_count INTEGER, incorrect_count INTEGER, unattempted_count INTEGER, access_token TEXT NOT NULL, CHECK(status IN ('in_progress','submitted')))`,
    `CREATE TABLE IF NOT EXISTS attempt_questions (attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE, question_id TEXT NOT NULL, position INTEGER NOT NULL, snapshot JSONB NOT NULL, PRIMARY KEY(attempt_id,question_id), UNIQUE(attempt_id,position))`,
    `CREATE TABLE IF NOT EXISTS responses (attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE, question_id TEXT NOT NULL, selected_option TEXT, marked_for_review BOOLEAN NOT NULL DEFAULT FALSE, visited BOOLEAN NOT NULL DEFAULT FALSE, answered_at TEXT, is_correct BOOLEAN, points INTEGER, PRIMARY KEY(attempt_id,question_id), CHECK(selected_option IS NULL OR selected_option IN ('A','B','C','D')))`,
    `CREATE INDEX IF NOT EXISTS attempts_status_date ON attempts(status,started_at)`,
  ];
  await transaction(async (run) => {
    // Concurrent Vercel instances must not race while creating a fresh schema.
    if (process.env.DATABASE_URL)
      await run("SELECT pg_advisory_xact_lock(82917401)");
    for (const sql of statements) await run(sql);
  });
}
