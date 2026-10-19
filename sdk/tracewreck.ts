/**
 * Small dependency-free TypeScript client for sending agent traces to TraceWreck.
 *
 * This is intentionally framework-neutral. Copy this file into a Node/TypeScript
 * agent project, or import it from this repository while developing locally.
 */

export type TraceRunStatus = "success" | "suspicious" | "failed";
export type TraceStepType =
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
  | "final_response";
export type TraceStepStatus = "ok" | "warning" | "error";

export interface TraceStepInput {
  step_id: string;
  parent_step_id?: string | null;
  type: TraceStepType;
  title: string;
  started_at: string;
  ended_at: string;
  input: unknown;
  output: unknown;
  tokens_in?: number;
  tokens_out?: number;
  latency_ms?: number;
  status: TraceStepStatus;
  risk_score?: number | null;
  notes?: string | null;
}

export interface TraceRunInput {
  id: string;
  agent_name: string;
  agent_version: string;
  model: string;
  task_summary: string;
  user_request: unknown;
  status: TraceRunStatus;
  final_outcome: unknown;
  failure_class?: string | null;
  started_at: string;
  ended_at: string;
  duration_ms: number;
  total_tokens_in: number;
  total_tokens_out: number;
  llm_calls: number;
  tool_calls: number;
  created_at: string;
  steps: Array<Required<Pick<TraceStepInput, "step_id" | "type" | "title" | "started_at" | "ended_at" | "input" | "output" | "status">> & {
    parent_step_id: string | null;
    tokens_in: number;
    tokens_out: number;
    latency_ms: number;
    risk_score: number | null;
    notes: string | null;
  }>;
}

export interface TraceWreckClientOptions {
  endpoint: string;
  apiKey?: string;
  fetch?: typeof globalThis.fetch;
}

export interface ImportedRunResponse {
  run: { id: string; source: "imported"; [key: string]: unknown };
}

export class TraceWreckImportError extends Error {
  readonly status: number;
  readonly details: unknown;

  constructor(message: string, status: number, details: unknown) {
    super(message);
    this.name = "TraceWreckImportError";
    this.status = status;
    this.details = details;
  }
}

function isoNow() {
  return new Date().toISOString();
}

function durationBetween(startedAt: string, endedAt: string) {
  return Math.max(0, new Date(endedAt).getTime() - new Date(startedAt).getTime());
}

function randomRunId() {
  const suffix = typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID().slice(0, 12)
    : Math.random().toString(36).slice(2, 14);
  return `run_${Date.now()}_${suffix}`;
}

function normalizedStep(step: TraceStepInput) {
  const endedAt = step.ended_at;
  return {
    step_id: step.step_id,
    parent_step_id: step.parent_step_id ?? null,
    type: step.type,
    title: step.title,
    started_at: step.started_at,
    ended_at: endedAt,
    input: step.input,
    output: step.output,
    tokens_in: step.tokens_in ?? 0,
    tokens_out: step.tokens_out ?? 0,
    latency_ms: step.latency_ms ?? durationBetween(step.started_at, endedAt),
    status: step.status,
    risk_score: step.risk_score ?? null,
    notes: step.notes ?? null
  };
}

export class TraceWreckClient {
  private readonly endpoint: string;
  private readonly apiKey?: string;
  private readonly request: typeof globalThis.fetch;

  constructor(options: TraceWreckClientOptions) {
    this.endpoint = options.endpoint.replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.request = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async ingest(trace: TraceRunInput): Promise<ImportedRunResponse> {
    const response = await this.request(`${this.endpoint}/api/runs`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {})
      },
      body: JSON.stringify(trace)
    });
    const payload = await response.json().catch(() => ({})) as { error?: unknown; details?: unknown; run?: ImportedRunResponse["run"] };
    if (!response.ok) {
      const message = typeof payload.error === "string" ? payload.error : `TraceWreck import failed with HTTP ${response.status}`;
      throw new TraceWreckImportError(message, response.status, payload.details);
    }
    if (!payload.run || typeof payload.run.id !== "string") throw new TraceWreckImportError("TraceWreck returned an invalid import response", response.status, payload);
    return { run: payload.run as ImportedRunResponse["run"] };
  }

  startRun(options: Omit<TraceRunInput, "id" | "started_at" | "ended_at" | "duration_ms" | "total_tokens_in" | "total_tokens_out" | "llm_calls" | "tool_calls" | "created_at" | "steps" | "status" | "final_outcome"> & { id?: string; started_at?: string; status?: TraceRunStatus; final_outcome?: unknown }) {
    return new TraceWreckRun(this, {
      ...options,
      id: options.id || randomRunId(),
      started_at: options.started_at ?? isoNow(),
      status: options.status ?? "success",
      final_outcome: options.final_outcome ?? null
    });
  }
}

export class TraceWreckRun {
  private readonly client: TraceWreckClient;
  private readonly metadata: Omit<TraceRunInput, "ended_at" | "duration_ms" | "total_tokens_in" | "total_tokens_out" | "llm_calls" | "tool_calls" | "created_at" | "steps">;
  private readonly steps: TraceStepInput[] = [];

  constructor(client: TraceWreckClient, metadata: TraceWreckRun["metadata"]) {
    this.client = client;
    this.metadata = metadata;
  }

  recordStep(step: TraceStepInput) {
    this.steps.push({ ...step, parent_step_id: step.parent_step_id ?? this.steps.at(-1)?.step_id ?? null });
    return this;
  }

  async finish(options: { status?: TraceRunStatus; final_outcome?: unknown; failure_class?: string | null; ended_at?: string }) {
    const endedAt = options.ended_at ?? isoNow();
    const normalized = this.steps.map(normalizedStep);
    const trace: TraceRunInput = {
      ...this.metadata,
      status: options.status ?? this.metadata.status,
      final_outcome: options.final_outcome ?? this.metadata.final_outcome,
      failure_class: options.failure_class ?? null,
      ended_at: endedAt,
      duration_ms: durationBetween(this.metadata.started_at, endedAt),
      total_tokens_in: normalized.reduce((total, step) => total + step.tokens_in, 0),
      total_tokens_out: normalized.reduce((total, step) => total + step.tokens_out, 0),
      llm_calls: normalized.filter((step) => step.type === "model_call").length,
      tool_calls: normalized.filter((step) => step.type === "tool_call").length,
      created_at: this.metadata.started_at,
      steps: normalized
    };
    return this.client.ingest(trace);
  }
}
