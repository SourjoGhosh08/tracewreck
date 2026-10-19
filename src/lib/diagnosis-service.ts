import { and, desc, eq, isNull } from "drizzle-orm";
import { createHash } from "node:crypto";
import { getDb } from "@/db/client";
import { agentRuns, diagnosisReports, traceSteps } from "@/db/schema";
import { fingerprintTraceEvidence, prepareTraceEvidence } from "./diagnosis-evidence";
import type { DiagnosisEnvelope, DiagnosisMetadata, DiagnosisReport, DiagnosisTokenUsage } from "./diagnosis-types";
import { createOpenAICompatibleAdapter, diagnosisProviderConfig, diagnosisPromptVersion, DiagnosisAdapterError, type DiagnosisAdapter, type DiagnosisProviderResult } from "./llm-openai-compatible";
import { evidenceReferenceKey, validateDiagnosisReport, type ReferenceValidation } from "./diagnosis-validation";

export type DiagnosisServiceErrorCode = "run_not_found" | "not_configured" | "timeout" | "auth" | "rate_limit" | "provider_failure" | "invalid_provider_response";

export class DiagnosisServiceError extends Error {
  constructor(readonly code: DiagnosisServiceErrorCode, readonly requestId?: string) {
    super("Diagnosis could not be completed.");
    this.name = "DiagnosisServiceError";
  }
}

const inFlight = new Map<string, Promise<DiagnosisEnvelope>>();

function diagnosisLog(event: { requestId: string; runId: string; stage: string; category: string; providerStatus?: number | null; attempt?: number }) {
  // Never include provider bodies, headers, keys, or trace contents in logs.
  console.warn("[diagnosis]", JSON.stringify(event));
}

function errorCode(error: unknown): DiagnosisServiceErrorCode {
  if (error instanceof DiagnosisAdapterError) {
    if (error.code === "not_configured") return "not_configured";
    if (error.code === "timeout") return "timeout";
    if (error.code === "auth") return "auth";
    if (error.code === "rate_limit") return "rate_limit";
    if (error.code === "bad_response") return "invalid_provider_response";
  }
  return "provider_failure";
}

function diagnosisId(runId: string, identity: string) {
  return `diag_${createHash("sha256").update(`${runId}:${identity}`).digest("hex").slice(0, 32)}`;
}

function referencesFor(steps: typeof traceSteps.$inferSelect[]): ReferenceValidation {
  const occurrenceById = new Map<string, number>();
  const references = new Set<string>();
  const duplicateIds = new Set<string>();
  const ordered = [...steps].sort((left, right) => left.startedAt.localeCompare(right.startedAt) || left.stepId.localeCompare(right.stepId) || left.id.localeCompare(right.id));
  const seen = new Set<string>();
  for (const step of ordered) {
    const occurrence = occurrenceById.get(step.stepId) ?? 0;
    occurrenceById.set(step.stepId, occurrence + 1);
    references.add(evidenceReferenceKey({ step_id: step.stepId, occurrence }));
    if (seen.has(step.stepId)) duplicateIds.add(step.stepId);
    seen.add(step.stepId);
  }
  return { references, duplicateIds };
}

function metadataFromRow(row: typeof diagnosisReports.$inferSelect): DiagnosisMetadata {
  const source = row.source === "demo_fixture" ? "demo_fixture" : "live_model";
  const usage = row.tokenUsageJson && typeof row.tokenUsageJson === "object" && !Array.isArray(row.tokenUsageJson) ? row.tokenUsageJson as DiagnosisTokenUsage : null;
  const omitted = Array.isArray(row.omittedContentJson) ? row.omittedContentJson.filter((item): item is string => typeof item === "string") : [];
  return {
    report_id: row.id,
    run_id: row.runId,
    source,
    provider: row.provider ?? null,
    model: row.model ?? null,
    prompt_version: row.promptVersion,
    schema_version: 1,
    trace_fingerprint: row.evidenceFingerprint,
    created_at: row.createdAt,
    token_usage: usage,
    input_redacted: Boolean(row.inputRedacted),
    input_truncated: Boolean(row.inputTruncated),
    omitted_content: omitted
  };
}

