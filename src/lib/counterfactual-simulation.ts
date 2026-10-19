import { createHash } from "node:crypto";
import type { TraceStep } from "../types/trace";
import type { EvidenceReference } from "./diagnosis-types";

/** The version is part of every result so a stored simulation can be replayed. */
export const COUNTERFACTUAL_ENGINE_VERSION = "phase4-counterfactual-v1";

export const counterfactualStatuses = ["completed", "insufficient_evidence", "not_applicable"] as const;
export type CounterfactualStatus = (typeof counterfactualStatuses)[number];

export const guardrailTypes = ["disambiguation", "confirmation", "eligibility_amount_validation", "human_approval"] as const;
export type GuardrailType = (typeof guardrailTypes)[number];

export type GuardrailConfig = {
  /** `kind` is the preferred discriminator. `type` is accepted for API callers. */
  kind?: GuardrailType;
  type?: GuardrailType;
  /** Disambiguation: minimum number of recorded candidates that makes the gate apply. */
  min_candidates?: number;
  minCandidates?: number;
  /** Eligibility/approval: optional policy threshold. If omitted, it must be recorded in the trace. */
  max_amount?: number;
  maxAmount?: number;
  amount_threshold?: number;
  amountThreshold?: number;
  threshold?: number;
  currency?: string;
};

export type CounterfactualSimulationInput = {
  steps: readonly TraceStep[];
  guardrail: GuardrailConfig;
  source_run_id?: string;
};

export type StepChangeKind = "unchanged" | "modified" | "introduced" | "not_executed_in_simulation";

export type SimulatedStep = {
  step_id: string;
  type: string;
  title: string;
  status: string;
  input?: unknown;
  output?: unknown;
  configured_assumption?: boolean;
};

export type CounterfactualStepChange = {
  step_ref: EvidenceReference;
  change: StepChangeKind;
  change_type: StepChangeKind;
  original_step: TraceStep | null;
  simulated_step: TraceStep | SimulatedStep | null;
  evidence_refs: EvidenceReference[];
  explanation: string;
};

export type CounterfactualExplanation = {
  statement: string;
  support: "observed" | "inferred" | "configured_assumption";
  support_classification: "observed" | "inferred" | "configured_assumption";
  evidence_refs: EvidenceReference[];
};

export type ProposedRegressionTest = {
  id: string;
  status: "proposed";
  execution_status: "not_executed";
  executed: false;
  scenario: string;
  expected_behavior: string;
  assertions: string[];
  proposed_assertions: string[];
};

export type CounterfactualSimulationResult = {
  schema_version: 1;
  source_run_id: string | null;
  status: CounterfactualStatus;
  source_fingerprint: string;
  engine_version: string;
  guardrail: GuardrailConfig & { kind: GuardrailType };
  assumptions: string[];
  missing_evidence: string[];
  intervention_point: {
    step_ref: EvidenceReference;
    phase: "before";
    guardrail: GuardrailType;
    reason: string;
    evidence_refs: EvidenceReference[];
  } | null;
  simulated_outcome: {
    status: "paused" | "unchanged" | "unresolved";
    summary: string;
    support: "observed" | "inferred" | "configured_assumption";
  } | null;
  step_changes: CounterfactualStepChange[];
  explanations: CounterfactualExplanation[];
  /** Explanations specifically describing divergence from the recorded path. */
  divergence_evidence: CounterfactualExplanation[];
  evidence_refs: EvidenceReference[];
  limitations: string[];
  warnings: string[];
  proposed_regression_tests: ProposedRegressionTest[];
  /** Compatibility-friendly alias for consumers that call these regression tests. */
  regression_tests: ProposedRegressionTest[];
};

export class CounterfactualConfigError extends Error {
  readonly code = "invalid_guardrail_config";

  constructor(message: string) {
    super(message);
    this.name = "CounterfactualConfigError";
  }
}

type IndexedStep = { step: TraceStep; ref: EvidenceReference; index: number };
type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clone<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => clone(item)) as T;
  if (isObject(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)])) as T;
  return value;
}

