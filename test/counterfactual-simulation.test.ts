import assert from "node:assert/strict";
import { test } from "node:test";
import type { TraceStep } from "../src/types/trace";
import { CounterfactualConfigError, simulateCounterfactual, validateGuardrailConfig } from "../src/lib/counterfactual-simulation";

function step(id: string, type: TraceStep["type"], title: string, input: unknown = {}, output: unknown = {}, status: TraceStep["status"] = "ok"): TraceStep {
  return {
    step_id: id, parent_step_id: null, type, title, started_at: "2025-02-14T09:42:11.000Z", ended_at: "2025-02-14T09:42:12.000Z",
    input, output, tokens_in: 1, tokens_out: 1, latency_ms: 1, status, risk_score: null, notes: null, is_first_faulty_step: false,
    id, runId: "run-test", stepIndex: 0, name: title, startedAt: "2025-02-14T09:42:11.000Z", completedAt: "2025-02-14T09:42:12.000Z", durationMs: 1, isFirstFaultyStep: false
  };
}

function failedRefundFixture(): TraceStep[] {
  return [
    step("orders", "tool_result", "Two similar orders found", {}, { matches: [
      { orderNumber: "847291", product: "NoiseCancel X2 Headphones", orderedAt: "2025-02-10", amount: 89.99, status: "delivered" },
      { orderNumber: "847219", product: "NoiseCancel X2 Headphones", orderedAt: "2025-02-08", amount: 79.99, status: "delivered" }
    ] }),
    step("select", "model_call", "Select order to refund", { candidates: ["847291", "847219"] }, { selectedOrder: "847219", selectionReason: "most recent matching item", expectedOrder: "847291" }, "error"),
    step("refund", "tool_call", "Issue incorrect refund", { tool: "payments.createRefund", orderNumber: "847219", amount: 12, currency: "USD" }, { refundId: "ref_55022", amount: 12, status: "succeeded" }, "error"),
    step("email", "tool_call", "Send incorrect confirmation email", { tool: "email.send", orderNumber: "847219", refundAmount: 12 }, { delivered: true }, "error")
  ];
}

test("failed refund fixture disambiguation is deterministic and does not mutate input", () => {
  const input = failedRefundFixture();
  const before = structuredClone(input);
  const first = simulateCounterfactual({ steps: input, source_run_id: "run_support_refund_damaged_headphones_failed", guardrail: { kind: "disambiguation" } });
  const second = simulateCounterfactual({ steps: input, source_run_id: "run_support_refund_damaged_headphones_failed", guardrail: { kind: "disambiguation" } });
  assert.deepEqual(first, second);
  assert.deepEqual(input, before);
  assert.equal(first.status, "completed");
  assert.equal(first.source_run_id, "run_support_refund_damaged_headphones_failed");
  assert.equal(first.intervention_point?.step_ref.step_id, "select");
  assert.equal(first.intervention_point?.step_ref.occurrence, 0);
  assert.equal(first.step_changes.find((change) => change.step_ref.step_id === "refund")?.change, "not_executed_in_simulation");
  assert.equal(first.step_changes.some((change) => change.change === "introduced"), true);
  assert.deepEqual(first.evidence_refs, [
    { step_id: "orders", occurrence: 0 },
    { step_id: "select", occurrence: 0 }
  ]);
});

test("disambiguation requires a structured multi-order candidate set, not similar wording alone", () => {
  const onlyOne = [step("orders", "tool_result", "Two similar orders found", {}, { matches: [{ orderNumber: "847219" }] }), ...failedRefundFixture().slice(1)];
  const result = simulateCounterfactual(onlyOne, { type: "disambiguation" });
  assert.equal(result.status, "not_applicable");
  assert.equal(result.intervention_point, null);
});

