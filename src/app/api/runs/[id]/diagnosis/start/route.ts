import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { DiagnosisServiceError, startDiagnosisForRun } from "@/lib/diagnosis-service";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  const requestId = error instanceof DiagnosisServiceError ? error.requestId : undefined;
  const details = requestId ? { request_id: requestId } : {};
  if (error instanceof DiagnosisServiceError) {
    if (error.code === "run_not_found") return NextResponse.json({ error: "Run not found", code: "RUN_NOT_FOUND", ...details }, { status: 404 });
    if (error.code === "not_configured") return NextResponse.json({ error: "Diagnosis service is not configured", code: "DIAGNOSIS_NOT_CONFIGURED", ...details }, { status: 503 });
    if (error.code === "timeout") return NextResponse.json({ error: "Diagnosis provider timed out", code: "DIAGNOSIS_TIMEOUT", ...details }, { status: 504 });
    if (error.code === "auth") return NextResponse.json({ error: "Diagnosis provider authentication failed", code: "DIAGNOSIS_AUTH_FAILED", ...details }, { status: 502 });
    if (error.code === "rate_limit") return NextResponse.json({ error: "Diagnosis provider rate limit reached", code: "DIAGNOSIS_RATE_LIMIT", ...details }, { status: 429 });
    if (error.code === "invalid_provider_response") return NextResponse.json({ error: "Diagnosis provider returned an invalid structured report", code: "DIAGNOSIS_INVALID_RESPONSE", ...details }, { status: 502 });
  }
  return NextResponse.json({ error: "Diagnosis provider request failed", code: "DIAGNOSIS_PROVIDER_FAILURE", ...details }, { status: 503 });
}

/** The request body can request regeneration, but trace evidence always comes from SQLite. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({})) as { regenerate?: unknown };
    const requestId = randomUUID();
    const result = await startDiagnosisForRun(id, undefined, { regenerate: body.regenerate === true, requestId });
    return NextResponse.json({ diagnosis: result.report, report: result.report, metadata: result.metadata, attempts: result.attempts, cached: result.cached, request_id: requestId });
  } catch (error) {
    return errorResponse(error);
  }
}
