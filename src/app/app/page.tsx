"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, ArrowRight, Bug, CheckCircle2, Clock3, RefreshCw, Search, Terminal, Upload } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { RunStatusBadge } from "@/components/run-status-badge";
import { RunSourceBadge } from "@/components/run-source-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { AgentRunSource, RunListRecord, RunRecord } from "@/types/trace";
import { formatDate, formatDuration, formatRelativeDate, formatTokens } from "@/lib/utils";

type StatusFilter = "all" | RunListRecord["status"];

function taskSummary(input: unknown): string {
  if (typeof input === "string") return input;
  if (!input || typeof input !== "object") return "No task summary recorded";
  const record = input as Record<string, unknown>;
  const preferredKeys = ["message", "task", "request", "prompt", "query", "reason"];
  for (const key of preferredKeys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
    if (value && typeof value === "object") {
      const nested = taskSummary(value);
      if (nested !== "No task summary recorded") return nested;
    }
  }
  return JSON.stringify(input);
}

function formatFailureClass(value: string | null) {
  if (!value) return "—";
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function callCounts(run: RunListRecord) {
  return {
    llm: run.llm_calls,
    tools: run.tool_calls
  };
}

export default function DashboardPage() {
  const [runs, setRuns] = useState<RunListRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [agentName, setAgentName] = useState("");
  const [failureClass, setFailureClass] = useState("all");
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<"all" | AgentRunSource>("all");

  const loadRuns = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/runs", { cache: "no-store" });
      if (!response.ok) throw new Error("Unable to load runs");
      const payload = (await response.json()) as { runs: RunListRecord[] };
      setRuns(payload.runs);

      // The list endpoint intentionally remains lightweight. Fetch the normalized
      // steps from each detail endpoint so the table can show call counts and task
      // summaries without changing the existing API contract.
      const enriched = await Promise.allSettled(payload.runs.map(async (summary) => {
        const detailResponse = await fetch(`/api/runs/${encodeURIComponent(summary.id)}`, { cache: "no-store" });
        if (!detailResponse.ok) return summary;
        const detail = (await detailResponse.json()) as { run: RunRecord; steps: RunRecord["steps"] };
        return {
          ...summary,
          steps: detail.steps,
          stepCount: detail.steps.length,
          taskSummary: taskSummary(detail.run.input)
        };
      }));
      setRuns(enriched.map((result, index) => result.status === "fulfilled" ? result.value : payload.runs[index]));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load runs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadRuns(); }, []);

  const failureClasses = useMemo(() => Array.from(new Set(runs.map((run) => run.failureClass).filter((value): value is string => Boolean(value)))).sort(), [runs]);
  const filteredRuns = useMemo(() => {
    const needle = query.toLowerCase().trim();
    const agentNeedle = agentName.toLowerCase().trim();
    return runs.filter((run) => {
      const matchesStatus = status === "all" || run.status === status;
      const matchesAgent = !agentNeedle || run.agentName.toLowerCase().includes(agentNeedle);
      const matchesFailureClass = failureClass === "all" || run.failureClass === failureClass;
      const matchesSource = source === "all" || run.source === source;
      const matchesQuery = !needle || [run.id, run.agentName, run.taskSummary ?? "", run.status].some((value) => value.toLowerCase().includes(needle));
      return matchesStatus && matchesAgent && matchesFailureClass && matchesSource && matchesQuery;
    });
  }, [agentName, failureClass, query, runs, source, status]);

  const failedRuns = runs.filter((run) => run.status === "failed").length;
  const suspiciousRuns = runs.filter((run) => run.status === "suspicious").length;
  const importedRuns = runs.filter((run) => run.source === "imported").length;
  const fixtureRuns = runs.length - importedRuns;
  const averageSteps = runs.length ? runs.reduce((total, run) => total + run.stepCount, 0) / runs.length : 0;

  return <AppShell>
    <div className="space-y-8">
      <section className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-violet-300"><Terminal size={14} /> Flight recorder</div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-100 sm:text-4xl">TraceWreck</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">The flight recorder and root-cause debugger for AI agents.</p>
        </div>
         <div className="flex flex-wrap items-center gap-2"><Link href="/app/import" className="inline-flex h-9 items-center gap-2 rounded-md border border-violet-400/25 bg-violet-400/10 px-3.5 py-2 text-sm font-medium text-violet-200 transition-colors hover:bg-violet-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70"><Upload size={14} aria-hidden="true" /> Import run</Link><Button variant="secondary" onClick={() => void loadRuns()} disabled={loading}><RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh data</Button></div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total runs" value={loading ? "—" : String(runs.length)} detail="All recorded executions" icon={Activity} />
        <MetricCard label="Failed runs" value={loading ? "—" : String(failedRuns)} detail="Require root-cause review" icon={Bug} tone="red" />
        <MetricCard label="Suspicious runs" value={loading ? "—" : String(suspiciousRuns)} detail="Flagged for investigation" icon={AlertTriangle} tone="amber" />
        <MetricCard label="Average steps per run" value={loading || !runs.length ? "—" : averageSteps.toFixed(1)} detail="Across normalized traces" icon={Clock3} tone="violet" />
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-100">Agent runs</h2>
             <p className="mt-1 text-xs text-slate-500">Inspect execution traces, find suspicious behavior, and review the supporting evidence.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:flex xl:items-end">
            <label className="block min-w-44"><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600">Agent name</span><Input value={agentName} onChange={(event) => setAgentName(event.target.value)} placeholder="Filter agents" /></label>
            <label className="block min-w-44"><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600">Failure class</span><select value={failureClass} onChange={(event) => setFailureClass(event.target.value)} className="flex h-9 w-full rounded-md border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-300 outline-none focus:border-violet-400/60"><option value="all">All failure classes</option>{failureClasses.map((value) => <option key={value} value={value}>{formatFailureClass(value)}</option>)}</select></label>
            <label className="block min-w-52"><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600">Search</span><div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Run ID or task summary" className="pl-9" /></div></label>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-white/[0.08] bg-slate-950/60 p-1.5" role="group" aria-label="Status filter">
          {(["all", "success", "suspicious", "failed"] as StatusFilter[]).map((value) => <button type="button" key={value} onClick={() => setStatus(value)} className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${status === value ? "bg-white/[0.09] text-slate-100" : "text-slate-500 hover:text-slate-300"}`}>{value === "all" ? "All" : value.charAt(0).toUpperCase() + value.slice(1)}</button>)}
         </div>
          <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-600"><span className="mr-1 uppercase tracking-[0.12em]">Run source</span>{(["all", "fixture", "imported"] as const).map((value) => <button key={value} type="button" onClick={() => setSource(value)} aria-pressed={source === value} className={`inline-flex items-center gap-1.5 rounded-md border px-1.5 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70 ${source === value ? "border-violet-300/35 bg-violet-400/[0.08]" : "border-transparent hover:border-white/10 hover:bg-white/[0.04]"}`}>{value === "all" ? <span className="px-1.5 text-slate-400">All <span className="font-mono text-slate-500">{runs.length}</span></span> : <><RunSourceBadge source={value} /><span>{value === "fixture" ? fixtureRuns : importedRuns}</span></>}</button>)}</div>

         {error ? <EmptyState title="Could not load runs" description={error} action={<Button onClick={() => void loadRuns()}><RefreshCw size={14} /> Try again</Button>} /> : loading ? <Card className="overflow-hidden"><div className="space-y-px">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="flex items-center gap-4 border-b border-white/[0.05] p-4"><Skeleton className="h-4 w-44" /><Skeleton className="h-4 w-36" /><Skeleton className="ml-auto h-4 w-20" /><Skeleton className="h-4 w-24" /></div>)}</div></Card> : filteredRuns.length === 0 ? <EmptyState title={runs.length ? "No matching runs" : "No runs yet"} description={runs.length ? "Try adjusting the status or field filters." : "Seed the database to start inspecting agent executions."} action={!runs.length ? <Button variant="secondary" onClick={() => void loadRuns()}><RefreshCw size={14} /> Reload data</Button> : undefined} /> : <Card className="overflow-hidden">
          <div className="overflow-x-auto"><table className="w-full min-w-[1320px] text-left"><thead className="border-b border-white/[0.07] bg-white/[0.02]"><tr className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600"><th className="px-5 py-3.5">Run ID</th><th className="px-4 py-3.5">Agent name</th><th className="px-4 py-3.5">Task summary</th><th className="px-4 py-3.5">Status</th><th className="px-4 py-3.5">LLM calls</th><th className="px-4 py-3.5">Tool calls</th><th className="px-4 py-3.5">Duration</th><th className="px-4 py-3.5">Failure class</th><th className="px-4 py-3.5">Created at</th><th className="px-5 py-3.5 text-right">View</th></tr></thead><tbody>{filteredRuns.map((run) => { const counts = callCounts(run); const highlighted = run.status === "failed" && run.agentName.toLowerCase().includes("supportrefund"); return <tr key={run.id} className={`group border-b border-white/[0.05] last:border-0 hover:bg-white/[0.025] ${highlighted ? "bg-red-500/[0.045] shadow-[inset_3px_0_0_rgba(248,113,113,0.75)]" : ""}`}><td className="px-5 py-4"><Link href={`/runs/${run.id}`} className="font-mono text-xs text-slate-300 transition-colors hover:text-violet-300">{run.id}</Link>{highlighted ? <span className="mt-1 inline-flex items-center gap-1 rounded bg-red-400/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-red-300"><AlertTriangle size={10} /> highlighted fault</span> : null}</td><td className="px-4 py-4"><p className="text-xs font-medium text-slate-300">{run.agentName}</p><p className="mt-1 font-mono text-[10px] text-slate-600">v{run.agentVersion}</p></td><td className="max-w-[270px] px-4 py-4"><p className="truncate text-xs text-slate-400" title={run.taskSummary ?? "No task summary recorded"}>{run.taskSummary ?? "No task summary recorded"}</p></td><td className="px-4 py-4"><RunStatusBadge status={run.status} /></td><td className="px-4 py-4 font-mono text-xs text-slate-400">{run.steps ? counts.llm : "—"}</td><td className="px-4 py-4 font-mono text-xs text-slate-400">{run.steps ? counts.tools : "—"}</td><td className="px-4 py-4 font-mono text-xs text-slate-400">{formatDuration(run.durationMs)}</td><td className="px-4 py-4 text-xs text-slate-500">{formatFailureClass(run.failureClass)}</td><td className="px-4 py-4 text-xs text-slate-500" title={formatDate(run.createdAt)}>{formatRelativeDate(run.createdAt)}</td><td className="px-5 py-4 text-right"><Link href={`/runs/${run.id}`} aria-label={`View ${run.id}`} className="inline-flex rounded p-1.5 text-slate-600 transition-colors hover:bg-white/[0.07] hover:text-violet-300"><ArrowRight size={15} /></Link></td></tr>; })}</tbody></table></div>
          <div className="flex items-center justify-between border-t border-white/[0.06] px-5 py-3 text-[11px] text-slate-600"><span>Showing {filteredRuns.length} of {runs.length} runs</span><span className="flex items-center gap-1.5"><CheckCircle2 size={12} className="text-emerald-400" /> Live data</span></div>
        </Card>}
      </section>
    </div>
  </AppShell>;
}
