import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { agentRuns, traceSteps } from "@/db/schema";
import { normalizeStep, normalizedRun, traceForRun } from "@/db/trace";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const db = getDb();
  const run = db.select().from(agentRuns).where(eq(agentRuns.id, params.id)).get();
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });
  const steps = db.select().from(traceSteps).where(eq(traceSteps.runId, run.id)).all()
    .sort((left, right) => left.startedAt.localeCompare(right.startedAt) || left.stepId.localeCompare(right.stepId));
  const normalizedSteps = steps.map((step, index) => normalizeStep(step, index));
  return NextResponse.json({
    run: { ...normalizedRun(run, steps), trace: traceForRun(run, steps), steps: normalizedSteps },
    steps: normalizedSteps
  });
}
