import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { GET as getRunDetail } from "../src/app/api/runs/[id]/route";
import { POST as resetDemo } from "../src/app/api/seed/route";
import { closeDb, getDb } from "../src/db/client";
import { agentRuns, traceSteps } from "../src/db/schema";
import { seedDatabase } from "../src/db/seed";

const failedSupportRefundId = "run_support_refund_damaged_headphones_failed";
let temporaryDirectory: string;
const db = getDb;

before(async () => {
  temporaryDirectory = await mkdtemp(join(tmpdir(), "tracewreck-test-"));
  process.env.DATABASE_URL = `file:${join(temporaryDirectory, "test.db")}`;
  // The client is lazy, so close the module-level singleton if another test
  // imported it before this isolated test configured DATABASE_URL.
  closeDb();
});

after(async () => {
  closeDb();
  delete process.env.DATABASE_URL;
  await rm(temporaryDirectory, { recursive: true, force: true });
});

test("seeds the expected run and trace contract in an isolated database", () => {
  const database = db();
  const seeded = seedDatabase();
  const runs = database.select().from(agentRuns).all();
  const steps = database.select().from(traceSteps).all();

  assert.equal(seeded.length, 8);
  assert.equal(runs.length, 8);
  assert.deepEqual(
    runs.reduce<Record<string, number>>((counts, run) => {
      counts[run.status] = (counts[run.status] ?? 0) + 1;
      return counts;
    }, {}),
    { success: 4, suspicious: 2, failed: 2 }
  );

  const runIds = new Set(runs.map((run) => run.id));
  const stepsByRun = new Map<string, typeof steps>();
  for (const step of steps) {
    assert.equal(runIds.has(step.runId), true, `step ${step.id} references an unknown run`);
    stepsByRun.set(step.runId, [...(stepsByRun.get(step.runId) ?? []), step]);
  }
  for (const [runId, runSteps] of stepsByRun) {
    const stepIds = new Set(runSteps.map((step) => step.stepId));
    assert.equal(stepIds.size, runSteps.length, `step IDs must be unique within ${runId}`);
    for (const step of runSteps) {
      assert.equal(step.id, step.stepId, `step ${step.id} must expose its local step ID`);
      assert.equal(step.parentStepId === null || stepIds.has(step.parentStepId), true, `step ${step.stepId} has an invalid parent`);
    }
  }

  const supportSteps = steps.filter((step) => step.runId === failedSupportRefundId);
  assert.equal(supportSteps.length > 0, true);
  assert.equal(supportSteps.filter((step) => step.isFirstFaultyStep).length, 1);
});

test("detail retrieval returns steps in execution order", async () => {
  const response = await getRunDetail(new Request("http://localhost/api/runs/test"), { params: Promise.resolve({ id: failedSupportRefundId }) });
  assert.equal(response.status, 200);
  const payload = (await response.json()) as { steps: Array<{ id: string; step_id: string }> };
  const expected = db().select().from(traceSteps).all()
    .filter((step) => step.runId === failedSupportRefundId)
    .sort((left, right) => left.startedAt.localeCompare(right.startedAt) || left.stepId.localeCompare(right.stepId))
    .map((step) => step.id);
  assert.deepEqual(payload.steps.map((step) => step.id), expected);
  assert.deepEqual(payload.steps.map((step) => step.step_id), expected);
});

test("safe initialization preserves the seeded dataset", () => {
  const beforeCounts = {
    runs: db().select().from(agentRuns).all().length,
    steps: db().select().from(traceSteps).all().length
  };
  const initialized = seedDatabase();
  assert.equal(initialized.length, 8);
  assert.deepEqual(
    {
      runs: db().select().from(agentRuns).all().length,
      steps: db().select().from(traceSteps).all().length
    },
    beforeCounts
  );
});

test("destructive HTTP demo reset is opt-in", async () => {
  delete process.env.ALLOW_DEMO_RESET;
  const disabled = await resetDemo();
  assert.equal(disabled.status, 403);

  process.env.ALLOW_DEMO_RESET = "true";
  const enabled = await resetDemo();
  assert.equal(enabled.status, 201);
  delete process.env.ALLOW_DEMO_RESET;
});
