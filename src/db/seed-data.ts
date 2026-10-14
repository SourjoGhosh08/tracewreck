import type { NewAgentRun, NewTraceStep, RunError, RunStatus, TraceStepStatus, TraceStepType } from "./schema";

const environment = { app: "support-platform", region: "us-east-1", runtime: "production" };

type StepDetails = {
  input?: unknown;
  output?: unknown;
  tool?: string;
  error?: RunError | null;
};

function addMs(startedAt: string, durationMs: number): string {
  return new Date(new Date(startedAt).getTime() + durationMs).toISOString();
}

function makeStep(
  runId: string,
  stepIndex: number,
  type: TraceStepType,
  name: string,
  status: TraceStepStatus,
  startedAt: string,
  durationMs: number,
  details: StepDetails = {},
  isFirstFaultyStep = false
): NewTraceStep {
  return {
    id: `${runId}_step_${String(stepIndex).padStart(2, "0")}`,
    runId,
    stepIndex,
    type,
    name,
    status,
    startedAt,
    completedAt: addMs(startedAt, durationMs),
    durationMs,
    input: details.input,
    output: details.output,
    tool: details.tool,
    error: details.error ?? null,
    isFirstFaultyStep
  };
}

function simpleSteps(
  runId: string,
  startedAt: string,
  input: unknown,
  output: unknown,
  tool: string
): NewTraceStep[] {
  const firstDuration = 8;
  const toolStartedAt = addMs(startedAt, firstDuration);
  return [
    makeStep(runId, 0, "input", "Request received", "completed", startedAt, firstDuration, { input }),
    makeStep(runId, 1, "tool_call", "Execute workflow", "completed", toolStartedAt, 24, { tool, input, output }),
    makeStep(runId, 2, "output", "Response returned", "completed", addMs(toolStartedAt, 24), 12, { output })
  ];
}

function simpleRun(
  id: string,
  agentName: string,
  agentVersion: string,
  status: RunStatus,
  startedAt: string,
  durationMs: number,
  model: string,
  input: unknown,
  output: unknown,
  tokens: [number, number],
  costUsd: number,
  tool: string,
  failureClass: string | null = null,
  error: RunError | null = null
): { run: NewAgentRun; steps: NewTraceStep[] } {
  const [promptTokens, completionTokens] = tokens;
  const steps = simpleSteps(id, startedAt, input, output, tool);
  return {
    run: {
      id,
      agentName,
      agentVersion,
      status,
      failureClass,
      startedAt,
      completedAt: addMs(startedAt, durationMs),
      durationMs,
      model,
      environment,
      input,
      output,
      error,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      costUsd,
      createdAt: startedAt
    },
    steps
  };
}

const failedSupportRefundId = "run_support_refund_damaged_headphones_failed";
const failedSupportRefundStartedAt = "2025-02-14T09:42:11.000Z";
const supportRefundError: RunError = {
  code: "WRONG_ORDER_SELECTION",
  message: "The agent selected the wrong one of two similar headphone orders before applying the refund policy.",
  retryable: false
};
const damagedHeadphonesRequest = {
  customerId: "cus_10428",
  channel: "chat",
  message: "My NoiseCancel X2 headphones arrived damaged. I have two similar recent orders—please refund the damaged one."
};

const failedSupportRefundSteps: NewTraceStep[] = [
  makeStep(failedSupportRefundId, 0, "input", "Damaged headphones request received", "completed", failedSupportRefundStartedAt, 4, {
    input: damagedHeadphonesRequest,
    output: { intent: "damaged_item_refund", confidence: 0.97 }
  }),
  makeStep(failedSupportRefundId, 1, "thought", "Identify refund intent", "completed", addMs(failedSupportRefundStartedAt, 4), 112, {
    input: { message: damagedHeadphonesRequest.message },
    output: { intent: "damaged_item_refund", product: "NoiseCancel X2 Headphones" }
  }),
  makeStep(failedSupportRefundId, 2, "tool_call", "Search customer orders", "completed", addMs(failedSupportRefundStartedAt, 116), 10, {
    tool: "orders.search",
    input: { customerId: damagedHeadphonesRequest.customerId, query: "NoiseCancel X2 Headphones" }
  }),
  makeStep(failedSupportRefundId, 3, "tool_result", "Two similar orders found", "completed", addMs(failedSupportRefundStartedAt, 126), 16, {
    tool: "orders.search",
    output: {
      matches: [
        { orderNumber: "847291", product: "NoiseCancel X2 Headphones", orderedAt: "2025-02-10", amount: 89.99, status: "delivered" },
        { orderNumber: "847219", product: "NoiseCancel X2 Headphones", orderedAt: "2025-02-08", amount: 79.99, status: "delivered" }
      ]
    }
  }),
  makeStep(failedSupportRefundId, 4, "thought", "Select order to refund", "failed", addMs(failedSupportRefundStartedAt, 142), 188, {
    input: { candidates: ["847291", "847219"], damagedProduct: "NoiseCancel X2 Headphones" },
    output: { selectedOrder: "847219", selectionReason: "most recent matching item", expectedOrder: "847291" },
    error: supportRefundError
  }, true),
  makeStep(failedSupportRefundId, 5, "tool_call", "Look up selected order", "completed", addMs(failedSupportRefundStartedAt, 330), 12, {
    tool: "orders.getByNumber",
    input: { orderNumber: "847219", customerId: damagedHeadphonesRequest.customerId }
  }),
  makeStep(failedSupportRefundId, 6, "thought", "Apply damaged-item policy", "completed", addMs(failedSupportRefundStartedAt, 342), 164, {
    input: { orderNumber: "847219", condition: "damaged" },
    output: {
      policy: "returns-policy-v3",
      decision: "partial_refund",
      incorrectReason: "Used 30-day discretionary return rule instead of damaged-item replacement/full refund rule",
      correctPolicy: "Offer replacement or a full refund for the damaged item"
    }
  }),
  makeStep(failedSupportRefundId, 7, "tool_call", "Issue incorrect refund", "completed", addMs(failedSupportRefundStartedAt, 506), 18, {
    tool: "payments.createRefund",
    input: { orderNumber: "847219", amount: 12, currency: "USD", reason: "damaged_item" },
    output: { refundId: "ref_55022", amount: 12, status: "succeeded" }
  }),
  makeStep(failedSupportRefundId, 8, "tool_call", "Send confirmation email", "completed", addMs(failedSupportRefundStartedAt, 524), 15, {
    tool: "email.send",
    input: { template: "refund-confirmation", orderNumber: "847219", refundAmount: 12, to: "customer@example.com" },
    output: { messageId: "msg_7712", delivered: true }
  }),
  makeStep(failedSupportRefundId, 9, "output", "Run completed with incorrect behavior", "failed", addMs(failedSupportRefundStartedAt, 539), 8, {
    output: {
      customerImpact: "Customer received a confirmation for the wrong order and an incorrect $12.00 refund.",
      correctBehavior: [
        "Ask the customer to confirm which of the two similar orders contains the damaged headphones.",
        "Select order 847291 only after confirmation.",
        "Apply the damaged-item policy and offer replacement or a full $89.99 refund.",
        "Send confirmation only after the correct refund succeeds."
      ]
    },
    error: supportRefundError
  })
];

