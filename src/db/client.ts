import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { sql } from "drizzle-orm";
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
  const db = drizzle(sqlite, { schema });
  db.run(sql.raw(`CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY NOT NULL,
    agent_name TEXT NOT NULL,
    agent_version TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('completed', 'failed')),
    started_at TEXT NOT NULL,
    completed_at TEXT,
    duration_ms INTEGER NOT NULL,
    model TEXT NOT NULL,
    environment TEXT NOT NULL,
    input TEXT NOT NULL,
    output TEXT,
    error TEXT,
    trace TEXT NOT NULL,
    prompt_tokens INTEGER NOT NULL,
    completion_tokens INTEGER NOT NULL,
    total_tokens INTEGER NOT NULL,
    cost_usd REAL NOT NULL,
    created_at TEXT NOT NULL
  )`));
  return db;
}

export function getDb(): Db {
  return (globalThis.__agentPostmortemDb ??= createDb());
}

export function closeDb(): void {
  globalThis.__agentPostmortemSqlite?.close();
  globalThis.__agentPostmortemDb = undefined;
  globalThis.__agentPostmortemSqlite = undefined;
}
