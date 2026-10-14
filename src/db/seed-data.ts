import type { NewAgentRun, NewTraceStep, RunStatus, TraceStepStatus, TraceStepType } from "./schema";

type Json = unknown;
type StepDetails = {
  input?: Json;
  output?: Json;
  tokensIn?: number;
  tokensOut?: number;
  riskScore?: number | null;
  notes?: string | null;
};

function addMs(startedAt: string, durationMs: number): string {
  return new Date(new Date(startedAt).getTime() + durationMs).toISOString();
}

function stepId(runId: string, index: number) {
  return `${runId}_step_${String(index + 1).padStart(2, "0")}`;
}

function makeStep(
  runId: string,
  index: number,
  type: TraceStepType,
  title: string,
  status: TraceStepStatus,
  startedAt: string,
  latencyMs: number,
  details: StepDetails = {},
  isFirstFaultyStep = false,
  parentStepId: string | null = index > 0 ? stepId(runId, index - 1) : null
): NewTraceStep {
  const currentStepId = stepId(runId, index);
  return {
    id: currentStepId,
    runId,
    stepId: currentStepId,
    parentStepId,
    type,
    title,
    startedAt,
    endedAt: addMs(startedAt, latencyMs),
    inputJson: details.input,
    outputJson: details.output,
    tokensIn: details.tokensIn ?? 0,
    tokensOut: details.tokensOut ?? 0,
    latencyMs,
    status,
    riskScore: details.riskScore ?? null,
    notes: details.notes ?? null,
    isFirstFaultyStep
  };
}

function makeRun(
  id: string,
  agentName: string,
  agentVersion: string,
  model: string,
  status: RunStatus,
  startedAt: string,
  taskSummary: string,
  userRequest: Json,
  finalOutcome: Json,
  steps: NewTraceStep[],
  failureClass: string | null = null
): { run: NewAgentRun; steps: NewTraceStep[] } {
  const totalTokensIn = steps.reduce((total, step) => total + (step.tokensIn ?? 0), 0);
  const totalTokensOut = steps.reduce((total, step) => total + (step.tokensOut ?? 0), 0);
  const durationMs = steps.reduce((latest, step) => Math.max(latest, new Date(step.endedAt).getTime() - new Date(startedAt).getTime()), 0);
  return {
    run: {
      id,
      agentName,
      agentVersion,
      model,
      taskSummary,
      userRequest,
      status,
      finalOutcome,
      failureClass,
      startedAt,
      endedAt: addMs(startedAt, durationMs),
      durationMs,
      totalTokensIn,
      totalTokensOut,
      llmCalls: steps.filter((step) => step.type === "model_call").length,
      toolCalls: steps.filter((step) => step.type === "tool_call").length,
      createdAt: startedAt
    },
    steps
  };
}

function standardSteps(
  runId: string,
  startedAt: string,
  request: Json,
  tool: string,
  toolInput: Json,
  toolOutput: Json,
  outcome: Json,
  policyNotes = "Policy check passed"
): NewTraceStep[] {
  const definitions: Array<[TraceStepType, string, TraceStepStatus, number, StepDetails]> = [
    ["user_request", "Receive user request", "ok", 6, { input: request, output: { accepted: true }, tokensIn: 32, tokensOut: 4 }],
    ["agent_plan", "Plan task execution", "ok", 24, { output: { plan: ["understand request", "verify records", "complete action"] }, tokensIn: 74, tokensOut: 28 }],
    ["model_call", "Determine next action", "ok", 116, { input: request, output: { intent: "supported", confidence: 0.98 }, tokensIn: 210, tokensOut: 54 }],
    ["retrieval", "Retrieve supporting records", "ok", 48, { input: { query: toolInput }, output: { recordsFound: true }, tokensIn: 18, tokensOut: 8 }],
    ["tool_call", `Call ${tool}`, "ok", 42, { input: { tool, ...toolInput as Record<string, unknown> }, tokensIn: 12, tokensOut: 6 }],
    ["tool_result", `Receive ${tool} result`, "ok", 38, { output: toolOutput, tokensIn: 8, tokensOut: 18 }],
    ["policy_check", "Verify policy and authorization", "ok", 31, { input: toolOutput, output: { allowed: true }, tokensIn: 46, tokensOut: 16, notes: policyNotes }],
    ["tool_call", "Send confirmation email", "ok", 22, { input: { tool: "email.send", template: "action-confirmation", to: "customer@example.com" }, output: { delivered: true }, tokensIn: 10, tokensOut: 5 }],
    ["final_response", "Return final response", "ok", 12, { output: outcome, tokensIn: 22, tokensOut: 42 }]
  ];
  let elapsed = 0;
  return definitions.map(([type, title, status, latency, details], index) => {
    const step = makeStep(runId, index, type, title, status, addMs(startedAt, elapsed), latency, details);
    elapsed += latency;
    return step;
  });
}

