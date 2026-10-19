"use client";

import "@xyflow/react/dist/style.css";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps
} from "@xyflow/react";
import { AlertTriangle, Brain, Check, Circle, Clock3, Copy, GitBranch, Info, Network, RotateCcw, Target, Wrench, XCircle, ZoomIn } from "lucide-react";
import { Component, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { EmptyState } from "@/components/empty-state";
import { JsonViewer } from "@/components/json-viewer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { downstreamNodeIds, type TraceGraph, type TraceGraphEdge, type TraceGraphNodeData } from "@/lib/trace-graph";
import type { TraceStep } from "@/types/trace";
import { cn, formatDuration } from "@/lib/utils";

type FlowTraceNodeData = TraceGraphNodeData & {
  [key: string]: unknown;
  selected: boolean;
  highlighted: boolean;
  dimmed: boolean;
  onSelect: () => void;
  onViewTimeline: () => void;
};

type FlowTraceNode = Node<FlowTraceNodeData, "trace-step">;
type FlowTraceEdge = Edge<{ kind: "recorded" | "inferred" }>;

interface TraceGraphViewProps {
  graph: TraceGraph;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
  onViewTimeline: (nodeId: string) => void;
}

function isFirstFault(step: TraceStep) {
  return step.is_first_faulty_step || step.isFirstFaultyStep;
}

function recordedTool(step: TraceStep) {
  if (step.tool) return step.tool;
  if (!step.input || typeof step.input !== "object" || Array.isArray(step.input)) return null;
  const value = (step.input as Record<string, unknown>).tool;
  return typeof value === "string" ? value : null;
}

function stepIcon(step: TraceStep) {
  if (isFirstFault(step) || step.status === "error" || step.status === "failed") return XCircle;
  if (step.type === "model_call" || step.type === "agent_plan") return Brain;
  if (step.type === "tool_call" || step.type === "tool_result") return Wrench;
  if (step.type === "retrieval") return Network;
  if (step.type === "final_response") return Check;
  return Circle;
}

function StepIcon({ step }: { step: TraceStep }) {
  const Icon = stepIcon(step);
  if (Icon === XCircle) return <XCircle size={14} />;
  if (Icon === Brain) return <Brain size={14} />;
  if (Icon === Wrench) return <Wrench size={14} />;
  if (Icon === Network) return <Network size={14} />;
  if (Icon === Check) return <Check size={14} />;
  return <Circle size={14} />;
}

function stepTone(step: TraceStep) {
  if (isFirstFault(step) || step.status === "error" || step.status === "failed") return "red";
  if (step.status === "warning" || step.status === "skipped") return "yellow";
  if (step.type === "retrieval") return "purple";
  if (step.type === "model_call" || step.type === "agent_plan" || step.type === "user_request") return "blue";
  if (step.type === "tool_call" || step.type === "tool_result") return "orange";
  return "green";
}

const toneClasses = {
  green: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
  yellow: "border-yellow-400/25 bg-yellow-400/10 text-yellow-300",
  red: "border-red-400/35 bg-red-400/10 text-red-300",
  blue: "border-blue-400/25 bg-blue-400/10 text-blue-300",
  purple: "border-purple-400/25 bg-purple-400/10 text-purple-300",
  orange: "border-orange-400/25 bg-orange-400/10 text-orange-300"
} as const;

function statusClass(step: TraceStep) {
  return step.status === "error" || step.status === "failed"
    ? toneClasses.red
    : step.status === "warning" || step.status === "skipped"
      ? toneClasses.yellow
      : toneClasses.green;
}

function TraceStepNode({ data }: NodeProps<FlowTraceNode>) {
  const tone = toneClasses[stepTone(data.step)];
  const tool = recordedTool(data.step);
  const annotation = isFirstFault(data.step);
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      data.onSelect();
    }
  };

  return <div
    role="button"
    tabIndex={0}
    aria-label={`Inspect ${data.step.title}, ${data.step.type}, ${data.step.status}`}
    onClick={(event) => { event.stopPropagation(); data.onSelect(); }}
    onKeyDown={handleKeyDown}
    className={cn(
      "w-[255px] rounded-xl border bg-slate-950/95 p-3 text-left shadow-xl shadow-black/20 outline-none transition-all focus-visible:ring-2 focus-visible:ring-violet-400",
      tone,
      data.selected && "ring-2 ring-violet-300 ring-offset-2 ring-offset-[#080b12]",
      data.highlighted && !data.selected && "ring-2 ring-cyan-300/70",
      data.dimmed && "opacity-30"
    )}
  >
    <Handle type="target" position={Position.Top} className="!h-2 !w-2 !border-0 !bg-violet-300" />
    <div className="flex items-start gap-2">
      <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border", tone)}><StepIcon step={data.step} /></span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-semibold text-slate-100" title={data.step.title}>{data.step.title}</p>
        <p className="mt-1 truncate font-mono text-[10px] text-slate-500" title={data.step.step_id}>{data.step.step_id}</p>
      </div>
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      <span className={cn("rounded border px-1.5 py-0.5 font-mono text-[9px]", tone)}>{data.step.type}</span>
      <span className={cn("rounded border px-1.5 py-0.5 text-[9px] capitalize", statusClass(data.step))}>{data.step.status}</span>
      {annotation ? <span className="rounded border border-red-400/30 bg-red-400/10 px-1.5 py-0.5 text-[9px] font-semibold text-red-300">Demo fixture annotation</span> : null}
    </div>
    <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-slate-500">
      {tool ? <span className="flex min-w-0 items-center gap-1 truncate text-orange-300/80" title={tool}><Wrench size={10} />{tool}</span> : <span />}
      <span className="flex shrink-0 items-center gap-1 font-mono"><Clock3 size={10} />{formatDuration(data.step.durationMs)}</span>
    </div>
    <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !border-0 !bg-violet-300" />
  </div>;
}

