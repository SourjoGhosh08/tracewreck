"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowLeft, Brain, Check, Circle, Cpu, GitBranch, Network, RefreshCw, Upload, XCircle } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { JsonViewer } from "@/components/json-viewer";
import { RunStatusBadge } from "@/components/run-status-badge";
import { RunSourceBadge } from "@/components/run-source-badge";
import { RootCauseReport } from "@/components/root-cause-report";
import { CounterfactualSimulation } from "@/components/counterfactual-simulation";
import { TraceGraphView } from "@/components/trace-graph-view";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { RunRecord, TraceStep } from "@/types/trace";
import { cn, formatDuration } from "@/lib/utils";
import { buildTraceGraph } from "@/lib/trace-graph";

const nextPhaseTabs = [
  { value: "root-cause", label: "Root-Cause Report" },
  { value: "counterfactual", label: "Counterfactual Simulation" }
];

function describeTask(input: unknown) {
  if (typeof input === "string") return input;
  if (input && typeof input === "object") {
    const record = input as Record<string, unknown>;
    for (const key of ["message", "task", "request", "prompt", "query", "reason"]) {
      if (typeof record[key] === "string") return record[key] as string;
    }
    return JSON.stringify(input);
  }
  return "No task recorded";
}

function describeOutcome(run: RunRecord) {
  if (run.output && typeof run.output === "object") {
    const output = run.output as Record<string, unknown>;
    for (const key of ["customerImpact", "finalOutcome", "answer", "review", "message", "status"]) {
      if (typeof output[key] === "string") return output[key] as string;
    }
    return JSON.stringify(run.output);
  }
  if (typeof run.output === "string") return run.output;
  if (run.error) return run.error.message;
  return "No final outcome recorded";
}

function isFirstFault(step: TraceStep) {
  return step.is_first_faulty_step ?? step.isFirstFaultyStep;
}

function stepTone(step: TraceStep) {
  if (isFirstFault(step) || step.status === "failed" || step.type === "error") return "red";
  if (step.status === "warning" || step.status === "skipped") return "yellow";
  if (step.type === "retrieval") return "purple";
  if (step.type === "model_call" || step.type === "agent_plan") return "blue";
  if (step.type === "tool_call" || step.type === "tool_result") return "orange";
  if (step.type === "user_request") return "blue";
  return "green";
}

const toneClasses = {
  green: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
  yellow: "border-yellow-400/20 bg-yellow-400/10 text-yellow-300",
  red: "border-red-400/30 bg-red-400/10 text-red-300",
  blue: "border-blue-400/20 bg-blue-400/10 text-blue-300",
  purple: "border-purple-400/20 bg-purple-400/10 text-purple-300",
  orange: "border-orange-400/20 bg-orange-400/10 text-orange-300"
};

function stepTokens(step: TraceStep) {
  const usage = step.token_usage ?? step.tokenUsage;
  if (typeof usage === "number") return usage.toLocaleString();
  if (usage) {
    if (usage.total !== undefined) return usage.total.toLocaleString();
    if (usage.input !== undefined || usage.output !== undefined) return ((usage.input ?? 0) + (usage.output ?? 0)).toLocaleString();
  }
  return "Not recorded";
}

