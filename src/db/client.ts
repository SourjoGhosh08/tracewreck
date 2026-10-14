import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

declare global {
  // eslint-disable-next-line no-var
  var __agentPostmortemDb: Db | undefined;
  // eslint-disable-next-line no-var
  var __agentPostmortemSqlite: Database.Database | undefined;
}

function databaseFile(): string {
  const configured = process.env.DATABASE_URL ?? "file:./data/agentpostmortem.db";
  if (configured === ":memory:") return configured;
  return configured.startsWith("file:") ? resolve(process.cwd(), configured.slice(5)) : resolve(process.cwd(), configured);
}

function createDb(): Db {
  const filename = databaseFile();
  if (filename !== ":memory:") mkdirSync(dirname(filename), { recursive: true });
  const sqlite = new Database(filename);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  globalThis.__agentPostmortemSqlite = sqlite;

  // Replace the Phase 1 prototype's JSON-in-runs table when an existing local
  // database is opened. The normalized tables are the sole source of truth.
  const oldRuns = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'runs'").get();
  if (oldRuns) sqlite.exec("DROP TABLE runs");
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS agent_runs (
      id TEXT PRIMARY KEY NOT NULL,
      agent_name TEXT NOT NULL,
      agent_version TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('success', 'suspicious', 'failed')),
      failure_class TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      duration_ms INTEGER NOT NULL,
      model TEXT NOT NULL,
      environment TEXT NOT NULL,
      input TEXT NOT NULL,
      output TEXT,
      error TEXT,
      prompt_tokens INTEGER NOT NULL,
      completion_tokens INTEGER NOT NULL,
      total_tokens INTEGER NOT NULL,
      cost_usd REAL NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS trace_steps (
      id TEXT PRIMARY KEY NOT NULL,
      run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
      step_index INTEGER NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('input', 'thought', 'tool_call', 'tool_result', 'output', 'error')),
      name TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('completed', 'failed', 'skipped')),
      started_at TEXT NOT NULL,
      completed_at TEXT,
      duration_ms INTEGER NOT NULL,
      input TEXT,
      output TEXT,
      tool TEXT,
      error TEXT,
      is_first_faulty_step INTEGER NOT NULL DEFAULT 0 CHECK (is_first_faulty_step IN (0, 1)),
      UNIQUE (run_id, step_index)
    );
  `);
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
