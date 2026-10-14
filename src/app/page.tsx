"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, ArrowRight, Clock3, Coins, RefreshCw, Search, Terminal, Zap } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { RunStatusBadge } from "@/components/run-status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { RunRecord } from "@/types/trace";
import { formatCost, formatDuration, formatRelativeDate, formatTokens } from "@/lib/utils";

type Filter = "all" | "failed" | "completed";

export default function DashboardPage() {
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const loadRuns = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/runs", { cache: "no-store" });
      if (!response.ok) throw new Error("Unable to load runs");
      const payload = (await response.json()) as { runs: RunRecord[] };
      setRuns(payload.runs);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load runs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadRuns(); }, []);

  const filteredRuns = useMemo(() => runs.filter((run) => {
    const matchesStatus = filter === "all" || run.status === filter;
    const needle = query.toLowerCase().trim();
    return matchesStatus && (!needle || [run.id, run.agentName, run.model, run.status].some((value) => value.toLowerCase().includes(needle)));
  }), [filter, query, runs]);

  const failed = runs.filter((run) => run.status === "failed").length;
  const completed = runs.filter((run) => run.status === "completed").length;
  const avgDuration = runs.length ? runs.reduce((total, run) => total + run.durationMs, 0) / runs.length : 0;
  const totalCost = runs.reduce((total, run) => total + run.costUsd, 0);
  const totalTokens = runs.reduce((total, run) => total + run.totalTokens, 0);

  return <AppShell><div className="space-y-8">
    <section className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
      <div><div className="mb-3 flex items-center gap-2 text-xs font-medium text-violet-300"><Terminal size={14} /> OBSERVABILITY / RUNS</div><h1 className="text-3xl font-semibold tracking-tight text-slate-100 sm:text-4xl">Agent runs</h1><p className="mt-2 max-w-2xl text-sm text-slate-500">Inspect execution traces, understand failures, and find the first faulty step.</p></div>
      <Button variant="secondary" onClick={() => void loadRuns()} disabled={loading}><RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh data</Button>
    </section>

    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <MetricCard label="Total runs" value={loading ? "—" : String(runs.length)} detail="Across all agents" icon={Activity} />
      <MetricCard label="Failure rate" value={loading || !runs.length ? "—" : `${Math.round((failed / runs.length) * 100)}%`} detail={`${failed} failed · ${completed} completed`} icon={AlertTriangle} tone={failed ? "red" : "emerald"} />
      <MetricCard label="Avg. duration" value={loading ? "—" : formatDuration(Math.round(avgDuration))} detail="Per completed run" icon={Clock3} tone="amber" />
      <MetricCard label="Total cost" value={loading ? "—" : formatCost(totalCost)} detail={`${formatTokens(totalTokens)} tokens`} icon={Coins} />
    </section>

    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-base font-semibold text-slate-100">Recent runs</h2><p className="mt-1 text-xs text-slate-500">A chronological view of your agent executions.</p></div><div className="flex items-center gap-2"><div className="relative w-full sm:w-64"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search runs..." className="pl-9" /></div><div className="hidden h-9 items-center rounded-md border border-white/[0.08] bg-slate-950/60 p-1 sm:flex">{(["all", "failed", "completed"] as Filter[]).map((value) => <button type="button" key={value} onClick={() => setFilter(value)} className={`rounded px-2.5 py-1 text-[11px] font-medium capitalize transition-colors ${filter === value ? "bg-white/[0.09] text-slate-100" : "text-slate-500 hover:text-slate-300"}`}>{value}</button>)}</div></div></div>
      {error ? <EmptyState title="Could not load runs" description={error} action={<Button onClick={() => void loadRuns()}><RefreshCw size={14} /> Try again</Button>} /> : loading ? <Card className="overflow-hidden"><div className="space-y-px">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="flex items-center gap-4 border-b border-white/[0.05] p-4"><Skeleton className="h-8 w-8" /><Skeleton className="h-4 w-40" /><Skeleton className="ml-auto h-4 w-20" /><Skeleton className="h-4 w-24" /></div>)}</div></Card> : filteredRuns.length === 0 ? <EmptyState title={runs.length ? "No matching runs" : "No runs yet"} description={runs.length ? "Try adjusting your search or status filter." : "Seed the database to start inspecting agent executions."} action={!runs.length ? <Button variant="secondary" onClick={() => void loadRuns()}><Zap size={14} /> Reload data</Button> : undefined} /> : <Card className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead className="border-b border-white/[0.07] bg-white/[0.02]"><tr className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600"><th className="px-5 py-3.5">Run</th><th className="px-4 py-3.5">Agent</th><th className="px-4 py-3.5">Status</th><th className="px-4 py-3.5">Duration</th><th className="px-4 py-3.5">Tokens</th><th className="px-4 py-3.5">Started</th><th className="px-5 py-3.5" /></tr></thead><tbody>{filteredRuns.map((run) => <tr key={run.id} className="group border-b border-white/[0.05] last:border-0 hover:bg-white/[0.025]"><td className="px-5 py-4"><Link href={`/runs/${run.id}`} className="font-mono text-xs text-slate-300 transition-colors hover:text-violet-300">{run.id}</Link><p className="mt-1 text-[10px] text-slate-600">{run.model}</p></td><td className="px-4 py-4"><p className="text-xs font-medium text-slate-300">{run.agentName}</p><p className="mt-1 font-mono text-[10px] text-slate-600">v{run.agentVersion}</p></td><td className="px-4 py-4"><RunStatusBadge status={run.status} /></td><td className="px-4 py-4 font-mono text-xs text-slate-400">{formatDuration(run.durationMs)}</td><td className="px-4 py-4 font-mono text-xs text-slate-400">{formatTokens(run.totalTokens)}</td><td className="px-4 py-4 text-xs text-slate-500">{formatRelativeDate(run.startedAt)}</td><td className="px-5 py-4 text-right"><Link href={`/runs/${run.id}`} aria-label={`Open ${run.id}`} className="inline-flex rounded p-1.5 text-slate-600 transition-colors hover:bg-white/[0.07] hover:text-violet-300"><ArrowRight size={15} /></Link></td></tr>)}</tbody></table></div><div className="flex items-center justify-between border-t border-white/[0.06] px-5 py-3 text-[11px] text-slate-600"><span>Showing {filteredRuns.length} of {runs.length} runs</span><span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Live data</span></div></Card>}
    </section>
  </div></AppShell>;
}
