import type { AgentRun, TraceStep } from "./schema";

export function traceForRun(run: AgentRun, steps: TraceStep[]) {
  const orderedSteps = [...steps].sort((left, right) => left.stepIndex - right.stepIndex);
  const firstFault = orderedSteps.find((step) => step.isFirstFaultyStep);
  const failedStep = orderedSteps.find((step) => step.status === "failed");

  return {
    version: 1 as const,
    runId: run.id,
    agent: { name: run.agentName, version: run.agentVersion },
    status: run.status,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    events: orderedSteps.map((step) => ({
      id: step.id,
      runId: step.runId,
      stepIndex: step.stepIndex,
      type: step.type,
      name: step.name,
      status: step.status,
      startedAt: step.startedAt,
      completedAt: step.completedAt,
      durationMs: step.durationMs,
      input: step.input,
      output: step.output,
      tool: step.tool,
      error: step.error,
      isFirstFaultyStep: step.isFirstFaultyStep
    })),
    summary: {
      totalSteps: orderedSteps.length,
      completedSteps: orderedSteps.filter((step) => step.status === "completed").length,
      failedStep: failedStep?.name ?? null,
      firstFaultyStep: firstFault?.name ?? null,
      rootCause: run.error?.message ?? null
    }
  };
}

export function runSummary(run: AgentRun, steps: TraceStep[]) {
  const firstFault = steps.find((step) => step.isFirstFaultyStep);
  return {
    id: run.id,
    agentName: run.agentName,
    agentVersion: run.agentVersion,
    status: run.status,
    failureClass: run.failureClass,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    durationMs: run.durationMs,
    model: run.model,
    environment: run.environment,
    promptTokens: run.promptTokens,
    completionTokens: run.completionTokens,
    totalTokens: run.totalTokens,
    costUsd: run.costUsd,
    createdAt: run.createdAt,
    stepCount: steps.length,
    firstFaultyStep: firstFault?.name ?? null,
    errorCode: run.error?.code ?? null
  };
}
