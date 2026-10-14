export type TraceEventStatus = "ok" | "warning" | "error" | "completed" | "failed" | "skipped";
export type TraceEventType =
  | "user_request"
  | "agent_plan"
  | "model_call"
  | "retrieval"
  | "tool_call"
  | "tool_result"
  | "policy_check"
  | "human_approval"
  | "retry"
  | "error"
  | "final_response"
  // Legacy aliases remain typed because the unchanged page supports old fixtures.
  | "input"
  | "thought"
  | "output";
export type AgentRunStatus = "success" | "suspicious" | "failed";

export interface RunError {
  code: string;
  message: string;
  retryable: boolean;
}

/** A normalized trace step returned by GET /api/runs/:id. */
export interface TraceStep {
  // Exact API contract.
  step_id: string;
  parent_step_id: string | null;
  type: TraceEventType;
  title: string;
  started_at: string;
  ended_at: string;
  input: unknown;
  output: unknown;
  tokens_in: number;
  tokens_out: number;
  latency_ms: number;
  status: TraceEventStatus;
  risk_score: number | null;
  notes: string | null;
  is_first_faulty_step: boolean;

  // Compatibility aliases consumed by the unchanged page.
  id: string;
  runId: string;
  stepIndex: number;
  name: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number;
  tool?: string | null;
  error?: RunError | null;
  isFirstFaultyStep: boolean;
  riskScore?: number | null;
  tokenUsage?: number | { input?: number; output?: number; total?: number } | null;
  token_usage?: number | { input?: number; output?: number; total?: number } | null;
}

export interface RunTrace {
  version: 1;
  run_id: string;
  agent: { name: string; version: string };
  status: AgentRunStatus;
  started_at: string;
  ended_at: string;
  steps: TraceStep[];
  events: TraceStep[];
  summary: {
    total_steps: number;
    completed_steps: number;
    failed_step: string | null;
    first_faulty_step: string | null;
    root_cause: string | null;
    totalSteps: number;
    completedSteps: number;
    failedStep: string | null;
    firstFaultyStep: string | null;
    rootCause: string | null;
  };
}

export interface RunListRecord {
  id: string;
  agent_name: string;
  agent_version: string;
  model: string;
  task_summary: string;
  user_request: unknown;
  status: AgentRunStatus;
  final_outcome: unknown;
  failure_class: string | null;
  started_at: string;
  ended_at: string;
  duration_ms: number;
  total_tokens_in: number;
  total_tokens_out: number;
  llm_calls: number;
  tool_calls: number;
  created_at: string;
  step_count: number;
  first_faulty_step: string | null;
  error_code: string | null;

  // Compatibility aliases consumed by the unchanged dashboard.
  agentName: string;
  agentVersion: string;
  failureClass: string | null;
  startedAt: string;
  completedAt: string | null;
  durationMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  createdAt: string;
  stepCount: number;
  firstFaultyStep: string | null;
  errorCode: string | null;
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