const nodeTypes = { "trace-step": TraceStepNode };

function edgeStyle(edge: TraceGraphEdge, highlighted: boolean, dimmed: boolean) {
  const color = edge.kind === "recorded" ? "#a78bfa" : "#64748b";
  return {
    stroke: color,
    strokeWidth: highlighted ? 2.6 : 1.5,
    strokeDasharray: edge.kind === "inferred" ? "5 5" : undefined,
    opacity: dimmed ? 0.18 : highlighted ? 1 : 0.72
  };
}

function FlowToolbar({ onFit, onReset, showInferred, onToggleInferred }: { onFit: () => void; onReset: () => void; showInferred: boolean; onToggleInferred: () => void }) {
  return <div className="absolute left-3 top-3 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-white/[0.08] bg-slate-950/90 p-1.5 shadow-lg shadow-black/20">
    <Button type="button" variant="ghost" size="sm" onClick={onFit} title="Fit graph to view"><ZoomIn size={13} /> Fit</Button>
    <Button type="button" variant="ghost" size="sm" onClick={onReset} title="Reset graph view"><RotateCcw size={13} /> Reset</Button>
    <label className="flex h-8 cursor-pointer items-center gap-2 border-l border-white/[0.08] px-2 text-[10px] text-slate-400">
      <input type="checkbox" checked={showInferred} onChange={onToggleInferred} className="accent-violet-400" />
      Inferred order
    </label>
  </div>;
}

