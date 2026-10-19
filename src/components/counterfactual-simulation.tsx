"use client";

import { AlertCircle, AlertTriangle, CheckCircle2, ChevronRight, GitBranch, Info, LoaderCircle, Network, Play, RotateCcw, ShieldCheck, XCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TraceGraph } from "@/lib/trace-graph";
import {
  guardrailTypes,
  simulateCounterfactual,
  type CounterfactualSimulationResult,
  type GuardrailConfig,
  type GuardrailType,
  type StepChangeKind
} from "@/lib/counterfactual-simulation";
import type { EvidenceReference } from "@/lib/diagnosis-types";
import type { RunRecord, TraceStep } from "@/types/trace";
import { cn } from "@/lib/utils";

type SimulationState = "not-started" | "running" | "completed" | "insufficient_evidence" | "not_applicable" | "failed";

interface CounterfactualSimulationProps {
  run: RunRecord;
  steps: TraceStep[];
  graph: TraceGraph;
  onViewTimeline: (nodeId: string) => void;
  onViewGraph: (nodeId: string) => void;
}

const guardrails: { kind: GuardrailType; label: string; description: string }[] = [
  { kind: "disambiguation", label: "Disambiguation", description: "Pause when multiple records match before selecting one." },
  { kind: "confirmation", label: "Customer confirmation", description: "Require confirmation immediately before a refund side effect." },
  { kind: "eligibility_amount_validation", label: "Eligibility / amount validation", description: "Compare a refund amount with a configured or recorded policy threshold." },
  { kind: "human_approval", label: "Human approval", description: "Pause above the threshold until an approval record is present." }
];

