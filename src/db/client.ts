import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

declare global {
  var __agentPostmortemDb: Db | undefined;
  var __agentPostmortemSqlite: Database.Database | undefined;
}

function databaseFile(): string {
  const configured = process.env.DATABASE_URL ?? localDatabaseUrl() ?? "file:./data/agentpostmortem.db";
  if (configured === ":memory:") return configured;
  return configured.startsWith("file:") ? resolve(process.cwd(), configured.slice(5)) : resolve(process.cwd(), configured);
}

function localDatabaseUrl(): string | undefined {
  for (const filename of [".env.local", ".env"]) {
    const path = resolve(process.cwd(), filename);
    if (!existsSync(path)) continue;
    const line = readFileSync(path, "utf8").split(/\r?\n/).find((entry) => /^\s*DATABASE_URL\s*=/.test(entry));
    if (!line) continue;
    const value = line.replace(/^\s*DATABASE_URL\s*=\s*/, "").trim().replace(/^(['"])(.*)\1$/, "$2");
    if (value) return value;
  }
  return undefined;
}

function createDb(): Db {
  const filename = databaseFile();
  if (filename !== ":memory:") mkdirSync(dirname(filename), { recursive: true });
  const sqlite = new Database(filename);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  globalThis.__agentPostmortemSqlite = sqlite;

  // Startup is intentionally additive. Never drop or reset an existing
  // database: this initializer creates missing tables, while the seed step
  // separately decides whether the database is empty.
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS agent_runs (
      id TEXT PRIMARY KEY NOT NULL,
      agent_name TEXT NOT NULL,
      agent_version TEXT NOT NULL,
      model TEXT NOT NULL,
      task_summary TEXT NOT NULL,
      user_request TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('success', 'suspicious', 'failed')),
      final_outcome TEXT NOT NULL,
      failure_class TEXT,
      started_at TEXT NOT NULL,
      ended_at TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      total_tokens_in INTEGER NOT NULL,
      total_tokens_out INTEGER NOT NULL,
      llm_calls INTEGER NOT NULL,
      tool_calls INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS trace_steps (
      id TEXT PRIMARY KEY NOT NULL,
      run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
      step_id TEXT NOT NULL,
      parent_step_id TEXT,
      type TEXT NOT NULL CHECK (type IN ('user_request', 'agent_plan', 'model_call', 'retrieval', 'tool_call', 'tool_result', 'policy_check', 'human_approval', 'retry', 'error', 'final_response')),
      title TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT NOT NULL,
      input_json TEXT,
      output_json TEXT,
      tokens_in INTEGER NOT NULL DEFAULT 0,
      tokens_out INTEGER NOT NULL DEFAULT 0,
      latency_ms INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('ok', 'warning', 'error')),
      risk_score REAL,
      notes TEXT,
      is_first_faulty_step INTEGER NOT NULL DEFAULT 0 CHECK (is_first_faulty_step IN (0, 1)),
       UNIQUE (run_id, step_id)
    );
    CREATE TABLE IF NOT EXISTS diagnosis_reports (
      id TEXT PRIMARY KEY NOT NULL,
      run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
      evidence_fingerprint TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
      report_json TEXT,
      source TEXT NOT NULL DEFAULT 'live_model',
      provider TEXT,
      model TEXT,
      prompt_version TEXT NOT NULL DEFAULT 'phase3-v1',
      schema_version INTEGER NOT NULL DEFAULT 1,
      token_usage_json TEXT,
      input_redacted INTEGER NOT NULL DEFAULT 0,
      input_truncated INTEGER NOT NULL DEFAULT 0,
      omitted_content_json TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      error_code TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (run_id, evidence_fingerprint)
    );
    CREATE INDEX IF NOT EXISTS diagnosis_reports_run_id_idx ON diagnosis_reports (run_id, updated_at);
  `);
  // The diagnosis table is additive so a database created during an earlier
  // Phase 3 build can be opened without dropping runs or trace steps.
  const diagnosisColumns = sqlite.prepare("PRAGMA table_info(diagnosis_reports)").all() as Array<{ name: string }>;
  const existingColumns = new Set(diagnosisColumns.map((column) => column.name));
  const additions: Array<[string, string]> = [
    ["source", "TEXT NOT NULL DEFAULT 'live_model'"],
    ["provider", "TEXT"],
    ["prompt_version", "TEXT NOT NULL DEFAULT 'phase3-v1'"],
    ["schema_version", "INTEGER NOT NULL DEFAULT 1"],
    ["token_usage_json", "TEXT"],
    ["input_redacted", "INTEGER NOT NULL DEFAULT 0"],
    ["input_truncated", "INTEGER NOT NULL DEFAULT 0"],
    ["omitted_content_json", "TEXT"]
  ];
  for (const [column, definition] of additions) {
    if (!existingColumns.has(column)) sqlite.exec(`ALTER TABLE diagnosis_reports ADD COLUMN ${column} ${definition}`);
  }
  return drizzle(sqlite, { schema });
}

export function getDb(): Db {
  return (globalThis.__agentPostmortemDb ??= createDb());
}

export function closeDb(): void {
  globalThis.__agentPostmortemSqlite?.close();
  globalThis.__agentPostmortemDb = undefined;
  globalThis.__agentPostmortemSqlite = undefined;
}
