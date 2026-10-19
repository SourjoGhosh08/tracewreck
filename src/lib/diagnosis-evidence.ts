import { createHash } from "node:crypto";
import type { AgentRun, TraceStep } from "@/db/schema";

export type TraceEvidenceStep = {
  step_ref: { step_id: string; occurrence: number };
  step_id: string;
  occurrence: number;
  parent_step_id: string | null;
  type: string;
  title: string;
  started_at: string;
  ended_at: string;
  input: unknown;
  output: unknown;
  tokens_in: number;
  tokens_out: number;
  latency_ms: number;
  status: string;
  notes: string | null;
};

export type TraceEvidence = {
  version: 1;
  run: {
    user_request: unknown;
    agent_name: string;
    agent_version: string;
    model: string;
    task_summary: string;
    status: string;
    started_at: string;
    ended_at: string;
  };
  steps: TraceEvidenceStep[];
  preparation: {
    input_redacted: boolean;
    input_truncated: boolean;
    omitted_content: string[];
  };
};

const OMIT_KEY = /(?:password|passphrase|secret|api[_-]?key|authorization|cookie|credential|private[_-]?key|access[_-]?token|refresh[_-]?token|session|ssn|social[_-]?security|credit[_-]?card|phone|email|address|customer[_-]?id)/i;
const OMIT_FIXTURE_KEY = /(?:fixture|demo|first[_-]?fault|annotation|ground[_-]?truth)/i;
const OMIT_ANSWER_KEY = /(?:expected|correct|reference[_-]?answer|recommended|recommendation|customer[_-]?impact|behavior[_-]?recommendation)/i;
const MAX_DEPTH = 8;
const MAX_STRING = Number(process.env.DIAGNOSIS_MAX_STRING ?? 2_000);
const MAX_STEPS = Number(process.env.DIAGNOSIS_MAX_STEPS ?? 200);
const MAX_EVIDENCE_CHARS = Number(process.env.DIAGNOSIS_MAX_CHARS ?? 240_000);

type RedactionState = { redacted: boolean; truncated: boolean; omitted: Set<string> };

function redact(value: unknown, state: RedactionState, depth = 0, key?: string): unknown {
  if (key && (OMIT_KEY.test(key) || OMIT_FIXTURE_KEY.test(key) || OMIT_ANSWER_KEY.test(key))) {
    state.redacted = true;
    state.omitted.add(OMIT_KEY.test(key) ? "credential or sensitive fields" : "fixture or precomputed answer fields");
    return "[REDACTED]";
  }
  if (depth > MAX_DEPTH) {
    state.truncated = true;
    state.omitted.add("nested content beyond configured depth");
    return "[TRUNCATED]";
  }
  if (typeof value === "string") {
    if (value.length > MAX_STRING) {
      state.truncated = true;
      state.omitted.add("long string content");
      return `${value.slice(0, MAX_STRING)}…[TRUNCATED]`;
    }
    if (/^Bearer\s+|^[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/.test(value)) {
      state.redacted = true;
      state.omitted.add("credential-like string");
      return "[REDACTED]";
    }
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      state.redacted = true;
      state.omitted.add("email-like values");
      return "[REDACTED]";
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > 100) {
      state.truncated = true;
      state.omitted.add("array items beyond configured limit");
    }
    return value.slice(0, 100).map((item) => redact(item, state, depth + 1));
  }
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [entryKey, entryValue] of Object.entries(value)) {
      if (OMIT_FIXTURE_KEY.test(entryKey) || OMIT_ANSWER_KEY.test(entryKey)) {
        state.redacted = true;
        state.omitted.add("fixture or precomputed answer fields");
        continue;
      }
      result[entryKey] = redact(entryValue, state, depth + 1, entryKey);
    }
    return result;
  }
  if (typeof value === "bigint" || typeof value === "function" || typeof value === "symbol") return null;
  return value;
}

function diagnosticNotes(value: unknown, state: RedactionState): string | null {
  const result = redact(value, state);
  if (typeof result !== "string") return null;
  const cleaned = result
    .replace(/^[A-Z][A-Z0-9_]{2,}:\s*/, "")
    .replace(/\b(?:first\s+faulty\s+step|fixture\s+annotation|demo\s+fixture)\b/gi, "[omitted]")
    .replace(/\b(?:correct\s+behavior|reviewer\s+explanation|precomputed\s+diagnosis)\b/gi, "[omitted]")
    .trim();
  if (/final\s+response\s+records/i.test(cleaned)) return null;
  return cleaned || null;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** Build model evidence from trusted database rows only. Client trace payloads are never accepted here. */
export function prepareTraceEvidence(run: AgentRun, steps: TraceStep[]): TraceEvidence {
  const state: RedactionState = { redacted: false, truncated: false, omitted: new Set() };
  const ordered = [...steps].sort((left, right) => left.startedAt.localeCompare(right.startedAt) || left.stepId.localeCompare(right.stepId) || left.id.localeCompare(right.id));
  const occurrences = new Map<string, number>();
  const prepared: TraceEvidenceStep[] = [];
  for (const step of ordered) {
    const occurrence = occurrences.get(step.stepId) ?? 0;
    occurrences.set(step.stepId, occurrence + 1);
    prepared.push({
      step_ref: { step_id: step.stepId, occurrence },
      step_id: step.stepId,
      occurrence,
      parent_step_id: step.parentStepId,
      type: step.type,
      title: step.title,
      started_at: step.startedAt,
      ended_at: step.endedAt,
      input: redact(step.inputJson, state),
      output: redact(step.outputJson, state),
      tokens_in: step.tokensIn,
      tokens_out: step.tokensOut,
      latency_ms: step.latencyMs,
      status: step.status,
      notes: diagnosticNotes(step.notes, state)
    });
  }

  let selected = prepared;
  if (prepared.length > MAX_STEPS) {
    selected = prepared.slice(0, MAX_STEPS);
    state.truncated = true;
    state.omitted.add(`${prepared.length - MAX_STEPS} trace steps beyond DIAGNOSIS_MAX_STEPS`);
  }
  const evidence: TraceEvidence = {
    version: 1,
    run: {
      user_request: redact(run.userRequest, state),
      agent_name: run.agentName,
      agent_version: run.agentVersion,
      model: run.model,
      task_summary: run.taskSummary,
      status: run.status,
      started_at: run.startedAt,
      ended_at: run.endedAt
    },
    steps: selected,
    preparation: { input_redacted: state.redacted, input_truncated: state.truncated, omitted_content: [...state.omitted].sort() }
  };
  while (JSON.stringify(evidence).length > MAX_EVIDENCE_CHARS && evidence.steps.length > 1) {
    evidence.steps.pop();
    evidence.preparation.input_truncated = true;
    if (!evidence.preparation.omitted_content.includes("steps removed to satisfy DIAGNOSIS_MAX_CHARS")) evidence.preparation.omitted_content.push("steps removed to satisfy DIAGNOSIS_MAX_CHARS");
  }
  return evidence;
}

export function fingerprintTraceEvidence(evidence: TraceEvidence): string {
  return createHash("sha256").update(stable(evidence)).digest("hex");
}