const damagedHeadphonesRequest = {
  customerId: "cus_10428",
  channel: "chat",
  message: "My NoiseCancel X2 headphones arrived damaged. I have two similar recent orders—please refund the damaged one."
};
const failedSupportRefundId = "run_support_refund_damaged_headphones_failed";
const failedSupportRefundStartedAt = "2025-02-14T09:42:11.000Z";
const supportRefundSteps: NewTraceStep[] = [
  makeStep(failedSupportRefundId, 0, "user_request", "Damaged headphones request received", "ok", failedSupportRefundStartedAt, 4, {
    input: damagedHeadphonesRequest,
    output: { intent: "damaged_item_refund", confidence: 0.97 },
    tokensIn: 42,
    tokensOut: 8
  }),
  makeStep(failedSupportRefundId, 1, "agent_plan", "Plan damaged-item refund", "ok", addMs(failedSupportRefundStartedAt, 4), 38, {
    output: { actions: ["find matching orders", "confirm damaged order", "apply damaged-item policy", "refund", "email customer"] },
    tokensIn: 96,
    tokensOut: 32
  }),
  makeStep(failedSupportRefundId, 2, "model_call", "Identify refund intent and product", "ok", addMs(failedSupportRefundStartedAt, 42), 112, {
    input: { message: damagedHeadphonesRequest.message },
    output: { intent: "damaged_item_refund", product: "NoiseCancel X2 Headphones" },
    tokensIn: 188,
    tokensOut: 44
  }),
  makeStep(failedSupportRefundId, 3, "retrieval", "Retrieve customer order history", "ok", addMs(failedSupportRefundStartedAt, 154), 46, {
    input: { customerId: damagedHeadphonesRequest.customerId },
    output: { source: "orders.index", recordsFound: 2 },
    tokensIn: 20,
    tokensOut: 12
  }),
  makeStep(failedSupportRefundId, 4, "tool_call", "Search customer orders", "ok", addMs(failedSupportRefundStartedAt, 200), 10, {
    input: { tool: "orders.search", customerId: damagedHeadphonesRequest.customerId, query: "NoiseCancel X2 Headphones" },
    tokensIn: 10,
    tokensOut: 4
  }),
  makeStep(failedSupportRefundId, 5, "tool_result", "Two similar orders found", "ok", addMs(failedSupportRefundStartedAt, 210), 16, {
    output: {
      matches: [
        { orderNumber: "847291", product: "NoiseCancel X2 Headphones", orderedAt: "2025-02-10", amount: 89.99, status: "delivered" },
        { orderNumber: "847219", product: "NoiseCancel X2 Headphones", orderedAt: "2025-02-08", amount: 79.99, status: "delivered" }
      ]
    },
    tokensIn: 8,
    tokensOut: 28
  }),
  makeStep(failedSupportRefundId, 6, "model_call", "Select order to refund", "error", addMs(failedSupportRefundStartedAt, 226), 188, {
    input: { candidates: ["847291", "847219"], damagedProduct: "NoiseCancel X2 Headphones" },
    output: { selectedOrder: "847219", selectionReason: "most recent matching item", expectedOrder: "847291" },
    tokensIn: 248,
    tokensOut: 58,
    riskScore: 0.99,
    notes: "WRONG_ORDER_SELECTION: Selected 847219 without confirming which similar order contained the damaged headphones."
  }, true),
  makeStep(failedSupportRefundId, 7, "tool_call", "Look up selected order", "ok", addMs(failedSupportRefundStartedAt, 414), 12, {
    input: { tool: "orders.getByNumber", orderNumber: "847219", customerId: damagedHeadphonesRequest.customerId },
    output: { orderNumber: "847219", total: 79.99, itemCondition: "damaged" },
    tokensIn: 12,
    tokensOut: 12,
    riskScore: 0.9,
    notes: "Downstream action used the order chosen by the first faulty step."
  }),
  makeStep(failedSupportRefundId, 8, "policy_check", "Apply damaged-item policy", "warning", addMs(failedSupportRefundStartedAt, 426), 164, {
    input: { orderNumber: "847219", condition: "damaged" },
    output: {
      policy: "returns-policy-v3 / 30-day discretionary return",
      decision: "partial_refund",
      correct_policy: "damaged-item replacement-or-full-refund policy",
      correct_behavior_recommendation: "Ask the customer to confirm the damaged order, then apply the damaged-item policy and offer replacement or a full $89.99 refund for order 847291."
    },
    tokensIn: 182,
    tokensOut: 52,
    riskScore: 0.94,
    notes: "WRONG_REFUND_POLICY: Read the discretionary return policy instead of the damaged-item policy for the selected order."
  }),
  makeStep(failedSupportRefundId, 9, "tool_call", "Issue incorrect refund", "error", addMs(failedSupportRefundStartedAt, 590), 18, {
    input: { tool: "payments.createRefund", orderNumber: "847219", amount: 12, currency: "USD", reason: "damaged_item" },
    output: { refundId: "ref_55022", amount: 12, status: "succeeded" },
    tokensIn: 14,
    tokensOut: 12,
    riskScore: 0.97,
    notes: "Refund amount and order do not match the damaged-item recommendation."
  }),
  makeStep(failedSupportRefundId, 10, "tool_call", "Send incorrect confirmation email", "error", addMs(failedSupportRefundStartedAt, 608), 15, {
    input: { tool: "email.send", template: "refund-confirmation", orderNumber: "847219", refundAmount: 12, to: "customer@example.com" },
    output: { messageId: "msg_7712", delivered: true },
    tokensIn: 12,
    tokensOut: 10,
    riskScore: 0.98,
    notes: "Email confirmed the incorrect refund after the first faulty step."
  }),
  makeStep(failedSupportRefundId, 11, "final_response", "Return incorrect refund outcome", "error", addMs(failedSupportRefundStartedAt, 623), 8, {
    output: {
      customer_impact: "Customer received a confirmation for the wrong order and an incorrect $12.00 refund.",
      behavior_recommendation: [
        "Ask the customer to confirm which of the two similar orders contains the damaged headphones.",
        "Select order 847291 only after confirmation.",
        "Apply the damaged-item policy and offer replacement or a full $89.99 refund.",
        "Require human approval before issuing a high-value refund.",
        "Send confirmation only after the correct refund succeeds."
      ]
    },
    tokensIn: 24,
    tokensOut: 48,
    riskScore: 0.99,
    notes: "WRONG_ORDER_SELECTION: Final response records the correct behavior recommendation for remediation."
  })
];

