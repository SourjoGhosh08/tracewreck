import type { NewRun, RunError } from "./schema";
import type { RunTrace, TraceEvent } from "@/types/trace";

const environment = { app: "support-platform", region: "us-east-1", runtime: "production" };

function event(
  id: string,
  type: TraceEvent["type"],
  name: string,
  status: TraceEvent["status"],
  startedAt: string,
  durationMs: number,
  details: Pick<TraceEvent, "input" | "output" | "tool" | "error"> = {}
): TraceEvent {
  const completedAt = new Date(new Date(startedAt).getTime() + durationMs).toISOString();
  return { id, type, name, status, startedAt, completedAt, durationMs, ...details };
}

function trace(
  runId: string,
  agentName: string,
  agentVersion: string,
  status: RunTrace["status"],
  startedAt: string,
  events: TraceEvent[],
  summary: RunTrace["summary"]
): RunTrace {
  return {
    version: 1,
    runId,
    agent: { name: agentName, version: agentVersion },
    status,
    startedAt,
    completedAt: events.at(-1)?.completedAt ?? startedAt,
    events,
    summary
  };
}

const supportRefundError: RunError = {
  code: "ORDER_NOT_FOUND",
  message: "Order ord_847291 could not be found in the Orders service.",
  retryable: false
};

const failedSupportRefundTrace = trace(
  "run_support_refund_failed",
  "SupportRefund Agent",
  "1.4.0",
  "failed",
  "2025-02-14T09:42:11.000Z",
  [
    event("evt_001", "input", "Customer request received", "completed", "2025-02-14T09:42:11.000Z", 4, {
      input: {
        customerId: "cus_10428",
        message: "I was charged twice for order #847291. Please refund the duplicate charge.",
        channel: "chat"
      },
      output: { intent: "refund", confidence: 0.98 }
    }),
    event("evt_002", "thought", "Classify refund request", "completed", "2025-02-14T09:42:11.004Z", 182, {
      input: { message: "I was charged twice for order #847291. Please refund the duplicate charge." },
      output: { intent: "duplicate_charge_refund", orderNumber: "847291", confidence: 0.98 }
    }),
    event("evt_003", "tool_call", "Look up order", "completed", "2025-02-14T09:42:11.186Z", 9, {
      tool: "orders.getByNumber",
      input: { orderNumber: "847291", customerId: "cus_10428" }
    }),
    event("evt_004", "tool_result", "Order lookup response", "completed", "2025-02-14T09:42:11.195Z", 241, {
      tool: "orders.getByNumber",
      output: { status: 404, body: { error: "order_not_found", orderNumber: "847291" } }
    }),
    event("evt_005", "thought", "Verify refund eligibility", "completed", "2025-02-14T09:42:11.436Z", 96, {
      input: { orderLookup: { status: 404, orderNumber: "847291" } },
      output: { eligible: false, reason: "order_not_found" }
    }),
    event("evt_006", "tool_call", "Create refund", "failed", "2025-02-14T09:42:11.532Z", 12, {
      tool: "payments.createRefund",
      input: { orderNumber: "847291", reason: "duplicate_charge", amount: null },
      error: {
        code: "ORDER_NOT_FOUND",
        message: "Order ord_847291 could not be found in the Orders service.",
        retryable: false
      }
    }),
    event("evt_007", "error", "Run failed", "failed", "2025-02-14T09:42:11.544Z", 3, {
      error: {
        code: "ORDER_NOT_FOUND",
        message: "Order ord_847291 could not be found in the Orders service.",
        retryable: false
      }
    })
  ],
  {
    totalSteps: 7,
    completedSteps: 5,
    failedStep: "Create refund",
    rootCause: "The Orders service returned 404 for order 847291, so the refund could not be created."
  }
);