/** Canonical JSON used for fingerprints. Object key order never affects a result. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

function fingerprint(steps: readonly TraceStep[]): string {
  return createHash("sha256").update(stable(steps)).digest("hex");
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function valueAt(value: unknown, keys: readonly string[]): unknown {
  if (!isObject(value)) return undefined;
  for (const key of keys) if (value[key] !== undefined) return value[key];
  return undefined;
}

function numericAt(value: unknown, keys: readonly string[]): number | undefined {
  return numberValue(valueAt(value, keys));
}

function textAt(value: unknown, keys: readonly string[]): string | undefined {
  return stringValue(valueAt(value, keys));
}

function indexedSteps(steps: readonly TraceStep[]): IndexedStep[] {
  const occurrences = new Map<string, number>();
  return steps.map((step, index) => {
    const occurrence = occurrences.get(step.step_id) ?? 0;
    occurrences.set(step.step_id, occurrence + 1);
    return { step, index, ref: { step_id: step.step_id, occurrence } };
  });
}

function uniqueEvidenceReferences(references: readonly EvidenceReference[]): EvidenceReference[] {
  const seen = new Set<string>();
  const unique: EvidenceReference[] = [];
  for (const reference of references) {
    const key = `${reference.step_id}\u0000${reference.occurrence}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(clone(reference));
  }
  return unique;
}

function hasOnlyKnownConfigKeys(config: GuardrailConfig): boolean {
  const known = new Set([
    "kind", "type", "min_candidates", "minCandidates", "max_amount", "maxAmount",
    "amount_threshold", "amountThreshold", "threshold", "currency"
  ]);
  return Object.keys(config).every((key) => known.has(key));
}

function thresholdFromConfig(config: GuardrailConfig): number | undefined {
  return numberValue(config.max_amount ?? config.maxAmount ?? config.amount_threshold ?? config.amountThreshold ?? config.threshold);
}

/** Validate exactly one guardrail configuration without changing or normalizing the caller's object. */
export function validateGuardrailConfig(value: unknown): GuardrailConfig & { kind: GuardrailType } {
  if (Array.isArray(value)) throw new CounterfactualConfigError("Only one active guardrail is supported per simulation.");
  if (!isObject(value)) throw new CounterfactualConfigError("A single guardrail configuration is required.");
  const config = value as GuardrailConfig;
  if (!hasOnlyKnownConfigKeys(config)) throw new CounterfactualConfigError("Guardrail config contains an unknown field.");
  const kind = config.kind ?? config.type;
  if (!kind || !guardrailTypes.includes(kind)) throw new CounterfactualConfigError("Guardrail config must name one supported guardrail.");
  if (config.kind && config.type && config.kind !== config.type) throw new CounterfactualConfigError("Guardrail kind and type must agree.");
  if (config.currency !== undefined && (typeof config.currency !== "string" || !/^[A-Z]{3}$/.test(config.currency))) {
    throw new CounterfactualConfigError("currency must be a three-letter uppercase code.");
  }
  const minCandidates = config.min_candidates ?? config.minCandidates;
  if (minCandidates !== undefined && (!Number.isInteger(minCandidates) || minCandidates < 2)) {
    throw new CounterfactualConfigError("min_candidates must be an integer of at least 2.");
  }
  for (const threshold of [config.max_amount, config.maxAmount, config.amount_threshold, config.amountThreshold, config.threshold]) {
    if (threshold !== undefined && (typeof threshold !== "number" || !Number.isFinite(threshold) || threshold < 0)) {
      throw new CounterfactualConfigError("amount thresholds must be finite, non-negative numbers.");
    }
  }
  const amountKeys = ["max_amount", "maxAmount", "amount_threshold", "amountThreshold", "threshold"] as const;
  const suppliedThresholds = amountKeys.map((key) => config[key]).filter((item) => item !== undefined) as number[];
  if (new Set(suppliedThresholds).size > 1) throw new CounterfactualConfigError("Amount threshold aliases must not disagree.");
  if (kind === "disambiguation" && suppliedThresholds.length > 0) throw new CounterfactualConfigError("disambiguation does not accept an amount threshold.");
  if ((kind === "confirmation" || kind === "disambiguation") && (config.currency !== undefined || minCandidates !== undefined && kind === "confirmation")) {
    throw new CounterfactualConfigError(`${kind} does not accept that option.`);
  }
  return { ...clone(config), kind };
}

