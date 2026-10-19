import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { agentRuns, runStatuses, traceSteps } from "@/db/schema";
import { runSummary } from "@/db/trace";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const agent = url.searchParams.get("agent") ?? url.searchParams.get("agentName");
  const failureClass = url.searchParams.get("failureClass") ?? url.searchParams.get("failure_class");

  if (status && !runStatuses.includes(status as (typeof runStatuses)[number])) {
    return NextResponse.json({ error: "status must be success, suspicious, or failed" }, { status: 400 });
  }

  const filters = [
    status ? eq(agentRuns.status, status as (typeof runStatuses)[number]) : undefined,
    agent ? eq(agentRuns.agentName, agent) : undefined,
    failureClass ? eq(agentRuns.failureClass, failureClass) : undefined
  ].filter((value): value is NonNullable<typeof value> => value !== undefined);
  const db = getDb();
  const records = db.select().from(agentRuns).where(filters.length ? and(...filters) : undefined).orderBy(desc(agentRuns.startedAt)).all();
  const steps = db.select().from(traceSteps).all();
  const stepsByRun = new Map<string, typeof steps>();
  for (const step of steps) stepsByRun.set(step.runId, [...(stepsByRun.get(step.runId) ?? []), step]);
  return NextResponse.json({ runs: records.map((run) => runSummary(run, stepsByRun.get(run.id) ?? [])) });
}
