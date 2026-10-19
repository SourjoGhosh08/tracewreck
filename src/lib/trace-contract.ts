import { runStatuses, traceStepStatuses, traceStepTypes, type RunStatus, type TraceStepStatus, type TraceStepType } from "@/db/schema";

/** The largest request accepted by the trace import endpoint. */
export const TRACE_IMPORT_MAX_BYTES = 2_000_000;
export const TRACE_IMPORT_MAX_STEPS = 1_000;
export const TRACE_IMPORT_MAX_STRING_LENGTH = 20_000;
export const TRACE_IMPORT_MAX_JSON_VALUE_BYTES = 250_000;

export interface NormalizedTraceInputStep {
  step_id: string;
  parent_step_id: string | null;
  type: TraceStepType;
  title: string;
  started_at: string;
  ended_at: string;
  input: unknown;
  output: unknown;
  tokens_in: number;
  tokens_out: number;
  latency_ms: number;
  status: TraceStepStatus;
  risk_score: number | null;
  notes: string | null;
}

export interface NormalizedTraceInput {
  id: string;
  agent_name: string;
  agent_version: string;
  model: string;
  task_summary: string;
  user_request: unknown;
  status: RunStatus;
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
  steps: NormalizedTraceInputStep[];
}

export interface TraceValidationIssue {
  path: string;
  message: string;
}

export type TraceValidationResult =
  | { success: true; value: NormalizedTraceInput }
  | { success: false; issues: TraceValidationIssue[] };

export type TraceInput = NormalizedTraceInput;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function valueAt(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) if (key in record) return record[key];
  return undefined;
}

function jsonByteLength(value: unknown) {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function stringField(value: unknown, path: string, issues: TraceValidationIssue[], options: { allowEmpty?: boolean } = {}) {
  if (typeof value !== "string" || (!options.allowEmpty && value.trim().length === 0)) {
    issues.push({ path, message: "must be a non-empty string" });
    return "";
  }
  if (value.length > TRACE_IMPORT_MAX_STRING_LENGTH) issues.push({ path, message: `must be at most ${TRACE_IMPORT_MAX_STRING_LENGTH} characters` });
  return value;
}

function nullableStringField(value: unknown, path: string, issues: TraceValidationIssue[]) {
  if (value === null || value === undefined) return null;
  return stringField(value, path, issues);
}

function timestampField(value: unknown, path: string, issues: TraceValidationIssue[]) {
  const timestamp = stringField(value, path, issues);
  if (timestamp && !Number.isFinite(Date.parse(timestamp))) issues.push({ path, message: "must be a valid timestamp" });
  return timestamp;
}

function integerField(value: unknown, path: string, issues: TraceValidationIssue[], max = 1_000_000_000) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > max) {
    issues.push({ path, message: `must be an integer between 0 and ${max}` });
    return 0;
  }
  return value;
}

function jsonField(value: unknown, path: string, issues: TraceValidationIssue[]) {
  if (value === undefined) {
    issues.push({ path, message: "is required" });
    return null;
  }
  if (jsonByteLength(value) > TRACE_IMPORT_MAX_JSON_VALUE_BYTES) issues.push({ path, message: `must be at most ${TRACE_IMPORT_MAX_JSON_VALUE_BYTES} bytes when serialized` });
  return value;
}

function enumField<T extends readonly string[]>(value: unknown, path: string, allowed: T, issues: TraceValidationIssue[]) {
  if (typeof value !== "string" || !allowed.includes(value)) {
    issues.push({ path, message: `must be one of: ${allowed.join(", ")}` });
    return allowed[0];
  }
  return value as T[number];
}

/**
 * Validate and normalize the JSON accepted by POST /api/runs.
 *
 * The canonical input uses the same snake_case fields returned by the API.
 * A nested `run` object and the existing camelCase aliases are accepted so a
 * caller can round-trip a GET response without writing an adapter.
 */