const failedSupportRefund = makeRun(
  failedSupportRefundId,
  "SupportRefund Agent",
  "1.4.0",
  "gpt-4o-mini",
  "failed",
  failedSupportRefundStartedAt,
  "Refund damaged NoiseCancel X2 headphones after identifying the correct order",
  damagedHeadphonesRequest,
  supportRefundSteps[11].outputJson,
  supportRefundSteps,
  "wrong_order_selection"
);

const addressRunId = "run_address_20250213_214";
const addressStartedAt = "2025-02-13T15:52:19.000Z";
const addressRequest = { orderNumber: "846710", newAddress: { city: "Austin", state: "TX" } };
const addressSteps = standardSteps(addressRunId, addressStartedAt, addressRequest, "orders.updateAddress", addressRequest, { shipmentStatus: "handed_to_carrier" }, {
  status: "failed",
  message: "The shipment has already been handed to the carrier and its address cannot be changed."
});
addressSteps[6] = makeStep(addressRunId, 6, "policy_check", "Check address-change eligibility", "error", addMs(addressStartedAt, 274), 31, {
  input: { shipmentStatus: "handed_to_carrier" },
  output: { allowed: false, reason: "shipment_already_locked" },
  tokensIn: 46,
  tokensOut: 16,
  riskScore: 0.86,
  notes: "SHIPMENT_LOCKED: Address changes are disallowed after carrier handoff."
}, true);
addressSteps[8] = makeStep(addressRunId, 8, "final_response", "Explain address change was declined", "error", addMs(addressStartedAt, 327), 12, {
  output: { status: "failed", message: "The shipment is locked with the carrier; contact the carrier for delivery options." },
  tokensIn: 20,
  tokensOut: 32
});
const failedAddressRun = makeRun(addressRunId, "AddressChange Agent", "1.1.0", "gpt-4o-mini", "failed", addressStartedAt, "Change the delivery address before the order ships", addressRequest, addressSteps[8].outputJson, addressSteps, "shipment_already_locked");

