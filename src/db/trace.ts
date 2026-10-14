import type { AgentRun, TraceStep } from "./schema";

function errorForStep(step: TraceStep | undefined) {
  if (!step || step.status !== "error") return null;
  return {
    code: step.notes?.split(":", 1)[0] || "TRACE_STEP_ERROR",
    message: step.notes ?? step.title,
    retryable: false
  };
}

/** Convert a database row into the stable JSON step contract plus UI aliases. */
export function normalizeStep(step: TraceStep, index: number) {
  return {
    step_id: step.stepId,
    parent_step_id: step.parentStepId,
    type: step.type,
    title: step.title,
    started_at: step.startedAt,
    ended_at: step.endedAt,
    input: step.inputJson ?? null,
    output: step.outputJson ?? null,
    tokens_in: step.tokensIn,
    tokens_out: step.tokensOut,
    latency_ms: step.latencyMs,
    status: step.status,
    risk_score: step.riskScore,
    notes: step.notes,
    is_first_faulty_step: step.isFirstFaultyStep,

    // Compatibility aliases consumed by the existing page without changing UI.
    id: step.id,
    runId: step.runId,
    stepIndex: index,
    name: step.title,
    startedAt: step.startedAt,
    completedAt: step.endedAt,
    durationMs: step.latencyMs,
    isFirstFaultyStep: step.isFirstFaultyStep,
    riskScore: step.riskScore,
    tokenUsage: { input: step.tokensIn, output: step.tokensOut, total: step.tokensIn + step.tokensOut },
    token_usage: { input: step.tokensIn, output: step.tokensOut, total: step.tokensIn + step.tokensOut },
    error: errorForStep(step),
    tool: typeof step.inputJson === "object" && step.inputJson && "tool" in step.inputJson
      ? (step.inputJson as { tool?: string }).tool ?? null
      : null
  };
}

function orderedSteps(steps: TraceStep[]) {
  return [...steps].sort((left, right) => left.startedAt.localeCompare(right.startedAt) || left.stepId.localeCompare(right.stepId));
}

function runError(steps: TraceStep[]) {
  return errorForStep(orderedSteps(steps).find((step) => step.status === "error"));
}

/** Normalize the run fields used by both list and detail endpoints. */
export function normalizedRun(run: AgentRun, steps: TraceStep[] = []) {
  const error = runError(steps);
  return {
    id: run.id,
    agent_name: run.agentName,
    agent_version: run.agentVersion,
    model: run.model,
    task_summary: run.taskSummary,
    user_request: run.userRequest,
    status: run.status,
    final_outcome: run.finalOutcome,
    failure_class: run.failureClass,
    started_at: run.startedAt,
    ended_at: run.endedAt,
    duration_ms: run.durationMs,
    total_tokens_in: run.totalTokensIn,
    total_tokens_out: run.totalTokensOut,
    llm_calls: run.llmCalls,
    tool_calls: run.toolCalls,
    created_at: run.createdAt,

    // Compatibility aliases consumed by the existing page and its types.
    agentName: run.agentName,
    agentVersion: run.agentVersion,
    taskSummary: run.taskSummary,
    input: run.userRequest,
    output: run.finalOutcome,
    failureClass: run.failureClass,
    startedAt: run.startedAt,
    completedAt: run.endedAt,
    durationMs: run.durationMs,
    promptTokens: run.totalTokensIn,
    completionTokens: run.totalTokensOut,
    totalTokens: run.totalTokensIn + run.totalTokensOut,
    createdAt: run.createdAt,
    error
  };
}

export function traceForRun(run: AgentRun, steps: TraceStep[]) {
  const ordered = orderedSteps(steps);
  const normalizedSteps = ordered.map((step, index) => normalizeStep(step, index));
  const firstFault = normalizedSteps.find((step) => step.is_first_faulty_step);
  const failedStep = normalizedSteps.find((step) => step.status === "error");

  return {
    version: 1 as const,
    run_id: run.id,
    agent: { name: run.agentName, version: run.agentVersion },
    status: run.status,
    started_at: run.startedAt,
    ended_at: run.endedAt,
    steps: normalizedSteps,
    // Retain events as a read-compatible alias for the existing detail view.
    events: normalizedSteps,
    summary: {
      total_steps: normalizedSteps.length,
      completed_steps: normalizedSteps.filter((step) => step.status === "ok").length,
      failed_step: failedStep?.step_id ?? null,
      first_faulty_step: firstFault?.step_id ?? null,
      root_cause: runError(steps)?.message ?? null,
      totalSteps: normalizedSteps.length,
      completedSteps: normalizedSteps.filter((step) => step.status === "ok").length,
      failedStep: failedStep?.title ?? null,
      firstFaultyStep: firstFault?.title ?? null,
      rootCause: runError(steps)?.message ?? null
    }
  };
}

export function runSummary(run: AgentRun, steps: TraceStep[]) {
  const normalized = normalizedRun(run, steps);
  const traceSteps = orderedSteps(steps);
  const firstFault = traceSteps.find((step) => step.isFirstFaultyStep);
  return {
    ...normalized,
    step_count: steps.length,
    first_faulty_step: firstFault?.stepId ?? null,
    error_code: runError(steps)?.code ?? null,
    stepCount: steps.length,
    firstFaultyStep: firstFault?.title ?? null,
    errorCode: runError(steps)?.code ?? null
  };
}