function TimelineStep({ step, graphNodeId, selected, onViewGraph }: { step: TraceStep; graphNodeId: string | null; selected: boolean; onViewGraph: (nodeId: string) => void }) {
  const tone = toneClasses[stepTone(step)];
  const firstFault = isFirstFault(step);
  const riskScore = step.risk_score ?? step.riskScore;
  const Icon = firstFault || step.status === "error" || step.status === "failed" ? XCircle : step.type === "model_call" || step.type === "agent_plan" ? Brain : step.type === "tool_call" || step.type === "tool_result" ? Cpu : step.type === "final_response" ? Check : Circle;

  return <li id={graphNodeId ? `timeline-step-${encodeURIComponent(graphNodeId)}` : undefined} className="relative flex gap-3 pb-6 last:pb-0 sm:gap-4">
    <span className={cn("relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border", tone)}><Icon size={15} /></span>
    <article className={cn("min-w-0 flex-1 rounded-lg border border-white/[0.07] bg-white/[0.015] p-4", selected && "border-violet-300/60 bg-violet-400/[0.06] ring-1 ring-violet-300/40", (firstFault || step.status === "failed") && "border-red-400/25 bg-red-400/[0.04]")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-slate-500">Title</p>
          <h3 className="text-sm font-medium text-slate-200">{step.name}</h3>
          {step.tool ? <p className="mt-1 break-all font-mono text-[11px] text-orange-300/70">{step.tool}</p> : null}
        </div>
        {firstFault ? <span className="rounded-md border border-red-400/30 bg-red-400/15 px-2 py-1 text-[10px] font-bold text-red-300">Demo fixture annotation</span> : null}
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs sm:grid-cols-3 xl:grid-cols-4">
        <div className="col-span-2"><dt className="text-[10px] uppercase tracking-wide text-slate-500">Step ID</dt><dd className="mt-1 break-all font-mono text-slate-400">{step.id}</dd></div>
        <div><dt className="text-[10px] uppercase tracking-wide text-slate-500">Event type</dt><dd className="mt-1"><span className={cn("inline-flex rounded border px-1.5 py-0.5 font-mono text-[11px]", tone)}>{step.type}</span></dd></div>
         <div><dt className="text-[10px] uppercase tracking-wide text-slate-500">Status</dt><dd className={cn("mt-1 inline-flex rounded border px-1.5 py-0.5 text-[11px] capitalize", step.status === "error" || step.status === "failed" ? toneClasses.red : step.status === "warning" || step.status === "skipped" ? toneClasses.yellow : toneClasses.green)}>{step.status}</dd></div>
        <div className="col-span-2"><dt className="text-[10px] uppercase tracking-wide text-slate-500">Timestamp</dt><dd className="mt-1 text-slate-400"><time dateTime={step.startedAt} title={step.startedAt}>{step.startedAt}</time></dd></div>
        <div><dt className="text-[10px] uppercase tracking-wide text-slate-500">Risk score</dt><dd className="mt-1 font-mono text-slate-400">{riskScore === null || riskScore === undefined ? "Not recorded" : String(riskScore)}</dd></div>
        <div><dt className="text-[10px] uppercase tracking-wide text-slate-500">Latency</dt><dd className="mt-1 font-mono text-slate-400">{formatDuration(step.durationMs)}</dd></div>
        <div><dt className="text-[10px] uppercase tracking-wide text-slate-500">Token usage</dt><dd className="mt-1 font-mono text-slate-400">{stepTokens(step)}</dd></div>
      </dl>
      {step.error ? <div className="mt-4 rounded-md border border-red-400/15 bg-red-400/[0.05] p-3"><div className="flex items-center gap-2 text-xs font-semibold text-red-300"><AlertCircle size={13} /> {step.error.code}</div><p className="mt-1 text-xs leading-5 text-red-200/70">{step.error.message}</p></div> : null}
       <div className="mt-4 flex flex-wrap items-center justify-between gap-2"><p className="text-[10px] text-slate-500">Recorded evidence · no causal inference</p>{graphNodeId ? <Button type="button" variant="ghost" size="sm" onClick={() => onViewGraph(graphNodeId)}><GitBranch size={13} /> View in graph</Button> : null}</div>
       <div className="mt-3 grid gap-3 lg:grid-cols-2"><JsonViewer label="Input JSON" value={step.input ?? null} /><JsonViewer label="Output JSON" value={step.output ?? null} /></div>
    </article>
  </li>;
}

export default function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [run, setRun] = useState<RunRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("timeline");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const loadRun = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/runs/${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!response.ok) throw new Error(response.status === 404 ? "This run does not exist." : "Unable to load this run.");
      const payload = (await response.json()) as { run: RunRecord; steps: TraceStep[] };
      setRun({ ...payload.run, steps: [...payload.steps].sort((left, right) => left.stepIndex - right.stepIndex) });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load this run.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void loadRun(); }, [loadRun]);

  const graph = useMemo(() => buildTraceGraph(run?.steps ?? [], { inferExecutionOrder: true }), [run?.steps]);

  useEffect(() => {
    if (activeTab !== "timeline" || !selectedNodeId) return;
    const timer = window.setTimeout(() => {
      document.getElementById(`timeline-step-${encodeURIComponent(selectedNodeId)}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeTab, selectedNodeId]);

  const graphNodeIdForStep = (step: TraceStep) => {
    // stepIndex is the normalized occurrence identity. It is intentionally
    // preferred over the recorded ID because duplicate step IDs are retained
    // as separate graph nodes.
    return graph.nodes.find((node) => node.data.step.stepIndex === step.stepIndex)?.id ?? null;
  };

  const viewInGraph = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    setActiveTab("decision-graph");
  };

  const viewInTimeline = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    setActiveTab("timeline");
  };

  if (loading) return <AppShell><div className="space-y-6" role="status" aria-label="Loading run"><Skeleton className="h-5 w-24" /><Skeleton className="h-52 w-full" /><Skeleton className="h-9 w-full" /><Skeleton className="h-[420px]" /></div></AppShell>;
  if (error || !run) return <AppShell><EmptyState title="Run unavailable" description={error ?? "This run does not exist."} action={<div className="flex gap-2"><Link href="/app" className="inline-flex h-9 items-center gap-2 rounded-md border border-white/10 px-3 text-xs text-slate-300"><ArrowLeft size={14} /> Back to runs</Link><Button onClick={() => void loadRun()}><RefreshCw size={14} /> Try again</Button></div>} /></AppShell>;

  return <AppShell><div className="space-y-6">
    <div className="flex items-center justify-between gap-4"><Link href="/app" className="inline-flex items-center gap-2 text-xs font-medium text-slate-500 transition-colors hover:text-slate-200"><ArrowLeft size={14} /> Back to all runs</Link><Button variant="ghost" size="sm" onClick={() => void loadRun()}><RefreshCw size={14} /> Refresh</Button></div>
    <Card className="overflow-hidden">
      <div className="border-b border-white/[0.07] bg-gradient-to-r from-violet-500/[0.08] via-transparent to-transparent p-6 sm:p-7">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
           <div className="min-w-0"><div className="mb-2 flex flex-wrap items-center gap-2"><p className="text-[10px] uppercase tracking-[0.15em] text-slate-500">Agent name</p><RunSourceBadge source={run.source} /></div><h1 className="text-2xl font-semibold tracking-tight text-slate-100">{run.agentName}</h1><p className="mt-1 break-all font-mono text-[11px] text-slate-500">{run.id}</p></div>
          <div><p className="mb-2 text-[10px] uppercase tracking-[0.15em] text-slate-500">Status</p><RunStatusBadge status={run.status} /></div>
        </div>
        <div className="mt-5"><p className="text-[10px] uppercase tracking-wider text-slate-500">Task</p><p className="mt-1 text-sm leading-6 text-slate-300">{describeTask(run.input)}</p></div>
        <div className="mt-4"><p className="text-[10px] uppercase tracking-wider text-slate-500">Final outcome</p><p className={cn("mt-1 text-sm leading-6 text-slate-400", run.status === "failed" && "text-red-200/80")}>{describeOutcome(run)}</p></div>
      </div>
      <dl className="grid gap-4 p-5 sm:grid-cols-3 sm:px-7">
        <div><dt className="text-[10px] uppercase tracking-wider text-slate-500">Model</dt><dd className="mt-1 font-mono text-sm text-slate-300">{run.model}</dd></div>
        <div><dt className="text-[10px] uppercase tracking-wider text-slate-500">Duration</dt><dd className="mt-1 font-mono text-sm text-slate-300">{formatDuration(run.durationMs)}</dd></div>
        <div><dt className="text-[10px] uppercase tracking-wider text-slate-500">Token usage</dt><dd className="mt-1 font-mono text-sm text-slate-300">{run.totalTokens.toLocaleString()} total</dd><dd className="mt-1 text-[11px] text-slate-500">{run.promptTokens.toLocaleString()} input · {run.completionTokens.toLocaleString()} output</dd></div>
      </dl>
     </Card>
     {run.source === "imported" ? <div role="status" className="flex items-start gap-3 rounded-lg border border-sky-400/20 bg-sky-400/[0.05] p-4 text-xs text-sky-100/80"><Upload size={15} className="mt-0.5 shrink-0 text-sky-300" aria-hidden="true" /><div><p className="font-semibold text-sky-200">Imported trace</p><p className="mt-1 leading-5">This workspace is showing recorded evidence from the imported payload. Demo fixture annotations are not applied, and diagnosis only runs when you explicitly start it.</p></div></div> : null}
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <div className="overflow-x-auto pb-1"><TabsList className="min-w-max"><TabsTrigger value="timeline">Timeline</TabsTrigger><TabsTrigger value="decision-graph">Decision Graph</TabsTrigger>{nextPhaseTabs.map((tab) => <TabsTrigger key={tab.value} value={tab.value}>{tab.label}</TabsTrigger>)}</TabsList></div>
      <TabsContent value="timeline" className="mt-5">
        {run.steps.length === 0 ? <EmptyState title="No trace steps" description="This run has no recorded timeline events." /> : <Card>
           <CardHeader className="border-b border-white/[0.06] pb-4"><CardTitle className="flex items-center gap-2"><GitBranch size={15} className="text-violet-300" /> Timeline</CardTitle><p className="text-xs text-slate-500">{run.steps.length} normalized trace steps · synthetic fixture annotations are explicitly marked</p><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-500"><span className="text-emerald-300">Green: success</span><span className="text-yellow-300">Yellow: warning</span><span className="text-red-300">Red: error / fixture annotation</span><span className="text-blue-300">Blue: model call</span><span className="text-purple-300">Purple: retrieval</span><span className="text-orange-300">Orange: tool call</span></div></CardHeader>
           <CardContent className="relative pt-6"><div className="absolute bottom-7 left-[35px] top-7 w-px bg-gradient-to-b from-white/10 via-white/[0.06] to-transparent" /><ol>{run.steps.map((step) => { const graphNodeId = graphNodeIdForStep(step); return <TimelineStep key={`${step.id}-${step.stepIndex}`} step={step} graphNodeId={graphNodeId} selected={graphNodeId === selectedNodeId} onViewGraph={viewInGraph} />; })}</ol></CardContent>
         </Card>}
      </TabsContent>
      <TabsContent value="decision-graph" className="mt-5"><Card><CardHeader className="border-b border-white/[0.06] pb-4"><CardTitle className="flex items-center gap-2"><Network size={15} className="text-violet-300" /> Decision Graph</CardTitle><p className="text-xs text-slate-500">{run.steps.length} recorded steps · parent relationships and optional inferred execution order</p></CardHeader><CardContent className="pt-5"><TraceGraphView graph={graph} selectedNodeId={selectedNodeId} onSelectNode={setSelectedNodeId} onViewTimeline={viewInTimeline} /></CardContent></Card></TabsContent>
      {nextPhaseTabs.map((tab) => tab.value === "root-cause"
        ? <TabsContent key={tab.value} value={tab.value} className="mt-5"><RootCauseReport run={run} steps={run.steps} graph={graph} onViewTimeline={viewInTimeline} onViewGraph={viewInGraph} /></TabsContent>
        : <TabsContent key={tab.value} value={tab.value} className="mt-5"><CounterfactualSimulation run={run} steps={run.steps} graph={graph} onViewTimeline={viewInTimeline} onViewGraph={viewInGraph} /></TabsContent>)}
    </Tabs>
  </div></AppShell>;
}
