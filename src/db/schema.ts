import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const runStatuses = ["success", "suspicious", "failed"] as const;
export type RunStatus = (typeof runStatuses)[number];

export const traceStepTypes = [
  "user_request",
  "agent_plan",
  "model_call",
  "retrieval",
  "tool_call",
  "tool_result",
  "policy_check",
  "human_approval",
  "retry",
  "error",
  "final_response"
] as const;
export type TraceStepType = (typeof traceStepTypes)[number];

export const traceStepStatuses = ["ok", "warning", "error"] as const;
export type TraceStepStatus = (typeof traceStepStatuses)[number];

/** The normalized run record. These fields mirror the public backend contract. */
export const agentRuns = sqliteTable("agent_runs", {
  id: text("id").primaryKey(),
  agentName: text("agent_name").notNull(),
  agentVersion: text("agent_version").notNull(),
  model: text("model").notNull(),
  taskSummary: text("task_summary").notNull(),
  userRequest: text("user_request", { mode: "json" }).$type<unknown>().notNull(),
  status: text("status", { enum: runStatuses }).notNull(),
  finalOutcome: text("final_outcome", { mode: "json" }).$type<unknown>().notNull(),
  failureClass: text("failure_class"),
  startedAt: text("started_at").notNull(),
  endedAt: text("ended_at").notNull(),
  durationMs: integer("duration_ms").notNull(),
  totalTokensIn: integer("total_tokens_in").notNull(),
  totalTokensOut: integer("total_tokens_out").notNull(),
  llmCalls: integer("llm_calls").notNull(),
  toolCalls: integer("tool_calls").notNull(),
  createdAt: text("created_at").notNull()
});

/** One normalized execution step. JSON payloads are stored as SQLite TEXT. */
export const traceSteps = sqliteTable("trace_steps", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull().references(() => agentRuns.id, { onDelete: "cascade" }),
  stepId: text("step_id").notNull(),
  parentStepId: text("parent_step_id"),
  type: text("type", { enum: traceStepTypes }).notNull(),
  title: text("title").notNull(),
  startedAt: text("started_at").notNull(),
  endedAt: text("ended_at").notNull(),
  inputJson: text("input_json", { mode: "json" }).$type<unknown>(),
  outputJson: text("output_json", { mode: "json" }).$type<unknown>(),
  tokensIn: integer("tokens_in").notNull().default(0),
  tokensOut: integer("tokens_out").notNull().default(0),
  latencyMs: integer("latency_ms").notNull(),
  status: text("status", { enum: traceStepStatuses }).notNull(),
  riskScore: real("risk_score"),
  notes: text("notes"),
  isFirstFaultyStep: integer("is_first_faulty_step", { mode: "boolean" }).notNull().default(false)
});

export const diagnosisStatuses = ["running", "completed", "failed"] as const;
export type DiagnosisStatus = (typeof diagnosisStatuses)[number];

/** A persisted, model-produced diagnosis. Fixture annotations are never stored here. */
export const diagnosisReports = sqliteTable("diagnosis_reports", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull().references(() => agentRuns.id, { onDelete: "cascade" }),
  evidenceFingerprint: text("evidence_fingerprint").notNull(),
  status: text("status", { enum: diagnosisStatuses }).notNull(),
  reportJson: text("report_json", { mode: "json" }).$type<unknown>(),
  source: text("source").notNull().default("live_model"),
  provider: text("provider"),
  model: text("model"),
  promptVersion: text("prompt_version").notNull().default("phase3-v1"),
  schemaVersion: integer("schema_version").notNull().default(1),
  tokenUsageJson: text("token_usage_json", { mode: "json" }).$type<unknown>(),
  inputRedacted: integer("input_redacted", { mode: "boolean" }).notNull().default(false),
  inputTruncated: integer("input_truncated", { mode: "boolean" }).notNull().default(false),
  omittedContentJson: text("omitted_content_json", { mode: "json" }).$type<unknown>(),
  attempts: integer("attempts").notNull().default(0),
  errorCode: text("error_code"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export type AgentRun = typeof agentRuns.$inferSelect;
export type NewAgentRun = typeof agentRuns.$inferInsert;
export type TraceStep = typeof traceSteps.$inferSelect;
export type NewTraceStep = typeof traceSteps.$inferInsert;
export type DiagnosisReport = typeof diagnosisReports.$inferSelect;
export type NewDiagnosisReport = typeof diagnosisReports.$inferInsert;

// Kept as aliases for callers that used the original generic names.
export const runs = agentRuns;
export type Run = AgentRun;
export type NewRun = NewAgentRun;
