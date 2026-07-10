import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('director', 'coordinator', 'social_worker'))
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      fhir_resource TEXT NOT NULL,
      outcome TEXT NOT NULL CHECK (outcome IN ('success', 'denied', 'error', 'flagged'))
    );

    CREATE TABLE IF NOT EXISTS analysis_cache (
      patient_id TEXT PRIMARY KEY,
      result_json TEXT NOT NULL,
      model_version TEXT NOT NULL,
      created_ts TEXT NOT NULL
    );
  `);

  // S19 Thread B — one-shot schema migration: SQLite has no
  // `ALTER TABLE ... DROP CONSTRAINT`, so the only way to widen the
  // `outcome` CHECK is to drop and recreate. We do this in code (not via
  // SQL migration files) because the existing migrate() flow is
  // idempotent via `IF NOT EXISTS` but does not otherwise evolve.
  //
  // Detection: probe the CHECK constraint string from sqlite_master; if
  // 'flagged' is missing, run the recreate. POC scope: audit_log rows are
  // local-dev-only and recreating them preserves the dev workflow
  // (writes re-fire on subsequent activity).
  const auditLogCheckRow = db
    .prepare(
      `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'audit_log'`
    )
    .get() as { sql: string } | undefined;
  if (auditLogCheckRow && !auditLogCheckRow.sql.includes("'flagged'")) {
    db.exec(`
      ALTER TABLE audit_log RENAME TO audit_log__pre_s19;
      CREATE TABLE audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts TEXT NOT NULL,
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        fhir_resource TEXT NOT NULL,
        outcome TEXT NOT NULL CHECK (outcome IN ('success', 'denied', 'error', 'flagged'))
      );
      INSERT INTO audit_log (id, ts, actor, action, fhir_resource, outcome)
        SELECT id, ts, actor, action, fhir_resource, outcome FROM audit_log__pre_s19;
      DROP TABLE audit_log__pre_s19;
    `);
  }
}

let dbInstance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (dbInstance) return dbInstance;
  const dbPath = process.env.DB_PATH ?? path.join(__dirname, '../../data/caresync.sqlite');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  dbInstance = new Database(dbPath);
  migrate(dbInstance);
  return dbInstance;
}
