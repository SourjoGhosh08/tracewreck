import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { agentRuns, runStatuses, traceSteps } from "@/db/schema";
import { runSummary } from "@/db/trace";
import { validateNormalizedTraceInput } from "@/lib/trace-contract";

export const dynamic = "force-dynamic";

function ingestionAuthorized(request: Request) {
  const expected = process.env.TRACEWRECK_INGEST_TOKEN?.trim();
  if (!expected) return true;
  const authorization = request.headers.get("authorization");
  return authorization === `Bearer ${expected}`;
}

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

export async function POST(request: Request) {
  if (!ingestionAuthorized(request)) {
    return NextResponse.json({ error: "Trace ingestion authorization is required" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
  }

  const validation = validateNormalizedTraceInput(payload);
  if (!validation.success) {
    return NextResponse.json({ error: "Invalid trace input", details: validation.issues }, { status: 400 });
  }

  const input = validation.value;
  const db = getDb();
  try {
    const imported = db.transaction((transaction) => {
      if (transaction.select({ id: agentRuns.id }).from(agentRuns).where(eq(agentRuns.id, input.id)).get()) {
        throw new Error("RUN_ID_ALREADY_EXISTS");
      }
      transaction.insert(agentRuns).values({
        id: input.id,
        agentName: input.agent_name,
        agentVersion: input.agent_version,
        model: input.model,
        taskSummary: input.task_summary,
        userRequest: input.user_request,
        status: input.status,
        finalOutcome: input.final_outcome,
        failureClass: input.failure_class,
        startedAt: input.started_at,
        endedAt: input.ended_at,
        durationMs: input.duration_ms,
        totalTokensIn: input.total_tokens_in,
        totalTokensOut: input.total_tokens_out,
        llmCalls: input.llm_calls,
        toolCalls: input.tool_calls,
        createdAt: input.created_at,
        source: "imported"
      }).run();
      transaction.insert(traceSteps).values(input.steps.map((step) => ({
        id: `${input.id}:${step.step_id}`,
        runId: input.id,
        stepId: step.step_id,
        parentStepId: step.parent_step_id,
        type: step.type,
        title: step.title,
        startedAt: step.started_at,
        endedAt: step.ended_at,
        inputJson: step.input,
        outputJson: step.output,
        tokensIn: step.tokens_in,
        tokensOut: step.tokens_out,
        latencyMs: step.latency_ms,
        status: step.status,
        riskScore: step.risk_score,
        notes: step.notes,
        // Fixture annotations are never accepted from an import.
        isFirstFaultyStep: false
      }))).run();
      return transaction.select().from(agentRuns).where(eq(agentRuns.id, input.id)).get();
    });
    if (!imported) return NextResponse.json({ error: "Run import failed" }, { status: 400 });
    const steps = db.select().from(traceSteps).where(eq(traceSteps.runId, input.id)).all();
    return NextResponse.json({ run: runSummary(imported, steps) }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "RUN_ID_ALREADY_EXISTS") {
      return NextResponse.json({ error: "A run with this id already exists" }, { status: 400 });
    }
    return NextResponse.json({ error: "Trace could not be imported" }, { status: 400 });
  }
}