export const validateCounterfactualGuardrail = validateGuardrailConfig;

function output(step: TraceStep): unknown {
  return step.output;
}

function input(step: TraceStep): unknown {
  return step.input;
}

function arraysFromStep(step: TraceStep): unknown[][] {
  const found: unknown[][] = [];
  for (const source of [output(step), input(step)]) {
    if (!isObject(source)) continue;
    for (const key of ["matches", "orders", "candidates", "matchingOrders", "matching_orders"]) {
      if (Array.isArray(source[key])) found.push(source[key] as unknown[]);
    }
  }
  return found;
}

function candidateEvidence(indexed: IndexedStep[]): { item: IndexedStep; candidates: unknown[] } | null {
  for (const item of indexed) {
    const candidates = arraysFromStep(item.step).find((values) => values.length > 0);
    if (candidates) return { item, candidates };
  }
  return null;
}

function isRefundStep(step: TraceStep): boolean {
  if (step.type !== "tool_call") return false;
  const tool = `${textAt(input(step), ["tool", "name"]) ?? ""} ${step.title}`.toLowerCase();
  return /refund|payment/.test(tool) && numericAt(input(step), ["amount", "refundAmount", "refund_amount", "value"]) !== undefined;
}

function refundStep(indexed: IndexedStep[]): IndexedStep | null {
  return indexed.find(({ step }) => isRefundStep(step)) ?? null;
}

function amountInfo(step: TraceStep): { amount?: number; currency?: string } {
  const amount = numericAt(input(step), ["amount", "refundAmount", "refund_amount", "value"]) ?? numericAt(output(step), ["amount", "refundAmount"]);
  const currency = textAt(input(step), ["currency", "currencyCode", "currency_code"]) ?? textAt(output(step), ["currency", "currencyCode"]);
  return { amount, currency };
}

function recordedThreshold(indexed: IndexedStep[]): { threshold: number; ref: EvidenceReference } | null {
  const keys = ["maxAmount", "max_amount", "amountThreshold", "amount_threshold", "refundThreshold", "refund_threshold", "threshold"];
  for (const item of indexed) {
    const threshold = numericAt(output(item.step), keys) ?? numericAt(input(item.step), keys);
    if (threshold !== undefined) return { threshold, ref: item.ref };
  }
  return null;
}

function hasCustomerConfirmation(indexed: IndexedStep[]): IndexedStep | null {
  const confirmationKeys = ["customerConfirmed", "customer_confirmed", "confirmedOrder", "confirmed_order", "confirmationReceived", "confirmation_received", "confirmed", "confirmation"];
  for (const item of indexed) {
    if (item.step.type === "tool_call" && /email|message|notification/.test(`${textAt(input(item.step), ["tool", "name"]) ?? ""}`.toLowerCase())) continue;
    const value = valueAt(output(item.step), confirmationKeys) ?? valueAt(input(item.step), confirmationKeys);
    if (value === true || typeof value === "string" && value.trim().length > 0) return item;
    if (item.step.type === "human_approval" && /confirm/i.test(item.step.title) && item.step.status === "completed") return item;
  }
  return null;
}

function approvalRecord(indexed: IndexedStep[]): { item: IndexedStep; state: "approved" | "denied" | "pending" } | null {
  for (const item of indexed) {
    if (item.step.type !== "human_approval") continue;
    const state = (textAt(output(item.step), ["status", "decision"]) ?? textAt(input(item.step), ["status", "decision"]) ?? item.step.status).toLowerCase();
    return { item, state: /approve|allow|success|completed/.test(state) ? "approved" : /deny|reject|fail/.test(state) ? "denied" : "pending" };
  }
  return null;
}

function descendantEnd(indexed: IndexedStep[], start: number): number {
  // Trace order is the recorded execution order. A guardrail stops the side-effect
  // branch; later records are therefore conservatively marked as not simulated.
  return indexed.length > start ? indexed.length : start + 1;
}

function introducedStep(fingerprintValue: string, kind: GuardrailType, title: string, result: unknown, configured = false): SimulatedStep {
  return { step_id: `counterfactual:${fingerprintValue.slice(0, 16)}:${kind}`, type: "policy_check", title, status: "pending", output: clone(result), configured_assumption: configured };
}

