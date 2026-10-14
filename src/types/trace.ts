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
