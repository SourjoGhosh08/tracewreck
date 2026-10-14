import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export interface RunError {
  code: string;
  message: string;
  retryable: boolean;
}

export const runStatuses = ["success", "suspicious", "failed"] as const;
export type RunStatus = (typeof runStatuses)[number];

export const traceStepTypes = ["input", "thought", "tool_call", "tool_result", "output", "error"] as const;
export type TraceStepType = (typeof traceStepTypes)[number];

export const traceStepStatuses = ["completed", "failed", "skipped"] as const;
export type TraceStepStatus = (typeof traceStepStatuses)[number];

export const agentRuns = sqliteTable("agent_runs", {
  id: text("id").primaryKey(),
  agentName: text("agent_name").notNull(),
  agentVersion: text("agent_version").notNull(),
  status: text("status", { enum: runStatuses }).notNull(),
  failureClass: text("failure_class"),
  startedAt: text("started_at").notNull(),
  completedAt: text("completed_at"),
  durationMs: integer("duration_ms").notNull(),
  model: text("model").notNull(),
  environment: text("environment", { mode: "json" }).$type<Record<string, string>>().notNull(),
  input: text("input", { mode: "json" }).$type<unknown>().notNull(),
  output: text("output", { mode: "json" }).$type<unknown>(),
  error: text("error", { mode: "json" }).$type<RunError | null>(),
  promptTokens: integer("prompt_tokens").notNull(),
  completionTokens: integer("completion_tokens").notNull(),
  totalTokens: integer("total_tokens").notNull(),
  costUsd: real("cost_usd").notNull(),
  createdAt: text("created_at").notNull()
});

export const traceSteps = sqliteTable("trace_steps", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull().references(() => agentRuns.id, { onDelete: "cascade" }),
  stepIndex: integer("step_index").notNull(),
  type: text("type", { enum: traceStepTypes }).notNull(),
  name: text("name").notNull(),
  status: text("status", { enum: traceStepStatuses }).notNull(),
  startedAt: text("started_at").notNull(),
  completedAt: text("completed_at"),
  durationMs: integer("duration_ms").notNull(),
  input: text("input", { mode: "json" }).$type<unknown>(),
  output: text("output", { mode: "json" }).$type<unknown>(),
  tool: text("tool"),
  error: text("error", { mode: "json" }).$type<RunError | null>(),
  isFirstFaultyStep: integer("is_first_faulty_step", { mode: "boolean" }).notNull().default(false)
});

export type AgentRun = typeof agentRuns.$inferSelect;
export type NewAgentRun = typeof agentRuns.$inferInsert;
export type TraceStep = typeof traceSteps.$inferSelect;
export type NewTraceStep = typeof traceSteps.$inferInsert;

// Kept as aliases for backend callers that used the original generic names.
export const runs = agentRuns;
export type Run = AgentRun;
export type NewRun = NewAgentRun;
