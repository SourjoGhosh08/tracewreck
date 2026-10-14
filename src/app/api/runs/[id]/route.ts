import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { agentRuns, traceSteps } from "@/db/schema";
import { traceForRun } from "@/db/trace";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const db = getDb();
  const run = db.select().from(agentRuns).where(eq(agentRuns.id, params.id)).get();
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });
  const steps = db.select().from(traceSteps).where(eq(traceSteps.runId, run.id)).all();
  return NextResponse.json({ run: { ...run, trace: traceForRun(run, steps) }, steps });
}