const standardFixtures: Array<{ id: string; agent: string; version: string; status: RunStatus; startedAt: string; summary: string; request: Json; tool: string; toolInput: Json; toolOutput: Json; outcome: Json; failureClass?: string }> = [
  { id: "run_refund_20250214_091", agent: "SupportRefund Agent", version: "1.4.0", status: "success", startedAt: "2025-02-14T09:39:02.000Z", summary: "Refund a duplicate charge for order 847280", request: { orderNumber: "847280", customerId: "cus_10390", reason: "duplicate_charge" }, tool: "payments.createRefund", toolInput: { orderNumber: "847280", amount: 49.99 }, toolOutput: { refundId: "ref_55021", amount: 49.99, status: "succeeded" }, outcome: { status: "succeeded", refundId: "ref_55021", amount: 49.99 } },
  { id: "run_invoice_20250214_088", agent: "InvoiceReconciliation Agent", version: "2.1.2", status: "success", startedAt: "2025-02-14T09:21:44.000Z", summary: "Reconcile invoice inv_2208 against the account ledger", request: { invoiceId: "inv_2208", accountId: "acct_412" }, tool: "invoices.reconcile", toolInput: { invoiceId: "inv_2208" }, toolOutput: { status: "reconciled", variance: 0 }, outcome: { status: "reconciled", variance: 0 } },
  { id: "run_triage_20250214_084", agent: "SupportTriage Agent", version: "3.0.1", status: "success", startedAt: "2025-02-14T08:57:13.000Z", summary: "Route a damaged-package support ticket", request: { message: "My package arrived damaged", customerId: "cus_10117" }, tool: "tickets.create", toolInput: { queue: "returns", priority: "high" }, toolOutput: { ticketId: "tkt_9012", queue: "returns" }, outcome: { queue: "returns", priority: "high", ticketId: "tkt_9012" } },
  { id: "run_shipping_20250214_080", agent: "ShippingUpdate Agent", version: "1.8.3", status: "success", startedAt: "2025-02-14T08:34:28.000Z", summary: "Check the delivery status for order 847104", request: { orderNumber: "847104" }, tool: "shipping.getStatus", toolInput: { orderNumber: "847104" }, toolOutput: { status: "delivered", carrier: "ParcelPro" }, outcome: { status: "delivered", carrier: "ParcelPro", deliveredAt: "2025-02-13T17:21:00Z" } },
  { id: "run_refund_20250213_221", agent: "SupportRefund Agent", version: "1.3.9", status: "suspicious", startedAt: "2025-02-13T17:48:05.000Z", summary: "Review a late-delivery refund request", request: { orderNumber: "846882", customerId: "cus_9981", reason: "late_delivery" }, tool: "payments.createRefund", toolInput: { orderNumber: "846882", amount: 18.5 }, toolOutput: { refundId: "ref_54988", amount: 18.5, status: "succeeded" }, outcome: { status: "succeeded", review: "Amount exceeded the late-delivery policy threshold" }, failureClass: "policy_amount_mismatch" },
  { id: "run_faq_20250213_219", agent: "FAQAnswer Agent", version: "4.2.0", status: "suspicious", startedAt: "2025-02-13T16:13:51.000Z", summary: "Answer how long approved returns take", request: { message: "How long do returns take?" }, tool: "knowledge.search", toolInput: { query: "return processing time" }, toolOutput: { citation: "returns-policy-v3" }, outcome: { answer: "Approved returns are processed within 5–7 business days.", review: "Confidence was below review threshold" }, failureClass: "low_confidence_answer" }
];

export const seedRuns: Array<{ run: NewAgentRun; steps: NewTraceStep[] }> = [
  ...standardFixtures.map((fixture) => makeRun(
    fixture.id,
    fixture.agent,
    fixture.version,
    "gpt-4o-mini",
    fixture.status,
    fixture.startedAt,
    fixture.summary,
    fixture.request,
    fixture.outcome,
    standardSteps(fixture.id, fixture.startedAt, fixture.request, fixture.tool, fixture.toolInput, fixture.toolOutput, fixture.outcome),
    fixture.failureClass ?? null
  )),
  failedAddressRun,
  failedSupportRefund
];
