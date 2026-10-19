import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { DiagnosisServiceError, getStoredDiagnosis, startDiagnosisForRun } from "@/lib/diagnosis-service";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof DiagnosisServiceError && error.code === "run_not_found") {
    return NextResponse.json({ error: "Run not found", code: "RUN_NOT_FOUND" }, { status: 404 });
  }
  return NextResponse.json({ error: "Diagnosis report is unavailable", code: "DIAGNOSIS_UNAVAILABLE" }, { status: 503 });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const diagnosis = getStoredDiagnosis(id);
    if (!diagnosis) return NextResponse.json({ error: "Diagnosis report not found", code: "DIAGNOSIS_NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ diagnosis: diagnosis.report, report: diagnosis.report, metadata: diagnosis.metadata, attempts: diagnosis.attempts, cached: diagnosis.cached, status: diagnosis.status });
  } catch (error) {
    return errorResponse(error);
  }
}

// Keep the collection route convenient for API clients; the explicit /start
// route remains the canonical action endpoint.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({})) as { regenerate?: unknown };
    const requestId = randomUUID();
    const result = await startDiagnosisForRun(id, undefined, { regenerate: body.regenerate === true, requestId });
    return NextResponse.json({ diagnosis: result.report, report: result.report, metadata: result.metadata, attempts: result.attempts, cached: result.cached, request_id: requestId });
  } catch (error) {
    if (error instanceof DiagnosisServiceError) {
      if (error.code === "run_not_found") return NextResponse.json({ error: "Run not found", code: "RUN_NOT_FOUND" }, { status: 404 });
      if (error.code === "not_configured") return NextResponse.json({ error: "Diagnosis service is not configured", code: "DIAGNOSIS_NOT_CONFIGURED", request_id: error.requestId }, { status: 503 });
      if (error.code === "timeout") return NextResponse.json({ error: "Diagnosis provider timed out", code: "DIAGNOSIS_TIMEOUT", request_id: error.requestId }, { status: 504 });
      if (error.code === "auth") return NextResponse.json({ error: "Diagnosis provider authentication failed", code: "DIAGNOSIS_AUTH_FAILED", request_id: error.requestId }, { status: 502 });
      if (error.code === "rate_limit") return NextResponse.json({ error: "Diagnosis provider rate limit reached", code: "DIAGNOSIS_RATE_LIMIT", request_id: error.requestId }, { status: 429 });
      if (error.code === "invalid_provider_response") return NextResponse.json({ error: "Diagnosis provider returned an invalid structured report", code: "DIAGNOSIS_INVALID_RESPONSE", request_id: error.requestId }, { status: 502 });
    }
    return NextResponse.json({ error: "Diagnosis provider request failed", code: "DIAGNOSIS_PROVIDER_FAILURE", request_id: error instanceof DiagnosisServiceError ? error.requestId : undefined }, { status: 503 });
  }
}
