import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { GET as getRuns, POST as importRun } from "../src/app/api/runs/route";
import { GET as getRunDetail } from "../src/app/api/runs/[id]/route";
import { closeDb, getDb } from "../src/db/client";
import { agentRuns, traceSteps } from "../src/db/schema";

let temporaryDirectory: string;

before(async () => {
  temporaryDirectory = await mkdtemp(join(tmpdir(), "tracewreck-import-test-"));
  process.env.DATABASE_URL = `file:${join(temporaryDirectory, "test.db")}`;
  closeDb();
});

after(async () => {
  closeDb();
  delete process.env.DATABASE_URL;
  await rm(temporaryDirectory, { recursive: true, force: true });
});

function validTrace(id = "imported-run-001") {
  return {
    id,
    agent_name: "Imported Agent",
    agent_version: "2.1.0",
    model: "provider/model",
    task_summary: "Import a recorded trace",
    user_request: { prompt: "hello" },
    status: "failed",
    final_outcome: { ok: false },
    failure_class: "tool_error",
    started_at: "2026-01-01T00:00:00.000Z",
    ended_at: "2026-01-01T00:00:01.000Z",
    duration_ms: 1000,
    total_tokens_in: 12,
    total_tokens_out: 8,
    llm_calls: 1,
    tool_calls: 1,
    created_at: "2026-01-01T00:00:00.000Z",
    steps: [
      {
        step_id: "request",
        parent_step_id: null,
        type: "user_request",
        title: "Receive request",
        started_at: "2026-01-01T00:00:00.000Z",
        ended_at: "2026-01-01T00:00:00.100Z",
        input: { prompt: "hello" },
        output: { accepted: true },
        tokens_in: 8,
        tokens_out: 2,
        latency_ms: 100,
        status: "ok",
        risk_score: null,
        notes: null
      },
      {
        step_id: "failure",
        parent_step_id: "request",
        type: "tool_call",
        title: "Call failing tool",
        started_at: "2026-01-01T00:00:00.100Z",
        ended_at: "2026-01-01T00:00:01.000Z",
        input: { tool: "example" },
        output: { error: "failed" },
        tokens_in: 4,
        tokens_out: 6,
        latency_ms: 900,
        status: "error",
        risk_score: 0.5,
        notes: "TOOL_ERROR: example failed",
        is_first_faulty_step: true
      }
    ]
  };
}

test("imports a valid normalized run transactionally without fixture annotations", async () => {
  const response = await importRun(new Request("http://localhost/api/runs", { method: "POST", body: JSON.stringify(validTrace()) }));
  assert.equal(response.status, 201);
  const payload = (await response.json()) as { run: { id: string; source: string; step_count: number } };
  assert.equal(payload.run.id, "imported-run-001");
  assert.equal(payload.run.source, "imported");
  assert.equal(payload.run.step_count, 2);

  const run = getDb().select().from(agentRuns).all().find((candidate) => candidate.id === "imported-run-001");
  assert.equal(run?.source, "imported");
  assert.deepEqual(getDb().select().from(traceSteps).all().map((step) => step.isFirstFaultyStep), [false, false]);
});

test("rolls back the run when step persistence fails", async () => {
  const first = validTrace("atomic-a");
  first.steps[0].step_id = "shared:step";
  first.steps[1].parent_step_id = "shared:step";
  assert.equal((await importRun(new Request("http://localhost/api/runs", { method: "POST", body: JSON.stringify(first) }))).status, 201);

  const before = { runs: getDb().select().from(agentRuns).all().length, steps: getDb().select().from(traceSteps).all().length };
  const conflicting = validTrace("atomic-a:shared");
  conflicting.steps[0].step_id = "step";
  conflicting.steps[1].parent_step_id = "step";
  const response = await importRun(new Request("http://localhost/api/runs", { method: "POST", body: JSON.stringify(conflicting) }));
  assert.equal(response.status, 400);
  assert.equal(getDb().select().from(agentRuns).all().some((run) => run.id === "atomic-a:shared"), false);
  assert.deepEqual({ runs: getDb().select().from(agentRuns).all().length, steps: getDb().select().from(traceSteps).all().length }, before);
});

test("rejects invalid enums, timestamps, duplicate IDs, and parents with no writes", async () => {
  const before = { runs: getDb().select().from(agentRuns).all().length, steps: getDb().select().from(traceSteps).all().length };
  const invalid = validTrace("invalid-run");
  invalid.status = "unknown";
  invalid.steps[1].step_id = "request";
  invalid.steps[1].parent_step_id = "missing";
  invalid.steps[1].started_at = "not-a-timestamp";
  const response = await importRun(new Request("http://localhost/api/runs", { method: "POST", body: JSON.stringify(invalid) }));
  assert.equal(response.status, 400);
  const payload = (await response.json()) as { error: string; details: Array<{ path: string }> };
  assert.equal(payload.error, "Invalid trace input");
  assert.equal(payload.details.some((issue) => issue.path === "status"), true);
  assert.equal(payload.details.some((issue) => issue.path === "steps[1].step_id"), true);
  assert.equal(payload.details.some((issue) => issue.path === "steps[1].parent_step_id"), true);
  assert.deepEqual({ runs: getDb().select().from(agentRuns).all().length, steps: getDb().select().from(traceSteps).all().length }, before);
});

test("retrieves imported runs through the existing GET response shape", async () => {
  const detailResponse = await getRunDetail(new Request("http://localhost/api/runs/imported-run-001"), { params: Promise.resolve({ id: "imported-run-001" }) });
  assert.equal(detailResponse.status, 200);
  const detail = (await detailResponse.json()) as { run: { source: string; trace: { run_id: string }; steps: Array<{ step_id: string; is_first_faulty_step: boolean }> } };
  assert.equal(detail.run.source, "imported");
  assert.equal(detail.run.trace.run_id, "imported-run-001");
  assert.deepEqual(detail.run.steps.map((step) => step.step_id), ["request", "failure"]);
  assert.equal(detail.run.steps.some((step) => step.is_first_faulty_step), false);

  const listResponse = await getRuns(new Request("http://localhost/api/runs"));
  const list = (await listResponse.json()) as { runs: Array<{ id: string; source: string }> };
  assert.equal(list.runs.find((run) => run.id === "imported-run-001")?.source, "imported");
});

test("supports optional bearer-token protection for ingestion", async () => {
  process.env.TRACEWRECK_INGEST_TOKEN = "test-ingest-token";
  const unauthorized = await importRun(new Request("http://localhost/api/runs", { method: "POST", body: JSON.stringify(validTrace("unauthorized-run")) }));
  assert.equal(unauthorized.status, 401);

  const authorized = await importRun(new Request("http://localhost/api/runs", {
    method: "POST",
    headers: { authorization: "Bearer test-ingest-token" },
    body: JSON.stringify(validTrace("authorized-run"))
  }));
  assert.equal(authorized.status, 201);
  delete process.env.TRACEWRECK_INGEST_TOKEN;
});