function reportFromRow(row: typeof diagnosisReports.$inferSelect, validation: ReferenceValidation): DiagnosisReport | null {
  if (row.status !== "completed" || row.source === "demo_fixture" || !row.reportJson) return null;
  try {
    return validateDiagnosisReport(row.reportJson, validation);
  } catch {
    return null;
  }
}

function providerResult(value: DiagnosisProviderResult | DiagnosisReport): DiagnosisProviderResult {
  if (value && typeof value === "object" && "report" in value) {
    const result = value as DiagnosisProviderResult;
    return { report: result.report, token_usage: result.token_usage ?? null };
  }
  return { report: value as DiagnosisReport, token_usage: null };
}

async function callAndValidate(adapter: DiagnosisAdapter, evidence: ReturnType<typeof prepareTraceEvidence>, validation: ReferenceValidation, correction?: unknown) {
  try {
    const result = providerResult(await adapter.diagnose(evidence, correction));
    return { report: validateDiagnosisReport(result.report, validation), token_usage: result.token_usage ?? null };
  } catch (error) {
    if (error instanceof DiagnosisAdapterError) throw error;
    throw new DiagnosisAdapterError("bad_response", "Diagnosis provider returned an invalid report.", error);
  }
}

function runDiagnosis(runId: string, adapter: DiagnosisAdapter, regenerate: boolean, requestId: string): Promise<DiagnosisEnvelope> {
  const db = getDb();
  const run = db.select().from(agentRuns).where(eq(agentRuns.id, runId)).get();
  if (!run) return Promise.reject(new DiagnosisServiceError("run_not_found", requestId));
  const steps = db.select().from(traceSteps).where(eq(traceSteps.runId, runId)).all();
  const evidence = prepareTraceEvidence(run, steps);
  const fingerprint = fingerprintTraceEvidence(evidence);
  const model = process.env.LLM_MODEL?.trim() || null;
  const identity = `${fingerprint}:${model ?? ""}:${diagnosisPromptVersion()}:1`;
  const key = `${runId}:${identity}`;
  const current = inFlight.get(key);
  if (current) return current;

  const promise = (async (): Promise<DiagnosisEnvelope> => {
    const validation = referencesFor(steps);
    const now = new Date().toISOString();
    let row = db.select().from(diagnosisReports)
      .where(and(eq(diagnosisReports.runId, runId), eq(diagnosisReports.evidenceFingerprint, fingerprint), model === null ? isNull(diagnosisReports.model) : eq(diagnosisReports.model, model), eq(diagnosisReports.promptVersion, diagnosisPromptVersion()), eq(diagnosisReports.schemaVersion, 1)))
      .orderBy(desc(diagnosisReports.updatedAt)).get();
    const identityMatched = Boolean(row);
    if (identityMatched && row?.status === "completed" && !regenerate) {
      const cachedReport = reportFromRow(row, validation);
      if (cachedReport) return { report: cachedReport, metadata: metadataFromRow(row), attempts: row.attempts, cached: true };
    }

    // Older additive schemas retain a unique (run_id, evidence_fingerprint)
    // constraint. If the configured model changes, reuse that row as a
    // mutable storage slot rather than losing the new report on insert.
    if (!row) {
      row = db.select().from(diagnosisReports)
        .where(and(eq(diagnosisReports.runId, runId), eq(diagnosisReports.evidenceFingerprint, fingerprint)))
        .orderBy(desc(diagnosisReports.updatedAt)).get();
    }

    const id = row?.id ?? diagnosisId(runId, identity);
    if (!row) {
      try {
        db.insert(diagnosisReports).values({
          id,
          runId,
          evidenceFingerprint: fingerprint,
          status: "running",
          reportJson: null,
          source: "live_model",
          provider: "openai-compatible",
          model,
          promptVersion: diagnosisPromptVersion(),
          schemaVersion: 1,
          tokenUsageJson: null,
          inputRedacted: evidence.preparation.input_redacted,
          inputTruncated: evidence.preparation.input_truncated,
          omittedContentJson: evidence.preparation.omitted_content,
          attempts: 0,
          errorCode: null,
          createdAt: now,
          updatedAt: now
        }).run();
      } catch {
        row = db.select().from(diagnosisReports).where(eq(diagnosisReports.id, id)).get();
      }
    }
    const reportId = row?.id ?? id;
    db.update(diagnosisReports).set({ status: "running", reportJson: null, source: "live_model", provider: "openai-compatible", model, promptVersion: diagnosisPromptVersion(), schemaVersion: 1, inputRedacted: evidence.preparation.input_redacted, inputTruncated: evidence.preparation.input_truncated, omittedContentJson: evidence.preparation.omitted_content, errorCode: null, updatedAt: now }).where(eq(diagnosisReports.id, reportId)).run();

    let attempts = 0;
    let result: { report: DiagnosisReport; token_usage: DiagnosisTokenUsage | null };
    try {
      attempts += 1;
      result = await callAndValidate(adapter, evidence, validation);
    } catch (firstError) {
      if (!(firstError instanceof DiagnosisAdapterError) || firstError.code !== "bad_response") {
        diagnosisLog({ requestId, runId, stage: "provider_request", category: errorCode(firstError), providerStatus: firstError instanceof DiagnosisAdapterError ? firstError.providerStatus : null, attempt: attempts });
        db.update(diagnosisReports).set({ status: "failed", attempts, errorCode: errorCode(firstError), updatedAt: new Date().toISOString() }).where(eq(diagnosisReports.id, reportId)).run();
        throw new DiagnosisServiceError(errorCode(firstError), requestId);
      }
      diagnosisLog({ requestId, runId, stage: "provider_response", category: "invalid_structured_output", providerStatus: firstError.providerStatus, attempt: attempts });
      try {
        attempts += 1;
        result = await callAndValidate(adapter, evidence, validation, firstError.details);
      } catch (secondError) {
        diagnosisLog({ requestId, runId, stage: "provider_correction", category: errorCode(secondError), providerStatus: secondError instanceof DiagnosisAdapterError ? secondError.providerStatus : null, attempt: attempts });
        db.update(diagnosisReports).set({ status: "failed", attempts, errorCode: errorCode(secondError), updatedAt: new Date().toISOString() }).where(eq(diagnosisReports.id, reportId)).run();
        throw new DiagnosisServiceError(errorCode(secondError), requestId);
      }
    }
    const createdAt = new Date().toISOString();
    db.update(diagnosisReports).set({ status: "completed", reportJson: result.report, source: "live_model", provider: "openai-compatible", model, tokenUsageJson: result.token_usage, attempts, errorCode: null, updatedAt: createdAt }).where(eq(diagnosisReports.id, reportId)).run();
    const saved = db.select().from(diagnosisReports).where(eq(diagnosisReports.id, reportId)).get();
    diagnosisLog({ requestId, runId, stage: "completed", category: "live_model_report", attempt: attempts });
    if (!saved) throw new DiagnosisServiceError("provider_failure", requestId);
    return { report: result.report, metadata: metadataFromRow(saved), attempts, cached: false };
  })();
  inFlight.set(key, promise);
  void promise.finally(() => inFlight.delete(key)).catch(() => undefined);
  return promise;
}

