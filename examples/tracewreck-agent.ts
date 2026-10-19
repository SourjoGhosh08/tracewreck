import { TraceWreckClient } from "../sdk/tracewreck";

async function main() {
  const client = new TraceWreckClient({
    endpoint: process.env.TRACEWRECK_URL ?? "http://localhost:3000",
    apiKey: process.env.TRACEWRECK_API_KEY
  });

  const run = client.startRun({
    agent_name: "Example Support Agent",
    agent_version: "0.1.0",
    model: "example-model",
    task_summary: "Look up an order and decide whether it can be refunded",
    user_request: { message: "Please refund my damaged order" }
  });

  run.recordStep({
  step_id: "request",
  type: "user_request",
  title: "Receive user request",
  started_at: "2026-10-20T10:00:00.000Z",
  ended_at: "2026-10-20T10:00:00.010Z",
  input: { message: "Please refund my damaged order" },
  output: { accepted: true },
  status: "ok"
  });

  run.recordStep({
  step_id: "order-lookup",
  type: "tool_call",
  title: "Look up order",
  started_at: "2026-10-20T10:00:00.010Z",
  ended_at: "2026-10-20T10:00:00.090Z",
  input: { orderNumber: "847219" },
  output: { status: "not_found" },
  status: "error",
  notes: "ORDER_NOT_FOUND: the order lookup returned no matching record"
  });

  const imported = await run.finish({
    status: "failed",
    final_outcome: { ok: false, message: "The order could not be found" },
    failure_class: "order_lookup_failed",
    ended_at: "2026-10-20T10:00:00.090Z"
  });

  console.log(`Imported ${imported.run.id} into TraceWreck.`);
}

void main();