function completedRun(
  id: string,
  agentName: string,
  agentVersion: string,
  startedAt: string,
  durationMs: number,
  model: string,
  input: unknown,
  output: unknown,
  tokens: [number, number],
  costUsd: number
): NewRun {
  const completedAt = new Date(new Date(startedAt).getTime() + durationMs).toISOString();
  const [promptTokens, completionTokens] = tokens;
  const events = [
    event(`${id}_input`, "input", "Request received", "completed", startedAt, 8, { input }),
    event(`${id}_tool`, "tool_call", "Execute workflow", "completed", new Date(new Date(startedAt).getTime() + 8).toISOString(), durationMs - 36, {
      tool: "workflow.execute",
      input,
      output
    }),
    event(`${id}_output`, "output", "Response returned", "completed", new Date(new Date(startedAt).getTime() + durationMs - 28).toISOString(), 28, { output })
  ];
  return {
    id,
    agentName,
    agentVersion,
    status: "completed",
    startedAt,
    completedAt,
    durationMs,
    model,
    environment,
    input,
    output,
    error: null,
    trace: trace(id, agentName, agentVersion, "completed", startedAt, events, {
      totalSteps: 3,
      completedSteps: 3,
      failedStep: null,
      rootCause: null
    }),
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    costUsd,
    createdAt: startedAt
  };
}

export const seedRuns: NewRun[] = [
  {
    id: "run_support_refund_failed",
    agentName: "SupportRefund Agent",
    agentVersion: "1.4.0",
    status: "failed",
    startedAt: "2025-02-14T09:42:11.000Z",
    completedAt: "2025-02-14T09:42:11.547Z",
    durationMs: 547,
    model: "gpt-4o-mini",
    environment,
    input: failedSupportRefundTrace.events[0].input,
    output: null,
    error: supportRefundError,
    trace: failedSupportRefundTrace,
    promptTokens: 846,
    completionTokens: 198,
    totalTokens: 1044,
    costUsd: 0.00022,
    createdAt: "2025-02-14T09:42:11.000Z"
  },
  completedRun("run_refund_20250214_091", "SupportRefund Agent", "1.4.0", "2025-02-14T09:39:02.000Z", 812, "gpt-4o-mini", { orderNumber: "847280", customerId: "cus_10390", reason: "duplicate_charge" }, { refundId: "ref_55021", amount: 49.99, status: "succeeded" }, [712, 220], 0.0002),
  completedRun("run_invoice_20250214_088", "InvoiceReconciliation Agent", "2.1.2", "2025-02-14T09:21:44.000Z", 2134, "gpt-4o", { invoiceId: "inv_2208", accountId: "acct_412" }, { status: "reconciled", variance: 0 }, [1204, 482], 0.0084),
  completedRun("run_triage_20250214_084", "SupportTriage Agent", "3.0.1", "2025-02-14T08:57:13.000Z", 465, "gpt-4o-mini", { message: "My package arrived damaged", customerId: "cus_10117" }, { queue: "returns", priority: "high", ticketId: "tkt_9012" }, [384, 126], 0.00012),
  completedRun("run_shipping_20250214_080", "ShippingUpdate Agent", "1.8.3", "2025-02-14T08:34:28.000Z", 688, "gpt-4o-mini", { orderNumber: "847104" }, { status: "delivered", carrier: "ParcelPro", deliveredAt: "2025-02-13T17:21:00Z" }, [522, 163], 0.00015),
  completedRun("run_refund_20250213_221", "SupportRefund Agent", "1.3.9", "2025-02-13T17:48:05.000Z", 944, "gpt-4o-mini", { orderNumber: "846882", customerId: "cus_9981", reason: "late_delivery" }, { refundId: "ref_54988", amount: 18.5, status: "succeeded" }, [804, 244], 0.00023),
  completedRun("run_faq_20250213_219", "FAQAnswer Agent", "4.2.0", "2025-02-13T16:13:51.000Z", 391, "gpt-4o-mini", { message: "How long do returns take?" }, { answer: "Approved returns are processed within 5–7 business days.", citation: "returns-policy-v3" }, [302, 118], 0.0001),
  completedRun("run_address_20250213_214", "AddressChange Agent", "1.1.0", "2025-02-13T15:52:19.000Z", 730, "gpt-4o-mini", { orderNumber: "846710", newAddress: { city: "Austin", state: "TX" } }, { status: "updated", shipmentLocked: false }, [608, 174], 0.00017)
];