function unchangedChange(item: IndexedStep): CounterfactualStepChange {
  return { step_ref: clone(item.ref), change: "unchanged", change_type: "unchanged", original_step: clone(item.step), simulated_step: clone(item.step), evidence_refs: [clone(item.ref)], explanation: "The recorded step remains in the simulated path." };
}

function regression(kind: GuardrailType, applicable: boolean): ProposedRegressionTest[] {
  const test: ProposedRegressionTest = kind === "disambiguation" ? {
    id: "counterfactual-disambiguation", status: "proposed", execution_status: "not_executed", executed: false,
    scenario: "Multiple recorded orders match the requested item.", expected_behavior: "Ask for an explicit order confirmation before a refund side effect.",
    assertions: ["The guardrail is evaluated before the refund tool call.", "No refund is executed while order identity is unresolved."],
    proposed_assertions: ["The guardrail is evaluated before the refund tool call.", "No refund is executed while order identity is unresolved."]
  } : kind === "confirmation" ? {
    id: "counterfactual-confirmation", status: "proposed", execution_status: "not_executed", executed: false,
    scenario: "A refund side effect is reached without recorded customer confirmation.", expected_behavior: "Pause for confirmation and do not execute the refund yet.",
    assertions: ["Confirmation is required immediately before the side effect.", "The refund remains unexecuted pending confirmation."],
    proposed_assertions: ["Confirmation is required immediately before the side effect.", "The refund remains unexecuted pending confirmation."]
  } : kind === "eligibility_amount_validation" ? {
    id: "counterfactual-eligibility-amount", status: "proposed", execution_status: "not_executed", executed: false,
    scenario: "A refund amount is compared with a recorded or configured eligibility threshold.", expected_behavior: "Reject or route the refund when the amount exceeds the threshold.",
    assertions: ["The amount and currency are compared before the payment tool call.", "No unsupported policy threshold is inferred."],
    proposed_assertions: ["The amount and currency are compared before the payment tool call.", "No unsupported policy threshold is inferred."]
  } : {
    id: "counterfactual-human-approval", status: "proposed", execution_status: "not_executed", executed: false,
    scenario: "A refund exceeds the human-approval threshold.", expected_behavior: "Place the refund in pending approval before execution.",
    assertions: ["Approval is required before the payment tool call.", "The side effect remains unexecuted while approval is pending."],
    proposed_assertions: ["Approval is required before the payment tool call.", "The side effect remains unexecuted while approval is pending."]
  };
  return applicable ? [test] : [];
}

function baseResult(steps: readonly TraceStep[], config: GuardrailConfig & { kind: GuardrailType }, sourceRunId: string | undefined): CounterfactualSimulationResult {
  const sourceFingerprint = fingerprint(steps);
  const changes = indexedSteps(steps).map(unchangedChange);
  const tests = regression(config.kind, true);
  return {
    schema_version: 1, source_run_id: sourceRunId ?? null, status: "not_applicable", source_fingerprint: sourceFingerprint, engine_version: COUNTERFACTUAL_ENGINE_VERSION,
    guardrail: clone(config), assumptions: [], missing_evidence: [], intervention_point: null, simulated_outcome: null, step_changes: changes,
    explanations: [], divergence_evidence: [], evidence_refs: [], limitations: ["This deterministic simulation compares recorded trace data; it does not execute tools or establish causal proof."],
    warnings: [], proposed_regression_tests: tests, regression_tests: tests
  };
}