function FlowCanvas({ graph, selectedNodeId, highlightNodeIds, showInferred, onSelectNode, onViewTimeline, onToggleInferred }: {
  graph: TraceGraph;
  selectedNodeId: string | null;
  highlightNodeIds: Set<string>;
  showInferred: boolean;
  onSelectNode: (nodeId: string) => void;
  onViewTimeline: (nodeId: string) => void;
  onToggleInferred: () => void;
}) {
  const flow = useReactFlow<FlowTraceNode>();
  const fitted = useRef(false);
  const visibleEdges = useMemo(() => graph.edges.filter((edge) => showInferred || edge.kind !== "inferred"), [graph.edges, showInferred]);
  const visibleEdgeIds = useMemo(() => new Set(visibleEdges.map((edge) => edge.id)), [visibleEdges]);
  const hasHighlight = highlightNodeIds.size > 0;
  const nodes = useMemo<FlowTraceNode[]>(() => graph.nodes.map((node) => ({
    id: node.id,
    type: "trace-step",
    position: node.position,
    data: {
      ...node.data,
      selected: node.id === selectedNodeId,
      highlighted: highlightNodeIds.has(node.id),
      dimmed: hasHighlight && !highlightNodeIds.has(node.id),
      onSelect: () => onSelectNode(node.id),
      onViewTimeline: () => onViewTimeline(node.id)
    }
  })), [graph.nodes, hasHighlight, highlightNodeIds, onSelectNode, onViewTimeline, selectedNodeId]);
  const edges = useMemo<FlowTraceEdge[]>(() => visibleEdges.map((edge) => {
    const highlighted = highlightNodeIds.has(edge.source) && highlightNodeIds.has(edge.target);
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: "smoothstep",
      data: { kind: edge.kind },
      markerEnd: { type: MarkerType.ArrowClosed, color: edge.kind === "recorded" ? "#a78bfa" : "#64748b" },
      style: edgeStyle(edge, highlighted, hasHighlight && !highlighted),
      label: edge.kind === "inferred" ? "execution order" : undefined,
      labelStyle: { fill: "#94a3b8", fontSize: 9 },
      labelBgStyle: { fill: "#080b12", fillOpacity: 0.9 },
      hidden: !visibleEdgeIds.has(edge.id)
    };
  }), [hasHighlight, highlightNodeIds, visibleEdgeIds, visibleEdges]);

  return <div className="relative h-[620px] overflow-hidden rounded-xl border border-white/[0.08] bg-[#080b12]" data-testid="trace-graph-canvas">
    <FlowToolbar onFit={() => flow.fitView({ padding: 0.18, duration: 180 })} onReset={() => flow.setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 180 })} showInferred={showInferred} onToggleInferred={onToggleInferred} />
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView={false}
      minZoom={0.35}
      maxZoom={1.6}
      onNodeClick={(_, node) => onSelectNode(node.id)}
      onInit={(instance) => { if (!fitted.current) { fitted.current = true; instance.fitView({ padding: 0.18, duration: 0 }); } }}
      proOptions={{ hideAttribution: true }}
    >
      <Background color="#273244" gap={22} size={1} />
      <Controls showInteractive={false} position="bottom-left" />
      <MiniMap nodeColor={(node) => node.data?.selected ? "#c4b5fd" : node.data?.highlighted ? "#67e8f9" : "#475569"} maskColor="rgba(8, 11, 18, 0.78)" position="bottom-right" />
    </ReactFlow>
  </div>;
}

class GraphErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) return <Card className="border-red-400/20"><CardContent className="py-12"><EmptyState title="Graph rendering unavailable" description="The recorded trace is still available in the Timeline tab." /></CardContent></Card>;
    return this.props.children;
  }
}

export function TraceGraphView({ graph, selectedNodeId, onSelectNode, onViewTimeline }: TraceGraphViewProps) {
  const [showInferred, setShowInferred] = useState(true);
  const [highlightDownstream, setHighlightDownstream] = useState(false);
  const selectedGraphNode = graph.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const visibleEdges = useMemo(() => graph.edges.filter((edge) => showInferred || edge.kind !== "inferred"), [graph.edges, showInferred]);
  const downstream = useMemo(() => {
    if (!highlightDownstream || !selectedNodeId) return new Set<string>();
    return new Set([selectedNodeId, ...downstreamNodeIds({ nodes: graph.nodes, edges: visibleEdges }, selectedNodeId)]);
  }, [graph.nodes, highlightDownstream, selectedNodeId, visibleEdges]);
  const selectNode = (nodeId: string | null) => {
    setHighlightDownstream(false);
    onSelectNode(nodeId);
  };
  const toggleHighlight = () => setHighlightDownstream((current) => !current);

  useEffect(() => {
    if (selectedNodeId && !graph.nodes.some((node) => node.id === selectedNodeId)) onSelectNode(null);
  }, [graph.nodes, onSelectNode, selectedNodeId]);

  if (graph.nodes.length === 0) return <EmptyState title="No graph steps" description="This run has no recorded execution steps to visualize." />;

  const annotationCount = graph.diagnostics.fixtureAnnotations.count;
  return <div className="space-y-4">
    <div className="rounded-lg border border-blue-400/15 bg-blue-400/[0.04] p-3 text-xs leading-5 text-blue-100/75"><p className="flex items-center gap-2 font-semibold text-blue-200"><Info size={14} /> Recorded execution graph</p><p className="mt-1">This graph shows recorded trace steps and parent relationships. It does not reveal hidden model reasoning, prove causation, or predict a corrected outcome.</p></div>
    {graph.diagnostics.warnings.length > 0 ? <div className="rounded-lg border border-yellow-400/20 bg-yellow-400/[0.05] p-3 text-xs text-yellow-100/80"><p className="flex items-center gap-2 font-semibold text-yellow-200"><AlertTriangle size={14} /> Data-quality warnings</p><ul className="mt-1 list-inside list-disc space-y-1">{graph.diagnostics.warnings.map((warning, index) => <li key={`${warning.code}-${index}`}>{warning.message}</li>)}</ul></div> : null}
    {annotationCount > 0 ? <div className="rounded-lg border border-red-400/15 bg-red-400/[0.04] p-3 text-xs text-red-100/75"><p className="flex items-center gap-2 font-semibold text-red-200"><AlertTriangle size={14} /> Demo fixture annotation{annotationCount === 1 ? "" : "s"}</p><p className="mt-1">{annotationCount === 1 ? "One step" : `${annotationCount} steps`} is marked by synthetic fixture data. This is not live AI diagnosis.</p></div> : null}
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
      <div className="min-w-0 space-y-3"><GraphErrorBoundary><ReactFlowProvider><FlowCanvas graph={graph} selectedNodeId={selectedNodeId} highlightNodeIds={downstream} showInferred={showInferred} onSelectNode={selectNode} onViewTimeline={onViewTimeline} onToggleInferred={() => setShowInferred((current) => !current)} /></ReactFlowProvider></GraphErrorBoundary><RelationshipLegend showInferred={showInferred} /><p className="text-[10px] leading-5 text-slate-500">Use the controls to pan, zoom, fit, or reset the view. Select a node with the mouse or keyboard. Inferred order edges are dashed and can be hidden.</p></div>
      <Inspector node={selectedGraphNode ? { id: selectedGraphNode.id, type: "trace-step", position: selectedGraphNode.position, data: { ...selectedGraphNode.data, selected: selectedGraphNode.id === selectedNodeId, highlighted: downstream.has(selectedGraphNode.id), dimmed: false, onSelect: () => selectNode(selectedGraphNode.id), onViewTimeline: () => onViewTimeline(selectedGraphNode.id) } } : null} graph={graph} onViewTimeline={onViewTimeline} onClear={() => selectNode(null)} onHighlight={toggleHighlight} hasHighlight={highlightDownstream} />
    </div>
  </div>;
}

