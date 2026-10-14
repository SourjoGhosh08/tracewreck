import { real, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { RunTrace } from "@/types/trace";

export interface RunError {
  code: string;
  message: string;
  retryable: boolean;
}

export const runStatus = ["completed", "failed"] as const;
export type RunStatus = (typeof runStatus)[number];

export const runs = sqliteTable("runs", {
  id: text("id").primaryKey(),
  agentName: text("agent_name").notNull(),
  agentVersion: text("agent_version").notNull(),
  status: text("status", { enum: runStatus }).notNull(),
  startedAt: text("started_at").notNull(),
  completedAt: text("completed_at"),
  durationMs: integer("duration_ms").notNull(),
  model: text("model").notNull(),
  environment: text("environment", { mode: "json" }).$type<Record<string, string>>().notNull(),
  input: text("input", { mode: "json" }).$type<unknown>().notNull(),
  output: text("output", { mode: "json" }).$type<unknown>(),
  error: text("error", { mode: "json" }).$type<RunError | null>(),
  trace: text("trace", { mode: "json" }).$type<RunTrace>().notNull(),
  promptTokens: integer("prompt_tokens").notNull(),
  completionTokens: integer("completion_tokens").notNull(),
  totalTokens: integer("total_tokens").notNull(),
  costUsd: real("cost_usd").notNull(),
  createdAt: text("created_at").notNull()
});

export type Run = typeof runs.$inferSelect;
export type NewRun = typeof runs.$inferInsert;