function applyIntervention(
  result: CounterfactualSimulationResult,
  indexed: IndexedStep[],
  interventionIndex: number,
  kind: GuardrailType,
  reason: string,
  refs: EvidenceReference[],
  introduced: SimulatedStep,
  modified: SimulatedStep,
  status: CounterfactualStatus,
  missing: string[],
  assumptions: string[],
  warning: string,
  explanation: CounterfactualExplanation
): CounterfactualSimulationResult {
  result.status = status;
  for (const assumption of assumptions) if (!result.assumptions.includes(assumption)) result.assumptions.push(assumption);
  for (const missingItem of missing) if (!result.missing_evidence.includes(missingItem)) result.missing_evidence.push(missingItem);
  if (!result.warnings.includes(warning)) result.warnings.push(warning);
  result.intervention_point = { step_ref: clone(indexed[interventionIndex].ref), phase: "before", guardrail: kind, reason, evidence_refs: clone(refs) };
  result.simulated_outcome = { status: "paused", summary: reason, support: "inferred" };
  result.evidence_refs = uniqueEvidenceReferences([...refs, indexed[interventionIndex].ref]);
  result.explanations.push(explanation);
  result.step_changes.splice(interventionIndex, 0, {
    step_ref: { step_id: introduced.step_id, occurrence: 0 }, change: "introduced", change_type: "introduced", original_step: null,
    simulated_step: clone(introduced), evidence_refs: clone(refs), explanation: `The ${kind} guardrail is introduced before the recorded intervention point.`
  });
  const originalChange = result.step_changes[interventionIndex + 1];
  originalChange.change = "modified";
  originalChange.change_type = "modified";
  originalChange.simulated_step = clone(modified);
  originalChange.evidence_refs = clone(refs);
  originalChange.explanation = reason;
  for (let i = interventionIndex + 1; i < indexed.length; i += 1) {
    const change = result.step_changes[i + 1];
    if (!change) continue;
    if (i === interventionIndex) continue;
    change.change = "not_executed_in_simulation";
    change.change_type = "not_executed_in_simulation";
    change.simulated_step = null;
    change.evidence_refs = clone(refs);
    change.explanation = "The simulated guardrail pauses the path before this recorded downstream step.";
  }
  result.proposed_regression_tests = regression(kind, true);
  result.regression_tests = result.proposed_regression_tests;
  return result;
}

