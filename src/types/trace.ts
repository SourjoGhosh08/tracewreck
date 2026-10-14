export type TraceEventStatus = "completed" | "failed" | "skipped";
export type TraceEventType = "input" | "thought" | "tool_call" | "tool_result" | "output" | "error";
export type AgentRunStatus = "success" | "suspicious" | "failed";

export interface RunError {
  code: string;
  message: string;
  retryable: boolean;
}

/** A normalized trace step returned by GET /api/runs/:id. */
export interface TraceStep {
  id: string;
  runId: string;
  stepIndex: number;
  type: TraceEventType;
  name: string;
  status: TraceEventStatus;
  startedAt: string;
  completedAt: string | null;
  durationMs: number;
  input?: unknown;
  output?: unknown;
  tool?: string | null;
  error?: RunError | null;
  isFirstFaultyStep: boolean;
  is_first_faulty_step?: boolean;
  riskScore?: number | null;
  risk_score?: number | null;
  tokenUsage?: number | { input?: number; output?: number; total?: number } | null;
  token_usage?: number | { input?: number; output?: number; total?: number } | null;
}

export interface RunTrace {
  version: 1;
  runId: string;
  agent: {
    name: string;
    version: string;
  };
  status: AgentRunStatus;
  startedAt: string;
  completedAt: string | null;
  events: TraceStep[];
  summary: {
    totalSteps: number;
    completedSteps: number;
    failedStep: string | null;
    firstFaultyStep?: string | null;
    rootCause: string | null;
  };
}

export interface RunListRecord {
  id: string;
  agentName: string;
  agentVersion: string;
  status: AgentRunStatus;
  failureClass: string | null;
  startedAt: string;
  completedAt: string | null;
  durationMs: number;
  model: string;
  environment: Record<string, string>;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  createdAt: string;
  stepCount: number;
  firstFaultyStep: string | null;
  errorCode: string | null;
  /** Enriched from the detail endpoint for the dashboard table. */
  steps?: TraceStep[];
  taskSummary?: string;
}

export interface RunRecord extends RunListRecord {
  input: unknown;
  output: unknown;
  error: RunError | null;
  trace: RunTrace;
  steps: TraceStep[];
}