function safeText(value: unknown, fallback = "Not recorded") {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function safeJson(value: unknown) {
  try {
    const serialized = JSON.stringify(value, null, 2);
    return serialized === undefined ? "Not recorded" : serialized;
  } catch {
    return "Value could not be displayed safely.";
  }
}

function statusLabel(state: SimulationState) {
  return {
    "not-started": "Not started",
    running: "Running deterministic replay",
    completed: "Completed",
    insufficient_evidence: "Insufficient evidence",
    not_applicable: "Not applicable",
    failed: "Configuration error"
  }[state];
}

function statusTone(state: SimulationState) {
  if (state === "completed") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-300";
  if (state === "running") return "border-violet-400/25 bg-violet-400/10 text-violet-300";
  if (state === "insufficient_evidence" || state === "failed") return "border-red-400/25 bg-red-400/10 text-red-300";
  return "border-amber-400/25 bg-amber-400/10 text-amber-300";
}

function ChangeBadge({ change }: { change: StepChangeKind }) {
  const tone = change === "unchanged" ? "border-slate-500/30 bg-slate-500/10 text-slate-400" : change === "not_executed_in_simulation" ? "border-amber-400/25 bg-amber-400/10 text-amber-300" : change === "introduced" ? "border-cyan-400/25 bg-cyan-400/10 text-cyan-300" : "border-violet-400/25 bg-violet-400/10 text-violet-300";
  return <span className={cn("rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide", tone)}>{change.replaceAll("_", " ")}</span>;
}

function matchingStep(reference: EvidenceReference, steps: TraceStep[]) {
  return steps.filter((step) => step.step_id === reference.step_id)[reference.occurrence] ?? null;
}

function nodeForReference(reference: EvidenceReference, steps: TraceStep[], graph: TraceGraph) {
  const step = matchingStep(reference, steps);
  return step ? graph.nodes.find((node) => node.data.step.stepIndex === step.stepIndex) ?? null : null;
}

function EvidenceLink({ reference, steps, graph, onViewTimeline, onViewGraph }: { reference: EvidenceReference; steps: TraceStep[]; graph: TraceGraph; onViewTimeline: (nodeId: string) => void; onViewGraph: (nodeId: string) => void }) {
  const step = matchingStep(reference, steps);
  const node = nodeForReference(reference, steps, graph);
  return <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0"><p className="break-all font-mono text-[10px] text-slate-500">{safeText(reference.step_id)} · occurrence {reference.occurrence}</p><p className="mt-1 text-xs font-semibold text-slate-200">{safeText(step?.title, "Referenced step unavailable")}</p></div>
      <span className="rounded border border-cyan-400/20 bg-cyan-400/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-cyan-300">Recorded evidence</span>
    </div>
    {node ? <div className="mt-3 flex flex-wrap gap-2"><Button type="button" variant="ghost" size="sm" onClick={() => onViewTimeline(node.id)}><GitBranch size={13} /> View timeline</Button><Button type="button" variant="ghost" size="sm" onClick={() => onViewGraph(node.id)}><Network size={13} /> View graph</Button></div> : <p className="mt-2 text-[10px] text-amber-300">This reference is unavailable in the current trace.</p>}
  </div>;
}

function StatusIcon({ state }: { state: SimulationState }) {
  if (state === "running") return <LoaderCircle size={12} className="animate-spin" />;
  if (state === "completed") return <CheckCircle2 size={12} />;
  if (state === "insufficient_evidence" || state === "failed") return <AlertCircle size={12} />;
  return <AlertTriangle size={12} />;
}

function runOutcome(run: RunRecord) {
  if (typeof run.output === "string") return run.output;
  if (run.output && typeof run.output === "object") {
    const output = run.output as Record<string, unknown>;
    for (const key of ["customerImpact", "finalOutcome", "answer", "message", "status"]) if (typeof output[key] === "string") return output[key];
    return safeJson(run.output);
  }
  return run.error?.message ?? "No final outcome recorded";
}

function Comparison({ run, result, steps, graph, onViewTimeline, onViewGraph }: { run: RunRecord; result: CounterfactualSimulationResult; steps: TraceStep[]; graph: TraceGraph; onViewTimeline: (nodeId: string) => void; onViewGraph: (nodeId: string) => void }) {
  return <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2">
      <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-4"><p className="text-[10px] uppercase tracking-wider text-slate-500">Original recorded outcome</p><p className="mt-2 text-sm font-semibold text-slate-200">{safeText(runOutcome(run))}</p><p className="mt-1 text-xs leading-5 text-slate-400">Run status: {safeText(run.status)}. The original trace is never modified.</p></div>
       <div className="rounded-lg border border-violet-400/20 bg-violet-400/[0.05] p-4"><p className="text-[10px] uppercase tracking-wider text-violet-300">Counterfactual simulated outcome</p><p className="mt-2 text-sm font-semibold text-slate-200">{safeText(result.simulated_outcome?.summary, "Outcome is unresolved")}</p><p className="mt-1 text-xs leading-5 text-slate-400">Status: {safeText(result.simulated_outcome?.status, "unresolved")} · support: {safeText(result.simulated_outcome?.support, "observed")}. No tool or side effect was executed.</p></div>
    </div>
    <section><h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400"><ChevronRight size={13} className="text-violet-300" /> Original vs simulated steps</h3><div className="mt-2 overflow-x-auto rounded-lg border border-white/[0.07]"><table className="w-full min-w-[760px] text-left text-xs"><thead className="border-b border-white/[0.07] bg-white/[0.025] text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2">Recorded step</th><th className="px-3 py-2">Change</th><th className="px-3 py-2">Simulated state</th><th className="px-3 py-2">Evidence</th></tr></thead><tbody>{result.step_changes.map((change, index) => <ComparisonRow key={`${change.step_ref.step_id}-${change.step_ref.occurrence}-${index}`} change={change} steps={steps} graph={graph} onViewTimeline={onViewTimeline} onViewGraph={onViewGraph} />)}</tbody></table></div></section>
  </div>;
}

function ComparisonRow({ change, steps, graph, onViewTimeline, onViewGraph }: { change: CounterfactualSimulationResult["step_changes"][number]; steps: TraceStep[]; graph: TraceGraph; onViewTimeline: (nodeId: string) => void; onViewGraph: (nodeId: string) => void }) {
  const original = change.original_step;
  const simulated = change.simulated_step;
  const node = nodeForReference(change.step_ref, steps, graph);
  return <tr className="border-b border-white/[0.05] align-top last:border-0"><td className="px-3 py-3"><p className="font-medium text-slate-200">{safeText(original?.title, simulated && "title" in simulated ? simulated.title : "Introduced guardrail")}</p><p className="mt-1 break-all font-mono text-[10px] text-slate-500">{safeText(change.step_ref.step_id)} · occurrence {change.step_ref.occurrence}</p></td><td className="px-3 py-3"><ChangeBadge change={change.change} /><p className="mt-2 max-w-[300px] leading-5 text-slate-400">{safeText(change.explanation)}</p></td><td className="px-3 py-3"><span className="capitalize text-slate-300">{safeText(simulated?.status, "Not executed")}</span>{simulated?.output !== undefined ? <pre className="mt-2 max-w-[260px] whitespace-pre-wrap break-words rounded bg-black/20 p-2 font-mono text-[10px] text-slate-500">{safeJson(simulated.output)}</pre> : null}</td><td className="px-3 py-3">{node ? <div className="flex flex-col items-start gap-1"><Button type="button" variant="ghost" size="sm" onClick={() => onViewTimeline(node.id)}><GitBranch size={12} /> Timeline</Button><Button type="button" variant="ghost" size="sm" onClick={() => onViewGraph(node.id)}><Network size={12} /> Graph</Button></div> : <span className="text-[10px] text-slate-600">Introduced step</span>}</td></tr>;
}

function BulletSection({ title, items, tone = "default" }: { title: string; items: string[]; tone?: "default" | "amber" }): ReactNode {
  return <section><h3 className={cn("text-xs font-semibold uppercase tracking-[0.12em]", tone === "amber" ? "text-amber-300" : "text-slate-400")}>{title}</h3>{items.length ? <ul className="mt-2 space-y-2 text-xs leading-5 text-slate-400">{items.map((item, index) => <li key={`${item}-${index}`} className="flex gap-2"><span className={cn("mt-2 h-1 w-1 shrink-0 rounded-full", tone === "amber" ? "bg-amber-300" : "bg-violet-300")} />{safeText(item)}</li>)}</ul> : <p className="mt-2 text-xs text-slate-500">None recorded.</p>}</section>;
}

export function CounterfactualSimulation({ run, steps, graph, onViewTimeline, onViewGraph }: CounterfactualSimulationProps) {
  const [selectedGuardrail, setSelectedGuardrail] = useState<GuardrailType>(guardrailTypes[0]);
  const [minCandidates, setMinCandidates] = useState("2");
  const [threshold, setThreshold] = useState("");
  const [currency, setCurrency] = useState("");
  const [state, setState] = useState<SimulationState>("not-started");
  const [result, setResult] = useState<CounterfactualSimulationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current); }, []);

  const selected = useMemo(() => guardrails.find((guardrail) => guardrail.kind === selectedGuardrail) ?? guardrails[0], [selectedGuardrail]);
  const needsThreshold = selectedGuardrail === "eligibility_amount_validation" || selectedGuardrail === "human_approval";

  const chooseGuardrail = (kind: GuardrailType) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setSelectedGuardrail(kind);
    setResult(null);
    setError(null);
    setState("not-started");
  };

  const startSimulation = () => {
    setState("running");
    setError(null);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      try {
        const config: GuardrailConfig = { kind: selectedGuardrail };
        if (selectedGuardrail === "disambiguation") config.min_candidates = Number(minCandidates || 2);
        if (needsThreshold && threshold.trim()) config.threshold = Number(threshold);
        if (needsThreshold && currency.trim()) config.currency = currency.trim().toUpperCase();
        const simulation = simulateCounterfactual({ steps, source_run_id: run.id, guardrail: config });
        setResult(simulation);
        setState(simulation.status);
      } catch (cause) {
        setResult(null);
        setError(cause instanceof Error ? cause.message : "The simulation configuration could not be evaluated.");
        setState("failed");
      }
    }, 0);
  };

  return <div className="space-y-4">
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-white/[0.06] pb-4"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><CardTitle className="flex items-center gap-2"><ShieldCheck size={15} className="text-violet-300" /> Counterfactual Simulation</CardTitle><p className="mt-1 text-xs leading-5 text-slate-500">Deterministic, read-only replay of recorded evidence. This is a counterfactual comparison, not a live run and not proof of causation.</p></div><span className={cn("inline-flex w-fit items-center gap-1.5 rounded border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide", statusTone(state))}><StatusIcon state={state} /> {statusLabel(state)}</span></div>
        <div className="mt-4 rounded-lg border border-blue-400/15 bg-blue-400/[0.04] p-3 text-xs leading-5 text-blue-100/75"><p className="flex items-center gap-2 font-semibold text-blue-200"><Info size={14} /> Safe simulation boundary</p><p className="mt-1">The engine reads the recorded steps, introduces one selected guardrail, and compares the resulting path. It does not call tools, change the run, persist results, or claim that an unrecorded event did not happen.</p></div>
      </CardHeader>
      <CardContent className="space-y-5 pt-5">
        <fieldset><legend className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Select one guardrail</legend><div className="mt-3 grid gap-2 md:grid-cols-2">{guardrails.map((guardrail) => <label key={guardrail.kind} className={cn("cursor-pointer rounded-lg border p-3 transition-colors", selectedGuardrail === guardrail.kind ? "border-violet-300/60 bg-violet-400/[0.08]" : "border-white/[0.07] bg-white/[0.02] hover:border-white/15")}><span className="flex items-start gap-3"><input type="radio" name="counterfactual-guardrail" value={guardrail.kind} checked={selectedGuardrail === guardrail.kind} onChange={() => chooseGuardrail(guardrail.kind)} className="mt-1 accent-violet-400" /><span><span className="block text-sm font-medium text-slate-200">{guardrail.label}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{guardrail.description}</span></span></span></label>)}</div></fieldset>
        {selectedGuardrail === "disambiguation" ? <div className="max-w-sm"><label htmlFor="min-candidates" className="text-xs font-medium text-slate-300">Minimum matching candidates</label><Input id="min-candidates" type="number" min={2} step={1} value={minCandidates} onChange={(event) => setMinCandidates(event.target.value)} className="mt-2" /><p className="mt-1 text-[10px] text-slate-500">The default is 2. This setting is a simulation assumption.</p></div> : null}
        {needsThreshold ? <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px]"><div><label htmlFor="amount-threshold" className="text-xs font-medium text-slate-300">Policy amount threshold</label><Input id="amount-threshold" type="number" min={0} step="any" placeholder="Use recorded threshold" value={threshold} onChange={(event) => setThreshold(event.target.value)} className="mt-2" /><p className="mt-1 text-[10px] text-slate-500">Leave blank to use a threshold recorded in the trace, if available.</p></div><div><label htmlFor="amount-currency" className="text-xs font-medium text-slate-300">Currency (optional)</label><Input id="amount-currency" maxLength={3} placeholder="USD" value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} className="mt-2 uppercase" /></div></div> : null}
        <div className="flex flex-wrap items-center gap-2"><Button type="button" onClick={startSimulation} disabled={state === "running" || steps.length === 0}><Play size={14} /> {result ? "Rerun simulation" : "Start simulation"}</Button>{result ? <Button type="button" variant="secondary" onClick={startSimulation} disabled={state === "running"}><RotateCcw size={14} /> Rerun with current config</Button> : null}<span className="text-[10px] text-slate-500">{steps.length} recorded step{steps.length === 1 ? "" : "s"} · {safeText(selected.label)}</span></div>
        {steps.length === 0 ? <div className="rounded-lg border border-amber-400/20 bg-amber-400/[0.05] p-3 text-xs text-amber-100/80">No recorded steps are available, so the simulation cannot start.</div> : null}
        {state === "running" ? <div role="status" className="rounded-lg border border-violet-400/20 bg-violet-400/[0.05] p-3 text-xs text-violet-100/80"><LoaderCircle size={14} className="mr-2 inline animate-spin" />Evaluating the selected guardrail against the recorded trace…</div> : null}
        {error ? <div role="alert" className="rounded-lg border border-red-400/20 bg-red-400/[0.05] p-3 text-xs text-red-200/85"><XCircle size={14} className="mr-2 inline" />{safeText(error)}</div> : null}
      </CardContent>
    </Card>
    {result ? <Card><CardHeader className="border-b border-white/[0.06] pb-4"><CardTitle className="text-base">Simulation result</CardTitle><p className="mt-1 text-xs text-slate-500">Engine {safeText(result.engine_version)} · source fingerprint {safeText(result.source_fingerprint).slice(0, 16)}… · one guardrail selected</p></CardHeader><CardContent className="space-y-6 pt-5"><Comparison run={run} result={result} steps={steps} graph={graph} onViewTimeline={onViewTimeline} onViewGraph={onViewGraph} />
      {result.intervention_point ? <section><h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Intervention point</h3><div className="mt-2 rounded-lg border border-violet-400/20 bg-violet-400/[0.05] p-3"><p className="text-sm font-semibold text-slate-200">Before {safeText(result.intervention_point.step_ref.step_id)} · occurrence {result.intervention_point.step_ref.occurrence}</p><p className="mt-1 text-xs leading-5 text-slate-400">{safeText(result.intervention_point.reason)}</p><div className="mt-3 flex flex-wrap gap-2">{nodeForReference(result.intervention_point.step_ref, steps, graph) ? <><Button type="button" variant="secondary" size="sm" onClick={() => { const node = nodeForReference(result.intervention_point!.step_ref, steps, graph); if (node) onViewTimeline(node.id); }}><GitBranch size={13} /> View timeline</Button><Button type="button" variant="secondary" size="sm" onClick={() => { const node = nodeForReference(result.intervention_point!.step_ref, steps, graph); if (node) onViewGraph(node.id); }}><Network size={13} /> View graph</Button></> : null}</div></div></section> : null}
       <section><h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Simulation rationale and divergence</h3><div className="mt-2 space-y-3">{result.divergence_evidence.length ? result.divergence_evidence.map((explanation, index) => <div key={`${explanation.statement}-${index}`} className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3"><div className="flex flex-wrap items-start justify-between gap-2"><p className="text-xs leading-5 text-slate-300">{safeText(explanation.statement)}</p><span className="rounded border border-slate-500/30 bg-slate-500/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-slate-400">{safeText(explanation.support)}</span></div>{explanation.evidence_refs.length ? <div className="mt-2 space-y-2">{explanation.evidence_refs.map((reference, referenceIndex) => <EvidenceLink key={`${reference.step_id}-${reference.occurrence}-${referenceIndex}`} reference={reference} steps={steps} graph={graph} onViewTimeline={onViewTimeline} onViewGraph={onViewGraph} />)}</div> : null}</div>) : <p className="text-xs text-slate-500">No rationale was recorded.</p>}</div></section>
      <div className="grid gap-5 lg:grid-cols-3"><BulletSection title="Assumptions" items={result.assumptions} /><BulletSection title="Missing evidence" items={result.missing_evidence} tone="amber" /><BulletSection title="Limitations" items={result.limitations} tone="amber" /></div>
      {result.warnings.length ? <BulletSection title="Warnings" items={result.warnings} tone="amber" /> : null}
      <section><h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Evidence used</h3><div className="mt-2 space-y-2">{result.evidence_refs.length ? result.evidence_refs.map((reference, index) => <EvidenceLink key={`${reference.step_id}-${reference.occurrence}-${index}`} reference={reference} steps={steps} graph={graph} onViewTimeline={onViewTimeline} onViewGraph={onViewGraph} />) : <p className="text-xs text-slate-500">No supporting evidence references recorded.</p>}</div></section>
      <section><h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Proposed regression tests</h3><p className="mt-1 text-[10px] text-amber-300">Proposed only · not executed</p><div className="mt-2 space-y-2">{result.proposed_regression_tests.length ? result.proposed_regression_tests.map((test) => <div key={test.id} className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3"><div className="flex flex-wrap items-start justify-between gap-2"><p className="text-xs font-semibold text-slate-200">{safeText(test.scenario)}</p><span className="rounded border border-amber-400/25 bg-amber-400/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-amber-300">Not executed</span></div><p className="mt-2 text-xs leading-5 text-slate-400"><span className="text-slate-500">Expected: </span>{safeText(test.expected_behavior)}</p><ul className="mt-2 space-y-1 text-[11px] text-slate-500">{test.proposed_assertions.map((assertion, index) => <li key={index}>• {safeText(assertion)}</li>)}</ul></div>) : <p className="text-xs text-slate-500">No applicable test was proposed for this trace.</p>}</div></section>
      <p className="text-[10px] leading-5 text-slate-500">The original trace remains the source of truth. Simulated statuses and introduced steps are labeled counterfactual and are not persisted.</p>
    </CardContent></Card> : null}
  </div>;
}