function RelationshipLegend({ showInferred }: { showInferred: boolean }) {
  return <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] text-slate-500" aria-label="Graph legend">
    <span className="inline-flex items-center gap-1.5"><span className="h-px w-5 bg-violet-300" />Recorded parent relationship</span>
    <span className={cn("inline-flex items-center gap-1.5", !showInferred && "opacity-50")}><span className="w-5 border-t border-dashed border-slate-400" />Inferred execution order</span>
    <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-cyan-300" />Selected/downstream highlight</span>
  </div>;
}

function Inspector({ node, graph, onViewTimeline, onClear, onHighlight, hasHighlight }: {
  node: FlowTraceNode | null;
  graph: TraceGraph;
  onViewTimeline: (nodeId: string) => void;
  onClear: () => void;
  onHighlight: () => void;
  hasHighlight: boolean;
}) {
  const [stepCopied, setStepCopied] = useState(false);
  const [stepCopyError, setStepCopyError] = useState(false);
  const step = node?.data.step;
  const copyStepId = async () => {
    if (!step) return;
    setStepCopyError(false);
    try {
      if (!navigator.clipboard) throw new Error("Clipboard access is unavailable");
      await navigator.clipboard.writeText(step.step_id);
      setStepCopied(true);
      window.setTimeout(() => setStepCopied(false), 1200);
    } catch {
      setStepCopied(false);
      setStepCopyError(true);
      window.setTimeout(() => setStepCopyError(false), 1800);
    }
  };

  if (!node || !step) return <Card className="min-h-[620px] border-dashed"><CardContent className="flex min-h-[620px] items-center justify-center"><EmptyState title="Select a graph step" description="Choose a recorded step to inspect its evidence, relationship identifiers, and fixture metadata." /></CardContent></Card>;

  const annotation = isFirstFault(step);
  const parentNode = graph.nodes.find((candidate) => candidate.data.step_id === step.parent_step_id);
  return <Card className="min-h-[620px] overflow-hidden">
    <CardHeader className="border-b border-white/[0.06] pb-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><CardTitle className="flex items-center gap-2"><Target size={15} className="text-cyan-300" /> Evidence inspector</CardTitle><p className="mt-1 text-xs text-slate-500">Recorded evidence only; no causal inference.</p></div>
        <Button type="button" variant="ghost" size="icon" aria-label="Clear selected graph step" onClick={onClear}><XCircle size={15} /></Button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => onViewTimeline(node.id)}><GitBranch size={13} /> View in timeline</Button>
        <Button type="button" variant={hasHighlight ? "outline" : "secondary"} size="sm" onClick={onHighlight}><Network size={13} /> {hasHighlight ? "Clear downstream" : "Highlight downstream execution"}</Button>
      </div>
    </CardHeader>
    <CardContent className="max-h-[535px] space-y-4 overflow-y-auto pt-5">
      {annotation ? <div className="rounded-lg border border-red-400/25 bg-red-400/[0.07] p-3 text-xs text-red-200/85"><p className="flex items-center gap-2 font-semibold"><AlertTriangle size={14} /> Demo fixture annotation</p><p className="mt-1 leading-5">This step was annotated in the synthetic demo data. It has not been identified by live AI diagnosis.</p></div> : null}
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-semibold text-slate-100">{step.title}</p><p className="mt-1 font-mono text-[11px] text-slate-500">{step.type}</p></div><span className={cn("rounded border px-2 py-1 text-[11px] capitalize", statusClass(step))}>{step.status}</span></div>
      <dl className="grid gap-3 rounded-lg border border-white/[0.07] bg-white/[0.02] p-3 text-xs sm:grid-cols-2">
        <div className="sm:col-span-2"><dt className="text-[10px] uppercase tracking-wide text-slate-500">Original recorded step ID</dt><dd className="mt-1 flex items-center gap-2 break-all font-mono text-slate-300"><span className="min-w-0">{step.step_id}</span><Button type="button" variant="ghost" size="icon" aria-label="Copy step ID" onClick={() => void copyStepId()} className="h-6 w-6 shrink-0">{stepCopied ? <Check size={12} className="text-emerald-300" /> : <Copy size={12} />}</Button>{stepCopyError ? <span className="text-[10px] text-red-300">Copy failed</span> : null}</dd></div>
        <div><dt className="text-[10px] uppercase tracking-wide text-slate-500">Started</dt><dd className="mt-1 break-all text-slate-400">{step.started_at || "Not recorded"}</dd></div>
        <div><dt className="text-[10px] uppercase tracking-wide text-slate-500">Ended</dt><dd className="mt-1 break-all text-slate-400">{step.ended_at || "Not recorded"}</dd></div>
        <div><dt className="text-[10px] uppercase tracking-wide text-slate-500">Latency</dt><dd className="mt-1 font-mono text-slate-400">{formatDuration(step.durationMs)}</dd></div>
        <div><dt className="text-[10px] uppercase tracking-wide text-slate-500">Tokens</dt><dd className="mt-1 font-mono text-slate-400">{step.tokens_in.toLocaleString()} in · {step.tokens_out.toLocaleString()} out</dd></div>
        <div><dt className="text-[10px] uppercase tracking-wide text-slate-500">Recorded risk score</dt><dd className="mt-1 font-mono text-slate-400">{step.risk_score === null || step.risk_score === undefined ? "Not recorded" : String(step.risk_score)}</dd></div>
        <div><dt className="text-[10px] uppercase tracking-wide text-slate-500">Recorded tool</dt><dd className="mt-1 break-all font-mono text-orange-300/80">{recordedTool(step) ?? "Not recorded"}</dd></div>
      </dl>
      <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3 text-xs"><p className="mb-2 flex items-center gap-2 font-semibold text-slate-300"><Info size={13} className="text-violet-300" /> Recorded relationship identifiers</p><dl className="space-y-2 text-[11px]"><div className="flex justify-between gap-3"><dt className="text-slate-500">Graph node ID</dt><dd className="break-all text-right font-mono text-slate-400">{node.id}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">parent_step_id</dt><dd className="break-all text-right font-mono text-slate-400">{step.parent_step_id ?? "None recorded"}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">Parent graph node</dt><dd className="break-all text-right font-mono text-slate-400">{parentNode?.id ?? "Not available"}</dd></div></dl></div>
      {step.notes ? <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3"><p className="text-[10px] uppercase tracking-wide text-slate-500">Notes</p><p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-slate-300">{step.notes}</p></div> : <div className="rounded-lg border border-dashed border-white/[0.08] p-3 text-xs text-slate-500">No notes recorded for this step.</div>}
      <div className="space-y-3"><JsonViewer label="Recorded input JSON" value={step.input ?? null} defaultOpen className="bg-[#080b12]" /><JsonViewer label="Recorded output JSON" value={step.output ?? null} defaultOpen className="bg-[#080b12]" /></div>
      <p className="text-[10px] leading-5 text-slate-500">Connections show recorded relationships or inferred execution order. Downstream highlighting does not establish causation.</p>
    </CardContent>
  </Card>;
}