test("missing confirmation is represented as uncertainty and makes no unsupported prevention claim", () => {
  const result = simulateCounterfactual(failedRefundFixture(), { kind: "confirmation" });
  assert.equal(result.status, "insufficient_evidence");
  assert.match(result.missing_evidence[0], /confirmation/i);
  assert.match(result.warnings.join(" "), /cannot support an unconditional claim/i);
  assert.equal(result.step_changes.find((change) => change.step_ref.step_id === "refund")?.change, "modified");
  assert.equal(result.proposed_regression_tests[0].status, "proposed");
  assert.equal(result.proposed_regression_tests[0].executed, false);
});

test("eligibility and approval need a threshold rather than inventing policy", () => {
  const refund = failedRefundFixture().slice(2, 3);
  const eligibility = simulateCounterfactual(refund, { kind: "eligibility_amount_validation" });
  const approval = simulateCounterfactual(refund, { kind: "human_approval" });
  assert.equal(eligibility.status, "insufficient_evidence");
  assert.equal(approval.status, "insufficient_evidence");
  assert.match(eligibility.missing_evidence[0], /threshold/i);
  assert.match(approval.missing_evidence[0], /threshold/i);
});

test("above-threshold comparison introduces an approval gate and reports pending approval", () => {
  const result = simulateCounterfactual(failedRefundFixture().slice(2), { kind: "human_approval", amount_threshold: 10, currency: "USD" });
  assert.equal(result.status, "completed");
  assert.equal(result.intervention_point?.guardrail, "human_approval");
  assert.equal(result.step_changes.find((change) => change.change === "introduced")?.simulated_step?.title, "Request human approval");
  assert.match(JSON.stringify(result), /pending_approval/);
  assert.equal(result.explanations.some((item) => item.support_classification === "inferred"), true);
});

test("at-or-below eligibility threshold leaves recorded steps unchanged", () => {
  const result = simulateCounterfactual(failedRefundFixture().slice(2, 3), { kind: "eligibility_amount_validation", max_amount: 12 });
  assert.equal(result.status, "completed");
  assert.equal(result.intervention_point, null);
  assert.equal(result.step_changes.every((change) => change.change === "unchanged"), true);
  assert.equal(result.explanations[0].support_classification, "configured_assumption");
});

test("duplicate step IDs use occurrence-qualified evidence references", () => {
  const fixture = failedRefundFixture();
  const duplicate = [
    step("same", "tool_result", "Earlier unrelated result", {}, { matches: [] }),
    { ...fixture[0], id: "same", step_id: "same" },
    ...fixture.slice(1)
  ];
  const result = simulateCounterfactual(duplicate, { kind: "disambiguation" });
  assert.equal(result.status, "completed");
  const references = result.step_changes.flatMap((change) => change.evidence_refs.filter((ref) => ref.step_id === "same"));
  assert.equal(references.some((ref) => ref.occurrence === 1), true);
  assert.equal(references.every((ref) => Number.isInteger(ref.occurrence) && ref.occurrence >= 0), true);
});

test("invalid configurations reject multiple or contradictory guardrails", () => {
  assert.throws(() => validateGuardrailConfig([{ kind: "confirmation" }, { kind: "human_approval" }]), CounterfactualConfigError);
  assert.throws(() => simulateCounterfactual([], { kind: "human_approval", threshold: -1 }), /threshold/i);
  assert.throws(() => simulateCounterfactual([], { kind: "confirmation", currency: "USD" }), /does not accept/i);
  assert.throws(() => simulateCounterfactual([], { kind: "confirmation", type: "disambiguation" }), /agree/i);
});

test("every supported guardrail produces a proposed, not-executed regression test even when evidence is insufficient", () => {
  for (const kind of ["disambiguation", "confirmation", "eligibility_amount_validation", "human_approval"] as const) {
    const result = simulateCounterfactual([], { kind });
    assert.equal(result.proposed_regression_tests.length, 1);
    assert.equal(result.proposed_regression_tests[0].status, "proposed");
    assert.equal(result.proposed_regression_tests[0].execution_status, "not_executed");
  }
});
