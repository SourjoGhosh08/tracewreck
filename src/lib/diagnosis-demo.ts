import type { RunRecord, TraceStep } from "@/types/trace";
import type { DiagnosisEnvelope, DiagnosisReport } from "./diagnosis-types";

const REFUND_RUN_ID = "run_support_refund_damaged_headphones_failed";

function ref(step: TraceStep | undefined, occurrence = 0) {
  return step ? { step_id: step.step_id, occurrence } : null;
}

/** A display-only, precomputed synthetic example for the seeded refund run. */
export function demoDiagnosisForRun(run: RunRecord, steps: TraceStep[]): DiagnosisEnvelope | null {
  if (run.id !== REFUND_RUN_ID) return null;
  const selection = steps.find((step) => step.title === "Select order to refund") ?? steps.find((step) => step.is_first_faulty_step || step.isFirstFaultyStep);
  const candidates = steps.find((step) => step.title === "Two similar orders found");
  const refund = steps.find((step) => step.title === "Issue incorrect refund");
  const selectionRef = ref(selection);
  const candidatesRef = ref(candidates);
  const refundRef = ref(refund);
  if (!selectionRef || !candidatesRef || !refundRef) return null;
  const report: DiagnosisReport = {
    schema_version: 1,
    analysis_status: "likely_failure",
    title: "Ambiguous order selection led to an incorrect refund",
    summary: "This synthetic example illustrates how the recorded trace can be reviewed: two matching orders were returned, then one was selected without recorded confirmation before a refund was issued. It is a demonstration annotation, not proof of causation or live model output.",
    failure_class: "data_ambiguity",
    suspected_first_faulty_step_ref: selectionRef,
    observed_facts: [
      { statement: "The retrieval/tool result recorded two similar NoiseCancel X2 orders.", supporting_step_refs: [candidatesRef] },
      { statement: "The selection step recorded order 847219 while the trace contained two candidates.", supporting_step_refs: [selectionRef] },
      { statement: "A $12 refund was recorded after the selection.", supporting_step_refs: [refundRef] }
    ],
    hypotheses: [{ explanation: "The selection decision may have treated recency as sufficient identity evidence when the request was ambiguous.", supporting_step_refs: [candidatesRef, selectionRef], uncertainty_or_alternative: "The trace does not prove why the order was selected; missing customer confirmation or upstream context could explain the decision." }],
    contributing_factors: ["Two valid-looking records matched the request.", "No confirmation step is recorded before the side effect."],
    observed_impact: "The recorded trace shows a refund action for order 847219 and a downstream incorrect-outcome path.",
    potential_impact: "Similar ambiguity could cause incorrect financial actions or customer communications in other runs.",
    recommended_fixes: [{ title: "Require disambiguation before refund", category: "workflow", concrete_suggested_change: "Pause the refund flow and request an explicit order identifier when multiple records match.", supporting_evidence_refs: [candidatesRef, selectionRef], implementation_considerations: "Keep this as a proposed change; Phase 3 does not enforce policy or execute code changes." }],
    regression_test_ideas: [{ scenario: "Two recent orders match the same product and customer.", expected_behavior: "The agent asks for confirmation and does not issue a refund yet.", proposed_assertions: ["No refund tool call is recorded before confirmation.", "The response names the ambiguous candidate set."] }],
    missing_evidence: ["No recorded customer confirmation identifies which order was damaged.", "The trace does not expose hidden model reasoning."],
    limitations: ["This is a precomputed synthetic example, not a provider response.", "Recorded order and execution relationships do not establish causation."]
  };
  return {
    report,
    metadata: {
      report_id: "demo_refund_diagnosis_phase3",
      run_id: run.id,
      source: "demo_fixture",
      provider: null,
      model: null,
      prompt_version: "phase3-demo-v1",
      schema_version: 1,
      trace_fingerprint: "demo-fixture-not-live",
      created_at: "2025-02-14T09:42:11.000Z",
      token_usage: null,
      input_redacted: false,
      input_truncated: false,
      omitted_content: []
    },
    attempts: 0,
    cached: false
  };
}