function simulateSingle(inputValue: CounterfactualSimulationInput): CounterfactualSimulationResult {
  const config = validateGuardrailConfig(inputValue.guardrail);
  const steps = inputValue.steps;
  if (!Array.isArray(steps) || steps.some((step) => !isObject(step) || typeof step.step_id !== "string")) throw new CounterfactualConfigError("steps must be an array of TraceStep values.");
  const indexed = indexedSteps(steps);
  const result = baseResult(steps, config, inputValue.source_run_id);
  const refund = refundStep(indexed);

  if (config.kind === "disambiguation") {
    const candidates = candidateEvidence(indexed);
    const minimum = config.min_candidates ?? config.minCandidates ?? 2;
    if (!candidates || candidates.candidates.length < minimum) {
      result.explanations.push({ statement: "No recorded candidate set reaches the configured ambiguity threshold.", support: "observed", support_classification: "observed", evidence_refs: candidates ? [candidates.item.ref] : [] });
      result.limitations.push("A similar-sounding title or request is not treated as proof that multiple records matched.");
      return result;
    }
    const selection = indexed.find(({ step, index }) => index > candidates.item.index && (/select.*order|selectedOrder/i.test(step.title) || textAt(output(step), ["selectedOrder", "selected_order"]) !== undefined));
    if (!selection) {
      result.status = "insufficient_evidence";
      result.missing_evidence.push("A recorded order-selection step after the ambiguous candidate set is not available.");
      result.explanations.push({ statement: "Multiple matching records were observed, but the trace does not identify the selection point.", support: "observed", support_classification: "observed", evidence_refs: [candidates.item.ref] });
      return result;
    }
    const refs = [candidates.item.ref, selection.ref];
    const confirmation = hasCustomerConfirmation(indexed.slice(0, selection.index));
    const missing = confirmation ? [] : ["No recorded customer confirmation identifies which matching order is intended."];
    const assumptions = ["The guardrail pauses on the recorded ambiguity without selecting an order on the customer's behalf."];
    return applyIntervention(result, indexed, selection.index, config.kind, "Ambiguous recorded candidate set requires explicit order confirmation.", refs,
      introducedStep(result.source_fingerprint, config.kind, "Require order disambiguation", { state: "awaiting_customer_confirmation", candidate_count: candidates.candidates.length }),
      { ...clone(selection.step), status: "skipped", output: { state: "awaiting_customer_confirmation", candidate_count: candidates.candidates.length } },
      "completed", missing, assumptions,
      missing.length ? "No prevention claim is made: the trace records no confirmation, but that does not prove the customer did not confirm outside the trace." : "The recorded confirmation evidence is retained; this replay does not fabricate an order choice.",
      { statement: `The trace records ${candidates.candidates.length} matching candidates before order selection.`, support: "observed", support_classification: "observed", evidence_refs: refs });
  }

  if (!refund) {
    result.explanations.push({ statement: "No refund side-effect step with a recorded numeric amount was found.", support: "observed", support_classification: "observed", evidence_refs: [] });
    result.limitations.push("The guardrail cannot be evaluated without a recorded refund side effect.");
    return result;
  }
  const amount = amountInfo(refund.step);
  const confirmation = hasCustomerConfirmation(indexed.slice(0, refund.index));
  const refs = [refund.ref];

  if (config.kind === "confirmation") {
    if (confirmation) {
      result.status = "completed";
      result.evidence_refs = [confirmation.ref, refund.ref];
      result.explanations.push({ statement: "A recorded customer confirmation precedes the refund side effect.", support: "observed", support_classification: "observed", evidence_refs: [confirmation.ref, refund.ref] });
      return result;
    }
    result.status = "insufficient_evidence";
    result.missing_evidence.push("No recorded customer confirmation precedes the refund side effect.");
    result.assumptions.push("The simulation treats the missing trace record as unknown rather than as proof that confirmation did not occur.");
    result.evidence_refs = [refund.ref];
    result.explanations.push({ statement: "The trace records a refund side effect but does not record customer confirmation before it.", support: "observed", support_classification: "observed", evidence_refs: [refund.ref] });
    result.warnings.push("A missing confirmation record cannot support an unconditional claim that the guardrail would have prevented the refund.");
    return applyIntervention(result, indexed, refund.index, config.kind, "Confirmation evidence is unresolved before the refund side effect.", refs,
      introducedStep(result.source_fingerprint, config.kind, "Require customer confirmation", { state: "awaiting_customer_confirmation" }),
      { ...clone(refund.step), status: "skipped", output: { state: "awaiting_customer_confirmation" } }, "insufficient_evidence", result.missing_evidence.slice(), result.assumptions.slice(),
      "The simulation pauses conservatively; it does not assert that unrecorded confirmation was absent.",
      { statement: "A confirmation gate would be placed before the refund, but the trace alone cannot resolve whether confirmation occurred elsewhere.", support: "inferred", support_classification: "inferred", evidence_refs: refs });
  }

  const configuredThreshold = thresholdFromConfig(config);
  const recorded = recordedThreshold(indexed.slice(0, refund.index));
  const threshold = configuredThreshold ?? recorded?.threshold;
  const thresholdRef = configuredThreshold === undefined ? recorded?.ref : undefined;
  if (threshold === undefined) {
    result.status = "insufficient_evidence";
    result.missing_evidence.push("No policy amount threshold is recorded or configured for this guardrail.");
    result.explanations.push({ statement: "The refund amount is recorded, but the policy threshold needed for comparison is missing.", support: "observed", support_classification: "observed", evidence_refs: [refund.ref] });
    result.warnings.push("No eligibility or approval outcome is inferred without a threshold.");
    return result;
  }
  if (amount.amount === undefined) {
    result.status = "insufficient_evidence";
    result.missing_evidence.push("The refund step does not record a numeric amount.");
    return result;
  }
  if (config.currency && amount.currency && config.currency !== amount.currency) {
    result.status = "insufficient_evidence";
    result.missing_evidence.push(`Configured currency ${config.currency} does not match recorded currency ${amount.currency}.`);
    result.warnings.push("Currency mismatch prevents a deterministic amount comparison.");
    return result;
  }
  const exceeds = amount.amount > threshold;
  const observedOrConfigured = thresholdRef ? "observed" : "configured_assumption";
  result.evidence_refs = thresholdRef ? [refund.ref, thresholdRef] : [refund.ref];
  result.explanations.push({ statement: `The recorded refund amount ${amount.amount} is ${exceeds ? "above" : "at or below"} the threshold ${threshold}.`, support: observedOrConfigured, support_classification: observedOrConfigured, evidence_refs: result.evidence_refs });
  if (!exceeds) {
    result.status = "completed";
    result.assumptions.push(...(thresholdRef ? [] : ["The supplied threshold is a configured simulation assumption."]));
    return result;
  }
  const kind = config.kind;
  const missing = kind === "human_approval" && !approvalRecord(indexed.slice(0, refund.index)) ? ["No recorded human approval precedes the above-threshold refund."] : [];
  const approval = kind === "human_approval" ? approvalRecord(indexed.slice(0, refund.index)) : null;
  if (kind === "human_approval" && approval?.state === "approved") {
    result.status = "completed";
    result.evidence_refs.push(approval.item.ref);
    result.explanations.push({ statement: "A recorded approval precedes the above-threshold refund.", support: "observed", support_classification: "observed", evidence_refs: [approval.item.ref, refund.ref] });
    return result;
  }
  const assumptions = thresholdRef ? [] : ["The supplied approval/eligibility threshold is a configured simulation assumption."];
  const reason = kind === "human_approval" ? "The refund exceeds the approval threshold and remains pending approval." : "The refund exceeds the eligibility amount threshold.";
  const pending = kind === "human_approval";
  return applyIntervention(result, indexed, refund.index, kind, reason, thresholdRef ? [refund.ref, thresholdRef] : [refund.ref],
    introducedStep(result.source_fingerprint, kind, pending ? "Request human approval" : "Validate refund eligibility amount", pending ? { state: "pending_approval", amount: amount.amount, threshold } : { eligible: false, amount: amount.amount, threshold }, !thresholdRef),
    { ...clone(refund.step), status: "skipped", output: pending ? { state: "pending_approval", amount: amount.amount, threshold } : { eligible: false, amount: amount.amount, threshold } },
    "completed", missing, assumptions,
    pending ? (missing.length ? "Approval is pending because no approval record precedes the side effect." : "The simulation models the approval gate; it does not submit an approval request.") : "The simulation compares only recorded/configured amounts and does not infer an unrecorded policy.",
    { statement: pending ? "The refund exceeds the approval threshold, so the simulated path waits for human approval." : "The refund exceeds the configured or recorded eligibility threshold, so the simulated path stops before the side effect.", support: "inferred", support_classification: "inferred", evidence_refs: thresholdRef ? [refund.ref, thresholdRef] : [refund.ref] });
}