export function startDiagnosisForRun(runId: string, adapter: DiagnosisAdapter = createOpenAICompatibleAdapter(), options: { regenerate?: boolean; requestId?: string } = {}) {
  return runDiagnosis(runId, adapter, options.regenerate === true, options.requestId ?? createHash("sha256").update(`${runId}:${Date.now()}:${Math.random()}`).digest("hex").slice(0, 16));
}

export function getStoredDiagnosis(runId: string): (DiagnosisEnvelope & { status: "completed" }) | null {
  const db = getDb();
  const run = db.select({ id: agentRuns.id }).from(agentRuns).where(eq(agentRuns.id, runId)).get();
  if (!run) throw new DiagnosisServiceError("run_not_found");
  const steps = db.select().from(traceSteps).where(eq(traceSteps.runId, runId)).all();
  const validation = referencesFor(steps);
  const row = db.select().from(diagnosisReports).where(eq(diagnosisReports.runId, runId)).orderBy(desc(diagnosisReports.updatedAt)).all().find((candidate) => candidate.status === "completed" && candidate.source !== "demo_fixture");
  if (!row) return null;
  const report = reportFromRow(row, validation);
  if (!report) return null;
  return { report, metadata: metadataFromRow(row), attempts: row.attempts, cached: true, status: "completed" };
}

export function isDiagnosisConfigured() {
  try {
    diagnosisProviderConfig();
    return true;
  } catch {
    return false;
  }
}
