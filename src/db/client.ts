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

  // Replace the prototype schema when an existing local database is opened.
  // This keeps a checkout with an older ignored SQLite file reproducible while
  // preserving data for databases that already have the current contract.
  const requiredRunColumns = [
    "id", "agent_name", "agent_version", "model", "task_summary", "user_request",
    "status", "final_outcome", "failure_class", "started_at", "ended_at", "duration_ms",
    "total_tokens_in", "total_tokens_out", "llm_calls", "tool_calls", "created_at"
  ];
  const requiredStepColumns = [
    "id", "run_id", "step_id", "parent_step_id", "type", "title", "started_at", "ended_at",
    "input_json", "output_json", "tokens_in", "tokens_out", "latency_ms", "status", "risk_score",
    "notes", "is_first_faulty_step"
  ];
  const columnsFor = (table: string) => new Set(
    (sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((column) => column.name)
  );
  const currentSchema = requiredRunColumns.every((column) => columnsFor("agent_runs").has(column)) &&
    requiredStepColumns.every((column) => columnsFor("trace_steps").has(column));
  if (!currentSchema) sqlite.exec("DROP TABLE IF EXISTS trace_steps; DROP TABLE IF EXISTS agent_runs; DROP TABLE IF EXISTS runs;");
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
