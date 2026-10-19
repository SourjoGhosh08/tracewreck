import assert from "node:assert/strict";
import { test } from "node:test";
import { TraceWreckClient } from "../sdk/tracewreck";

test("SDK records a run and sends an authenticated normalized payload", async () => {
  let requestedUrl = "";
  let requestedInit: RequestInit | undefined;
  const client = new TraceWreckClient({
    endpoint: "https://tracewreck.example",
    apiKey: "sdk-secret",
    fetch: async (input, init) => {
      requestedUrl = String(input);
      requestedInit = init;
      return new Response(JSON.stringify({ run: { id: "run_sdk_001", source: "imported" } }), { status: 201, headers: { "content-type": "application/json" } });
    }
  });

  const run = client.startRun({
    id: "run_sdk_001",
    started_at: "2026-10-20T10:00:00.000Z",
    agent_name: "SDK Agent",
    agent_version: "1.0.0",
    model: "test-model",
    task_summary: "Exercise the SDK",
    user_request: { message: "hello" }
  });
  run.recordStep({
    step_id: "request",
    type: "user_request",
    title: "Receive request",
    started_at: "2026-10-20T10:00:00.000Z",
    ended_at: "2026-10-20T10:00:00.010Z",
    input: { message: "hello" },
    output: { accepted: true },
    status: "ok"
  });

  const result = await run.finish({ status: "success", final_outcome: { ok: true }, ended_at: "2026-10-20T10:00:00.010Z" });
  assert.equal(result.run.id, "run_sdk_001");
  assert.equal(requestedUrl, "https://tracewreck.example/api/runs");
  assert.equal(new Headers(requestedInit?.headers).get("authorization"), "Bearer sdk-secret");
  const body = JSON.parse(String(requestedInit?.body)) as { id: string; steps: Array<{ step_id: string }>; status: string };
  assert.equal(body.id, "run_sdk_001");
  assert.equal(body.status, "success");
  assert.deepEqual(body.steps.map((step) => step.step_id), ["request"]);
});