/** Pure deterministic simulation. The overload accepts the compact (steps, guardrail) form too. */
export function simulateCounterfactual(input: CounterfactualSimulationInput): CounterfactualSimulationResult;
export function simulateCounterfactual(steps: readonly TraceStep[], guardrail: GuardrailConfig): CounterfactualSimulationResult;
export function simulateCounterfactual(inputOrSteps: CounterfactualSimulationInput | readonly TraceStep[], maybeGuardrail?: GuardrailConfig): CounterfactualSimulationResult {
  const finalize = (result: CounterfactualSimulationResult) => {
    if (!result.simulated_outcome) {
      result.simulated_outcome = result.status === "completed"
        ? { status: "unchanged", summary: "The selected guardrail produced no supported intervention; the recorded path remains unchanged.", support: "observed" }
        : { status: "unresolved", summary: "The trace or configuration does not support a deterministic simulated outcome.", support: "observed" };
    }
    result.divergence_evidence = result.explanations.map(clone);
    return result;
  };
  if (Array.isArray(inputOrSteps)) {
    if (!maybeGuardrail) throw new CounterfactualConfigError("A single guardrail configuration is required.");
    return finalize(simulateSingle({ steps: inputOrSteps, guardrail: maybeGuardrail }));
  }
  const inputValue = inputOrSteps as CounterfactualSimulationInput;
  if (!inputValue || !inputValue.guardrail) throw new CounterfactualConfigError("A single guardrail configuration is required.");
  return finalize(simulateSingle(inputValue));
}

export const runCounterfactualSimulation = simulateCounterfactual;
export const simulate = simulateCounterfactual;
export const fingerprintCounterfactualSource = fingerprint;
export const counterfactualSourceFingerprint = fingerprint;
