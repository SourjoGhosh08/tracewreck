"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { AlertCircle, ArrowLeft, CheckCircle2, FileJson, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type ValidationIssue = { path?: unknown; message?: unknown };
type ImportState = "idle" | "submitting" | "success" | "error";

function errorMessage(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

export default function ImportRunPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [json, setJson] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [state, setState] = useState<ImportState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [importedRunId, setImportedRunId] = useState<string | null>(null);

  const clearFeedback = () => {
    setState("idle");
    setError(null);
    setIssues([]);
    setImportedRunId(null);
  };

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    clearFeedback();
    void file.text().then(setJson).catch(() => {
      setError("The selected file could not be read.");
      setState("error");
    });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearFeedback();

    if (!json.trim()) {
      setError("Paste a normalized JSON trace or choose a JSON file first.");
      setState("error");
      return;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(json);
    } catch {
      setError("The content is not valid JSON. Check commas, quotes, and braces, then try again.");
      setState("error");
      return;
    }

    setState("submitting");
    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json", ...(apiToken.trim() ? { authorization: `Bearer ${apiToken.trim()}` } : {}) },
        body: JSON.stringify(payload)
      });
      const result = await response.json() as { error?: unknown; details?: unknown; run?: { id?: unknown } };
      if (!response.ok) {
        const responseIssues = Array.isArray(result.details) ? result.details.filter((issue): issue is ValidationIssue => typeof issue === "object" && issue !== null) : [];
        setIssues(responseIssues);
        setError(errorMessage(result.error, "The trace could not be imported."));
        setState("error");
        return;
      }

      const runId = result.run?.id;
      if (typeof runId !== "string" || !runId) {
        setError("The trace was accepted, but the imported run could not be located.");
        setState("error");
        return;
      }

      setImportedRunId(runId);
      setState("success");
      window.setTimeout(() => router.replace(`/runs/${encodeURIComponent(runId)}`), 700);
    } catch {
      setError("The import request failed. Check that the app is running and try again.");
      setState("error");
    }
  };

  const isBusy = state === "submitting";
  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <Link href="/app" className="inline-flex items-center gap-2 text-xs font-medium text-slate-500 transition-colors hover:text-slate-200">
          <ArrowLeft size={14} aria-hidden="true" /> Back to all runs
        </Link>

        <section>
          <p className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-violet-300"><Upload size={14} aria-hidden="true" /> Trace intake</p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-100 sm:text-4xl">Import a normalized trace</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Upload a JSON file or paste the normalized trace payload returned by your agent recorder. The imported run will open in the existing inspection workspace.</p>
        </section>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><FileJson size={16} className="text-violet-300" aria-hidden="true" /> Trace JSON</CardTitle>
            <CardDescription>Use the normalized snake_case fields, including an array of steps. The server validates the complete payload before saving it.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} noValidate>
              <div className="flex flex-wrap items-center gap-3">
                <input ref={fileInputRef} id="trace-file" type="file" accept="application/json,.json" onChange={handleFile} className="sr-only" />
                <label htmlFor="trace-file" className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3.5 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-white/[0.08] focus-within:outline-none focus-within:ring-2 focus-within:ring-violet-400/70">
                  <Upload size={14} aria-hidden="true" /> Choose JSON file
                </label>
                {fileName ? <span className="inline-flex max-w-full items-center gap-1.5 rounded border border-white/[0.08] bg-white/[0.02] px-2 py-1 text-xs text-slate-400"><span className="truncate">{fileName}</span><button type="button" aria-label="Clear selected file" onClick={() => { setFileName(null); if (fileInputRef.current) fileInputRef.current.value = ""; }} className="text-slate-600 hover:text-slate-300"><X size={13} aria-hidden="true" /></button></span> : null}
              </div>

              <label htmlFor="trace-json" className="mt-5 block text-xs font-semibold text-slate-300">Normalized JSON payload</label>
              <textarea id="trace-json" value={json} onChange={(event) => { setJson(event.target.value); if (state !== "submitting") clearFeedback(); }} aria-invalid={state === "error"} aria-describedby="trace-json-help import-feedback" spellCheck={false} placeholder={'{\n  "id": "run_example",\n  "agent_name": "Support Agent",\n  "steps": []\n}'} className="mt-2 min-h-[360px] w-full resize-y rounded-lg border border-white/10 bg-slate-950/70 px-3 py-3 font-mono text-xs leading-5 text-slate-300 outline-none transition-colors placeholder:text-slate-700 focus:border-violet-400/60 focus:ring-2 focus:ring-violet-400/20" />
               <p id="trace-json-help" className="mt-2 text-[11px] leading-5 text-slate-600">Maximum request size and field requirements are enforced by the import endpoint.</p>

               <label htmlFor="trace-api-token" className="mt-5 block text-xs font-semibold text-slate-300">Ingestion token <span className="font-normal text-slate-600">(optional)</span></label>
               <input id="trace-api-token" type="password" autoComplete="off" value={apiToken} onChange={(event) => setApiToken(event.target.value)} placeholder="Only required when the server protects ingestion" className="mt-2 h-9 w-full rounded-md border border-white/10 bg-slate-950/70 px-3 font-mono text-xs text-slate-300 outline-none transition-colors placeholder:text-slate-700 focus:border-violet-400/60 focus:ring-2 focus:ring-violet-400/20" />
               <p className="mt-2 text-[11px] leading-5 text-slate-600">Sent only in the request header and never included in the trace payload.</p>

              <div id="import-feedback" aria-live="polite" className="mt-4">
                {state === "error" ? <div role="alert" className="rounded-lg border border-red-400/25 bg-red-400/[0.06] p-3 text-xs text-red-100/85"><p className="flex items-center gap-2 font-semibold"><AlertCircle size={14} aria-hidden="true" /> {error}</p>{issues.length ? <ul className="mt-2 space-y-1.5 text-red-200/75">{issues.map((issue, index) => <li key={`${String(issue.path)}-${index}`}><span className="font-mono text-red-200">{errorMessage(issue.path, "trace")}</span>: {errorMessage(issue.message, "invalid value")}</li>)}</ul> : null}</div> : null}
                {state === "success" && importedRunId ? <div role="status" className="rounded-lg border border-emerald-400/25 bg-emerald-400/[0.06] p-3 text-xs text-emerald-100/85"><p className="flex items-center gap-2 font-semibold"><CheckCircle2 size={14} aria-hidden="true" /> Trace imported successfully</p><p className="mt-1">Opening imported run <span className="font-mono">{importedRunId}</span>…</p><Link href={`/runs/${encodeURIComponent(importedRunId)}`} className="mt-2 inline-flex text-emerald-300 underline decoration-emerald-300/40 underline-offset-2 hover:text-emerald-200">Open it now</Link></div> : null}
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3"><Button type="submit" disabled={isBusy}>{isBusy ? "Validating trace…" : "Import run"}</Button><Link href="/app" className="inline-flex h-9 items-center rounded-md px-3.5 text-sm text-slate-500 transition-colors hover:bg-white/[0.04] hover:text-slate-300">Cancel</Link></div>
            </form>
          </CardContent>
        </Card>

        <p className="text-[11px] leading-5 text-slate-600">Imported traces retain recorded evidence only. They are labeled as imported and do not receive demo fixture annotations or an automatic diagnosis.</p>
      </div>
    </AppShell>
  );
}
