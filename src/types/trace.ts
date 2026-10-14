export type TraceEventStatus = "completed" | "failed" | "skipped";
export type TraceEventType = "input" | "thought" | "tool_call" | "tool_result" | "output" | "error";
export type AgentRunStatus = "success" | "suspicious" | "failed";

export interface TraceEvent {
  id: string;
  runId?: string;
  stepIndex?: number;
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
  isFirstFaultyStep?: boolean;
}

export interface TraceStep extends TraceEvent {
  runId: string;
  stepIndex: number;
  isFirstFaultyStep: boolean;
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
  completedAt: string;
  events: TraceStep[];
  summary: {
    totalSteps: number;
    completedSteps: number;
    failedStep: string | null;
    firstFaultyStep?: string | null;
    rootCause: string | null;
  };
}

export interface AgentRunRecord {
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
  input: unknown;
  output: unknown;
  error: {
    code: string;
    message: string;
    retryable: boolean;
  } | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  createdAt: string;
  trace: RunTrace;
  steps: TraceStep[];
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
