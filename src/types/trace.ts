export type TraceEventStatus = "completed" | "failed" | "skipped";
export type TraceEventType = "input" | "thought" | "tool_call" | "tool_result" | "output" | "error";

export interface TraceEvent {
  id: string;
  type: TraceEventType;
  name: string;
  status: TraceEventStatus;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  input?: unknown;
  output?: unknown;
  tool?: string;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

export interface RunTrace {
  version: 1;
  runId: string;
  agent: {
    name: string;
    version: string;
  };
  status: "completed" | "failed";
  startedAt: string;
  completedAt: string;
  events: TraceEvent[];
  summary: {
    totalSteps: number;
    completedSteps: number;
    failedStep: string | null;
    rootCause: string | null;
  };
}

export interface RunRecord {
  id: string;
  agentName: string;
  agentVersion: string;
  status: "completed" | "failed";
  startedAt: string;
  completedAt: string | null;
  durationMs: number;
  model: string;
  environment: Record<string, string>;
  input: unknown;
  output: unknown;
  error: {
    code: string;
    message: string;
    retryable: boolean;
  } | null;
  trace: RunTrace;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  createdAt: string;
}
