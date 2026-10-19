"use client";

import { AlertCircle, AlertTriangle, CheckCircle2, ClipboardCheck, FileSearch, LoaderCircle, RefreshCw, Sparkles, Target, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { TraceGraph } from "@/lib/trace-graph";
import type { RunRecord, TraceStep } from "@/types/trace";
import type { DiagnosisEnvelope, DiagnosisMetadata, DiagnosisReport, EvidenceReference } from "@/lib/diagnosis-types";
import { demoDiagnosisForRun } from "@/lib/diagnosis-demo";
import { cn } from "@/lib/utils";

export type ReportState = "not-analyzed" | "provider-not-configured" | "analyzing" | "completed" | "insufficient-evidence" | "failed-request";

interface RootCauseReportProps {
  run: RunRecord;
  steps: TraceStep[];
  graph: TraceGraph;
  onViewTimeline: (nodeId: string) => void;
  onViewGraph: (nodeId: string) => void;
}

const textLimit = 420;

function safe(value: unknown, fallback = "Not recorded") {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function SafeText({ value, fallback, className }: { value: unknown; fallback?: string; className?: string }) {
  const original = safe(value, fallback);
  const truncated = original.length > textLimit;
  const display = truncated ? `${original.slice(0, textLimit).trimEnd()}…` : original;
  return <span className={className} title={truncated ? "This text was truncated for display." : undefined}>{display}{truncated ? <span className="ml-1 text-[10px] uppercase tracking-wide text-amber-300">Truncated</span> : null}</span>;
}

function stateLabel(state: ReportState) {
  return { "not-analyzed": "Not analyzed", "provider-not-configured": "Provider not configured", analyzing: "Analyzing", completed: "Completed", "insufficient-evidence": "Insufficient evidence", "failed-request": "Failed request" }[state];
}

function stateTone(state: ReportState) {
  if (state === "completed") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-300";
  if (state === "analyzing") return "border-violet-400/25 bg-violet-400/10 text-violet-300";
  if (state === "failed-request" || state === "insufficient-evidence") return "border-red-400/25 bg-red-400/10 text-red-300";
  return "border-amber-400/25 bg-amber-400/10 text-amber-300";
}

function StateIcon({ state }: { state: ReportState }) {
  if (state === "completed") return <CheckCircle2 size={12} />;
  if (state === "analyzing") return <LoaderCircle size={12} className="animate-spin" />;
  if (state === "failed-request") return <XCircle size={12} />;
  if (state === "insufficient-evidence") return <AlertCircle size={12} />;
  return <AlertTriangle size={12} />;
}

function matchingStep(reference: EvidenceReference, steps: TraceStep[]) {
  const matches = steps.filter((step) => step.step_id === reference.step_id);
  return matches[reference.occurrence] ?? null;
}

function EvidenceLink({ reference, steps, graph, onViewTimeline, onViewGraph }: { reference: EvidenceReference; steps: TraceStep[]; graph: TraceGraph; onViewTimeline: (nodeId: string) => void; onViewGraph: (nodeId: string) => void }) {
  const step = matchingStep(reference, steps);
  const index = step ? steps.indexOf(step) : -1;
  const node = step ? graph.nodes.find((candidate) => candidate.data.step.stepIndex === step.stepIndex) : null;
  return <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
    <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="break-all font-mono text-[10px] text-slate-500">{reference.step_id} · occurrence {reference.occurrence}</p>{step ? <p className="mt-1 text-xs font-semibold text-slate-200"><SafeText value={step.title} /></p> : null}</div><span className="rounded border border-cyan-400/20 bg-cyan-400/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-cyan-300">Recorded evidence</span></div>
    {node ? <div className="mt-3 flex flex-wrap gap-2"><Button type="button" variant="ghost" size="sm" onClick={() => onViewTimeline(node.id)}><FileSearch size={13} /> View timeline · step {index + 1}</Button><Button type="button" variant="ghost" size="sm" onClick={() => onViewGraph(node.id)}><Target size={13} /> View graph</Button></div> : <p className="mt-2 text-[10px] text-amber-300">This referenced step is unavailable or ambiguous in the current trace.</p>}
  </div>;
}

export function RootCauseReport({ run, steps, graph, onViewTimeline, onViewGraph }: RootCauseReportProps) {
  const [state, setState] = useState<ReportState>("not-analyzed");
  const [envelope, setEnvelope] = useState<DiagnosisEnvelope | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const demoAvailable = Boolean(demoDiagnosisForRun(run, steps));

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/runs/${encodeURIComponent(run.id)}/diagnosis`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json() as { diagnosis?: DiagnosisReport; metadata?: DiagnosisMetadata; attempts?: number; cached?: boolean };
        if (!payload.diagnosis || !payload.metadata || cancelled) return;
        setEnvelope({ report: payload.diagnosis, metadata: payload.metadata, attempts: payload.attempts ?? 0, cached: payload.cached ?? true });
        setState(payload.diagnosis.analysis_status === "insufficient_evidence" ? "insufficient-evidence" : "completed");
      } catch { /* first visit has no stored diagnosis */ }
    })();
    return () => { cancelled = true; };
  }, [run.id]);

  const diagnose = (regenerate = false) => {
    setConfirmRegenerate(false);
    setRequestError(null);
    setState("analyzing");
    void (async () => {
      try {
        const response = await fetch(`/api/runs/${encodeURIComponent(run.id)}/diagnosis/start`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ regenerate }) });
        const payload = await response.json() as { code?: string; error?: string; request_id?: string; diagnosis?: DiagnosisReport; metadata?: DiagnosisMetadata; attempts?: number; cached?: boolean };
        if (!response.ok) {
          if (payload.code === "DIAGNOSIS_NOT_CONFIGURED") { setState("provider-not-configured"); return; }
          throw new Error(`${payload.error ?? "The diagnosis request could not be completed."}${payload.request_id ? ` (request ${payload.request_id})` : ""}`);
        }
        if (!payload.diagnosis || !payload.metadata) { setState("insufficient-evidence"); return; }
        setEnvelope({ report: payload.diagnosis, metadata: payload.metadata, attempts: payload.attempts ?? 1, cached: payload.cached ?? false });
        setState(payload.diagnosis.analysis_status === "insufficient_evidence" ? "insufficient-evidence" : "completed");
      } catch (error) {
        setRequestError(error instanceof Error ? error.message : "The diagnosis request could not be completed.");
        setState("failed-request");
      }
    })();
  };

  const loadDemo = () => {
    const demo = demoDiagnosisForRun(run, steps);
    if (!demo) return;
    setRequestError(null);
    setEnvelope(demo);
    setState("completed");
  };

  return <div className="space-y-4">
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-white/[0.06] pb-4"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><CardTitle className="flex items-center gap-2"><Sparkles size={15} className="text-violet-300" /> Root-Cause Report</CardTitle><p className="mt-1 text-xs leading-5 text-slate-500">A hypothesis supported by recorded evidence, not proof of causation. Diagnosis is read-only and never executes tools or agent actions.</p></div><span className={cn("inline-flex w-fit items-center gap-1.5 rounded border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide", stateTone(state))}><StateIcon state={state} /> {stateLabel(state)}</span></div>
        <div className="mt-4 flex flex-wrap gap-2"><Button type="button" onClick={() => diagnose(false)} disabled={state === "analyzing"}><Sparkles size={14} /> {state === "not-analyzed" ? "Diagnose run" : "Diagnose run"}</Button>{envelope?.metadata.source === "live_model" && state !== "analyzing" ? <Button type="button" variant="secondary" onClick={() => setConfirmRegenerate(true)}><RefreshCw size={14} /> Regenerate</Button> : null}{demoAvailable && envelope?.metadata.source !== "demo_fixture" ? <Button type="button" variant="secondary" onClick={loadDemo} disabled={state === "analyzing"}><ClipboardCheck size={14} /> Load demonstration report</Button> : null}</div>
        {confirmRegenerate ? <div role="alertdialog" aria-label="Confirm report regeneration" className="mt-3 rounded-lg border border-amber-400/25 bg-amber-400/[0.06] p-3 text-xs text-amber-100/85"><p className="font-semibold">Regenerate with another model request?</p><p className="mt-1 leading-5">This sends the recorded evidence to the configured provider again. It does not replay the agent or change the trace.</p><div className="mt-3 flex gap-2"><Button type="button" size="sm" onClick={() => diagnose(true)}><RefreshCw size={13} /> Confirm regeneration</Button><Button type="button" size="sm" variant="ghost" onClick={() => setConfirmRegenerate(false)}>Cancel</Button></div></div> : null}
      </CardHeader>
      <CardContent className="pt-5">{state === "not-analyzed" ? <StatusMessage icon={FileSearch} title="Not analyzed" description="Start a live model analysis, or load the clearly labeled demonstration report for the seeded refund scenario." /> : null}{state === "analyzing" ? <StatusMessage icon={LoaderCircle} title="Analyzing recorded trace" description="The server is preparing trusted trace evidence and waiting for the configured provider." spin /> : null}{state === "provider-not-configured" ? <StatusMessage icon={AlertTriangle} title="Provider not configured" description="Live diagnosis is not configured. Set LLM_BASE_URL and LLM_MODEL server-side (and LLM_API_KEY when required by the endpoint), then try again. Live-provider behavior is NOT VERIFIED here." tone="amber" /> : null}{state === "insufficient-evidence" ? <StatusMessage icon={AlertCircle} title="Insufficient evidence" description="The report says the trace does not support a clear diagnosis. Review missing evidence and limitations below, if a report was returned." tone="red" /> : null}{state === "failed-request" ? <StatusMessage icon={XCircle} title="Failed request" description={requestError ?? "The provider request failed. No demonstration report was substituted automatically."} tone="red" /> : null}{envelope ? <ReportBody envelope={envelope} steps={steps} graph={graph} onViewTimeline={onViewTimeline} onViewGraph={onViewGraph} /> : null}</CardContent>
    </Card>
  </div>;
}

function StatusMessage({ icon: Icon, title, description, tone = "violet", spin = false }: { icon: LucideIcon; title: string; description: string; tone?: "violet" | "amber" | "red"; spin?: boolean }) {
  return <div className={cn("rounded-lg border p-4", tone === "red" ? "border-red-400/20 bg-red-400/[0.05]" : tone === "amber" ? "border-amber-400/20 bg-amber-400/[0.05]" : "border-violet-400/15 bg-violet-400/[0.04]")}><p className="flex items-center gap-2 text-sm font-semibold text-slate-200"><Icon size={15} className={cn(tone === "red" ? "text-red-300" : tone === "amber" ? "text-amber-300" : "text-violet-300", spin && "animate-spin")} /> {title}</p><p className="mt-1 text-xs leading-5 text-slate-400"><SafeText value={description} /></p></div>;
}

function ReportBody({ envelope, steps, graph, onViewTimeline, onViewGraph }: { envelope: DiagnosisEnvelope; steps: TraceStep[]; graph: TraceGraph; onViewTimeline: (nodeId: string) => void; onViewGraph: (nodeId: string) => void }) {
  const { report, metadata } = envelope;
  const demo = metadata.source === "demo_fixture";
  const referenceList = (references: EvidenceReference[]) => <div className="mt-2 space-y-2">{references.length ? references.map((reference, index) => <EvidenceLink key={`${reference.step_id}-${reference.occurrence}-${index}`} reference={reference} steps={steps} graph={graph} onViewTimeline={onViewTimeline} onViewGraph={onViewGraph} />) : <p className="text-xs text-slate-500">No supporting references recorded.</p>}</div>;
  return <div className="space-y-5">
    <div className={cn("rounded-lg border p-3 text-xs leading-5", demo ? "border-amber-400/25 bg-amber-400/[0.06] text-amber-100/80" : "border-violet-400/20 bg-violet-400/[0.05] text-violet-100/80")}><p className="font-semibold">{demo ? "Demonstration report — precomputed synthetic example" : "Live model analysis"}</p><p className="mt-1">{demo ? "This report is separate from live analysis storage. It is a synthetic example for the existing failed refund scenario and is not model output." : "This report was returned by the configured provider from server-loaded trace evidence. Model interpretations are hypotheses, not proof."}</p></div>
    <Section title="Summary" icon={FileSearch}><p className="text-sm font-semibold text-slate-200"><SafeText value={report.title} /></p><p className="mt-2 text-sm leading-6 text-slate-300"><SafeText value={report.summary} /></p><p className="mt-3 text-[10px] uppercase tracking-wide text-slate-500">Analysis status · {report.analysis_status} · Failure class · {report.failure_class}</p></Section>
    <Section title="Observed facts" icon={ClipboardCheck}><div className="space-y-3">{report.observed_facts.map((fact, index) => <div key={index} className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3"><p className="text-xs leading-5 text-slate-300"><SafeText value={fact.statement} /></p>{referenceList(fact.supporting_step_refs)}</div>)}</div></Section>
    <Section title="Likely failure and alternative explanations" icon={AlertTriangle}><div className="space-y-3">{report.hypotheses.map((hypothesis, index) => <div key={index} className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3"><p className="text-xs font-semibold text-slate-200"><SafeText value={hypothesis.explanation} /></p><p className="mt-2 text-xs leading-5 text-slate-400"><span className="text-slate-500">Uncertainty / alternative: </span><SafeText value={hypothesis.uncertainty_or_alternative} /></p>{referenceList(hypothesis.supporting_step_refs)}</div>)}</div></Section>
    <Section title="Suspected first faulty step" icon={Target}>{report.suspected_first_faulty_step_ref ? <><EvidenceLink reference={report.suspected_first_faulty_step_ref} steps={steps} graph={graph} onViewTimeline={onViewTimeline} onViewGraph={onViewGraph} /><p className="mt-2 text-[10px] text-violet-300">Model-suspected faulty step · separate from any Demo fixture annotation in the timeline.</p></> : <p className="text-xs text-slate-500">No earliest supported suspect step. The report returned null rather than inventing a reference.</p>}</Section>
    <Section title="Supporting evidence" icon={FileSearch}>{referenceList(report.observed_facts.flatMap((fact) => fact.supporting_step_refs))}</Section>
    <div className="grid gap-5 lg:grid-cols-2"><Section title="Impact" icon={AlertCircle}><p className="text-xs leading-5 text-slate-300"><strong className="text-slate-500">Observed: </strong><SafeText value={report.observed_impact} /></p><p className="mt-3 text-xs leading-5 text-slate-300"><strong className="text-slate-500">Potential: </strong><SafeText value={report.potential_impact} /></p></Section><Section title="Contributing factors" icon={AlertTriangle}><BulletList items={report.contributing_factors} /></Section></div>
    <Section title="Proposed fixes" icon={CheckCircle2}><div className="space-y-3">{report.recommended_fixes.map((fix, index) => <div key={index} className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3"><p className="text-xs font-semibold text-slate-200"><SafeText value={fix.title} /> <span className="ml-1 text-[10px] font-normal uppercase tracking-wide text-violet-300">{safe(fix.category)}</span></p><p className="mt-2 text-xs leading-5 text-slate-300"><SafeText value={fix.concrete_suggested_change} /></p><p className="mt-2 text-xs leading-5 text-slate-400"><span className="text-slate-500">Implementation considerations: </span><SafeText value={fix.implementation_considerations} /></p>{referenceList(fix.supporting_evidence_refs)}</div>)}</div></Section>
    <Section title="Regression test ideas" icon={CheckCircle2}><div className="space-y-3">{report.regression_test_ideas.map((idea, index) => <div key={index} className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3"><p className="text-xs font-semibold text-slate-200"><SafeText value={idea.scenario} /></p><p className="mt-2 text-xs text-slate-300"><span className="text-slate-500">Expected: </span><SafeText value={idea.expected_behavior} /></p><BulletList items={idea.proposed_assertions} /></div>)}</div></Section>
    <div className="grid gap-5 lg:grid-cols-2"><Section title="Missing evidence" icon={AlertCircle}><BulletList items={report.missing_evidence} /></Section><Section title="Limitations" icon={AlertCircle}><BulletList items={report.limitations} /></Section></div>
    <Section title="Report metadata" icon={FileSearch}><dl className="grid gap-3 rounded-lg border border-white/[0.07] bg-white/[0.02] p-3 text-xs sm:grid-cols-2 lg:grid-cols-4"><Meta label="Source" value={demo ? "Demo fixture annotation" : "Live model analysis"} /><Meta label="Model" value={metadata.model ?? "Not reported"} /><Meta label="Created" value={metadata.created_at} /><Meta label="Token usage" value={metadata.token_usage ? JSON.stringify(metadata.token_usage) : "Not returned by provider"} /><Meta label="Report ID" value={metadata.report_id} /><Meta label="Trace fingerprint" value={metadata.trace_fingerprint} /></dl>{metadata.input_truncated ? <p className="mt-2 text-[10px] text-amber-300">Input was truncated before transmission. Omitted: {metadata.omitted_content.join(", ") || "configured size limits"}.</p> : null}{metadata.input_redacted ? <p className="mt-2 text-[10px] text-amber-300">Best-effort credential/sensitive-field redaction was applied. This is not complete PII protection.</p> : null}<p className="mt-2 text-[10px] leading-5 text-slate-500">Phase 3 suggests fixes and test ideas only. It does not enforce policies, replay runs, apply code changes, or execute generated tests. Public exposure and access control require later review.</p></Section>
  </div>;
}

function Section({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) { return <section><h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400"><Icon size={13} className="text-violet-300" /> {title}</h4><div className="mt-2">{children}</div></section>; }
function Meta({ label, value }: { label: string; value: string }) { return <div><dt className="text-[10px] uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 break-all font-mono text-[11px] text-slate-400"><SafeText value={value} /></dd></div>; }
function BulletList({ items }: { items: string[] }) { return items.length ? <ul className="space-y-2 text-xs leading-5 text-slate-400">{items.map((item, index) => <li key={index} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-violet-300" /><SafeText value={item} /></li>)}</ul> : <p className="text-xs text-slate-500">None recorded.</p>; }