export function validateNormalizedTraceInput(payload: unknown): TraceValidationResult {
  if (!isRecord(payload)) return { success: false, issues: [{ path: "$", message: "must be a JSON object" }] };
  if (jsonByteLength(payload) > TRACE_IMPORT_MAX_BYTES) return { success: false, issues: [{ path: "$", message: `request must be at most ${TRACE_IMPORT_MAX_BYTES} bytes when serialized` }] };

  const root = isRecord(payload.run) ? { ...payload.run, steps: payload.steps ?? payload.run.steps } : payload;
  const issues: TraceValidationIssue[] = [];
  const id = stringField(valueAt(root, "id", "run_id"), "id", issues);
  const nestedAgent = isRecord(root.agent) ? root.agent : undefined;
  const agentName = stringField(valueAt(root, "agent_name", "agentName") ?? nestedAgent?.name, "agent_name", issues);
  const agentVersion = stringField(valueAt(root, "agent_version", "agentVersion") ?? nestedAgent?.version, "agent_version", issues);
  const model = stringField(valueAt(root, "model"), "model", issues);
  const taskSummary = stringField(valueAt(root, "task_summary", "taskSummary"), "task_summary", issues);
  const userRequest = jsonField(valueAt(root, "user_request", "userRequest", "input"), "user_request", issues);
  const status = enumField(valueAt(root, "status"), "status", runStatuses, issues) as RunStatus;
  const finalOutcome = jsonField(valueAt(root, "final_outcome", "finalOutcome", "output"), "final_outcome", issues);
  const failureClass = nullableStringField(valueAt(root, "failure_class", "failureClass"), "failure_class", issues);
  const startedAt = timestampField(valueAt(root, "started_at", "startedAt"), "started_at", issues);
  const endedAt = timestampField(valueAt(root, "ended_at", "endedAt", "completedAt"), "ended_at", issues);
  const durationMs = integerField(valueAt(root, "duration_ms", "durationMs"), "duration_ms", issues, 86_400_000 * 365);
  const totalTokensIn = integerField(valueAt(root, "total_tokens_in", "promptTokens"), "total_tokens_in", issues);
  const totalTokensOut = integerField(valueAt(root, "total_tokens_out", "completionTokens"), "total_tokens_out", issues);
  const llmCalls = integerField(valueAt(root, "llm_calls"), "llm_calls", issues, 10_000_000);
  const toolCalls = integerField(valueAt(root, "tool_calls"), "tool_calls", issues, 10_000_000);
  const createdAt = timestampField(valueAt(root, "created_at", "createdAt"), "created_at", issues);
  const rawSteps = valueAt(root, "steps", "events");

  if (!Array.isArray(rawSteps)) {
    issues.push({ path: "steps", message: "must be an array" });
  } else if (rawSteps.length > TRACE_IMPORT_MAX_STEPS) {
    issues.push({ path: "steps", message: `must contain at most ${TRACE_IMPORT_MAX_STEPS} steps` });
  }

  const steps: NormalizedTraceInputStep[] = [];
  const stepIds = new Set<string>();
  for (const [index, rawStep] of (Array.isArray(rawSteps) ? rawSteps : []).entries()) {
    const path = `steps[${index}]`;
    if (!isRecord(rawStep)) {
      issues.push({ path, message: "must be a JSON object" });
      continue;
    }
    const stepId = stringField(valueAt(rawStep, "step_id", "stepId", "id"), `${path}.step_id`, issues);
    if (stepIds.has(stepId)) issues.push({ path: `${path}.step_id`, message: `duplicates step_id ${stepId}` });
    stepIds.add(stepId);
    const parentValue = valueAt(rawStep, "parent_step_id", "parentStepId");
    const parentStepId = parentValue === undefined || parentValue === null ? null : stringField(parentValue, `${path}.parent_step_id`, issues);
    const type = enumField(valueAt(rawStep, "type"), `${path}.type`, traceStepTypes, issues) as TraceStepType;
    const title = stringField(valueAt(rawStep, "title", "name"), `${path}.title`, issues);
    const stepStartedAt = timestampField(valueAt(rawStep, "started_at", "startedAt"), `${path}.started_at`, issues);
    const stepEndedAt = timestampField(valueAt(rawStep, "ended_at", "endedAt", "completedAt"), `${path}.ended_at`, issues);
    const input = jsonField(valueAt(rawStep, "input"), `${path}.input`, issues);
    const output = jsonField(valueAt(rawStep, "output"), `${path}.output`, issues);
    const tokensIn = integerField(valueAt(rawStep, "tokens_in"), `${path}.tokens_in`, issues);
    const tokensOut = integerField(valueAt(rawStep, "tokens_out"), `${path}.tokens_out`, issues);
    const latencyMs = integerField(valueAt(rawStep, "latency_ms", "durationMs"), `${path}.latency_ms`, issues, 86_400_000 * 365);
    const stepStatus = enumField(valueAt(rawStep, "status"), `${path}.status`, traceStepStatuses, issues) as TraceStepStatus;
    const riskValue = valueAt(rawStep, "risk_score", "riskScore");
    const riskScore = riskValue === undefined || riskValue === null ? null : typeof riskValue === "number" && Number.isFinite(riskValue) && riskValue >= 0 && riskValue <= 1 ? riskValue : null;
    if (riskValue !== undefined && riskValue !== null && riskScore === null) issues.push({ path: `${path}.risk_score`, message: "must be a number between 0 and 1 or null" });
    const notesValue = valueAt(rawStep, "notes");
    const notes = notesValue === undefined || notesValue === null ? null : stringField(notesValue, `${path}.notes`, issues);
    steps.push({ step_id: stepId, parent_step_id: parentStepId, type, title, started_at: stepStartedAt, ended_at: stepEndedAt, input, output, tokens_in: tokensIn, tokens_out: tokensOut, latency_ms: latencyMs, status: stepStatus, risk_score: riskScore, notes });
  }

  for (const [index, step] of steps.entries()) {
    if (step.parent_step_id !== null && !stepIds.has(step.parent_step_id)) issues.push({ path: `steps[${index}].parent_step_id`, message: `references unknown step_id ${step.parent_step_id}` });
    if (step.parent_step_id === step.step_id) issues.push({ path: `steps[${index}].parent_step_id`, message: "cannot reference itself" });
    if (step.started_at && step.ended_at && Date.parse(step.ended_at) < Date.parse(step.started_at)) issues.push({ path: `steps[${index}].ended_at`, message: "must be at or after started_at" });
  }
  if (startedAt && endedAt && Date.parse(endedAt) < Date.parse(startedAt)) issues.push({ path: "ended_at", message: "must be at or after started_at" });

  if (issues.length) return { success: false, issues };
  return { success: true, value: { id, agent_name: agentName, agent_version: agentVersion, model, task_summary: taskSummary, user_request: userRequest, status, final_outcome: finalOutcome, failure_class: failureClass, started_at: startedAt, ended_at: endedAt, duration_ms: durationMs, total_tokens_in: totalTokensIn, total_tokens_out: totalTokensOut, llm_calls: llmCalls, tool_calls: toolCalls, created_at: createdAt, steps } };
}

export const validateTraceInput = validateNormalizedTraceInput;