const failedSupportRefund: { run: NewAgentRun; steps: NewTraceStep[] } = {
  run: {
    id: failedSupportRefundId,
    agentName: "SupportRefund Agent",
    agentVersion: "1.4.0",
    status: "failed",
    failureClass: "wrong_order_selection",
    startedAt: failedSupportRefundStartedAt,
    completedAt: addMs(failedSupportRefundStartedAt, 547),
    durationMs: 547,
    model: "gpt-4o-mini",
    environment,
    input: damagedHeadphonesRequest,
    output: failedSupportRefundSteps[9].output,
    error: supportRefundError,
    promptTokens: 1124,
    completionTokens: 438,
    totalTokens: 1562,
    costUsd: 0.00034,
    createdAt: failedSupportRefundStartedAt
  },
  steps: failedSupportRefundSteps
};

export const seedRuns: Array<{ run: NewAgentRun; steps: NewTraceStep[] }> = [
  simpleRun("run_refund_20250214_091", "SupportRefund Agent", "1.4.0", "success", "2025-02-14T09:39:02.000Z", 812, "gpt-4o-mini", { orderNumber: "847280", customerId: "cus_10390", reason: "duplicate_charge" }, { refundId: "ref_55021", amount: 49.99, status: "succeeded" }, [712, 220], 0.0002, "payments.createRefund"),
  simpleRun("run_invoice_20250214_088", "InvoiceReconciliation Agent", "2.1.2", "success", "2025-02-14T09:21:44.000Z", 2134, "gpt-4o", { invoiceId: "inv_2208", accountId: "acct_412" }, { status: "reconciled", variance: 0 }, [1204, 482], 0.0084, "invoices.reconcile"),
  simpleRun("run_triage_20250214_084", "SupportTriage Agent", "3.0.1", "success", "2025-02-14T08:57:13.000Z", 465, "gpt-4o-mini", { message: "My package arrived damaged", customerId: "cus_10117" }, { queue: "returns", priority: "high", ticketId: "tkt_9012" }, [384, 126], 0.00012, "tickets.create"),
  simpleRun("run_shipping_20250214_080", "ShippingUpdate Agent", "1.8.3", "success", "2025-02-14T08:34:28.000Z", 688, "gpt-4o-mini", { orderNumber: "847104" }, { status: "delivered", carrier: "ParcelPro", deliveredAt: "2025-02-13T17:21:00Z" }, [522, 163], 0.00015, "shipping.getStatus"),
  simpleRun("run_refund_20250213_221", "SupportRefund Agent", "1.3.9", "suspicious", "2025-02-13T17:48:05.000Z", 944, "gpt-4o-mini", { orderNumber: "846882", customerId: "cus_9981", reason: "late_delivery" }, { refundId: "ref_54988", amount: 18.5, status: "succeeded", review: "Amount exceeded the late-delivery policy threshold" }, [804, 244], 0.00023, "payments.createRefund", "policy_amount_mismatch"),
  simpleRun("run_faq_20250213_219", "FAQAnswer Agent", "4.2.0", "suspicious", "2025-02-13T16:13:51.000Z", 391, "gpt-4o-mini", { message: "How long do returns take?" }, { answer: "Approved returns are processed within 5–7 business days.", citation: "returns-policy-v3", review: "Citation was correct but confidence was below review threshold" }, [302, 118], 0.0001, "knowledge.search", "low_confidence_answer"),
  simpleRun("run_address_20250213_214", "AddressChange Agent", "1.1.0", "failed", "2025-02-13T15:52:19.000Z", 730, "gpt-4o-mini", { orderNumber: "846710", newAddress: { city: "Austin", state: "TX" } }, null, [608, 174], 0.00017, "orders.updateAddress", "shipment_already_locked", { code: "SHIPMENT_LOCKED", message: "The shipment has already been handed to the carrier and its address cannot be changed.", retryable: false }),
  failedSupportRefund
];
