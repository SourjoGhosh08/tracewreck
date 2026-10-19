import type { TraceStep } from "@/types/trace";

export interface TraceGraphNodeData {
  /** The normalized step represented by this node. */
  step: TraceStep;
  /** The original identifier, retained even when duplicate IDs are present. */
  step_id: string;
  originalStepId: string;
  order: number;
}

export interface TraceGraphNode {
  id: string;
  type: "trace-step";
  data: TraceGraphNodeData;
  position: { x: number; y: number };
}

export type TraceGraphEdgeKind = "recorded" | "inferred";

export interface TraceGraphEdge {
  id: string;
  source: string;
  target: string;
  kind: TraceGraphEdgeKind;
  inferred: boolean;
  data: { kind: TraceGraphEdgeKind };
}

export type TraceGraphWarningCode =
  | "missing-parent"
  | "self-reference"
  | "duplicate-step-id"
  | "multiple-fixture-annotations"
  | "cycle-detected"
  | "invalid-timestamp";

export interface TraceGraphWarning {
  code: TraceGraphWarningCode;
  message: string;
  stepIds?: string[];
  parentStepId?: string;
}

export interface MalformedRelationship {
  childStepId: string;
  parentStepId: string;
  reason: "missing-parent" | "self-reference";
}

export interface FixtureAnnotationReport {
  firstFaultyStepIds: string[];
  count: number;
  multiple: boolean;
}

export interface TraceGraphDiagnostics {
  warnings: TraceGraphWarning[];
  malformedRelationships: MalformedRelationship[];
  duplicateStepIds: string[];
  fixtureAnnotations: FixtureAnnotationReport;
}

export interface TraceGraphLayoutItem {
  id: string;
  x: number;
  y: number;
  order: number;
}

export interface TraceGraph {
  nodes: TraceGraphNode[];
  edges: TraceGraphEdge[];
  /** Deterministic top-to-bottom positions, suitable for a graph renderer. */
  layout: TraceGraphLayoutItem[];
  diagnostics: TraceGraphDiagnostics;
  /** Reachability follows edge source -> target (parent -> child). */
  downstreamByNodeId: Record<string, string[]>;
}

export interface TraceGraphOptions {
  /** Add adjacent execution-order edges that are not already recorded. */
  inferExecutionOrder?: boolean;
  /** Vertical distance between nodes in the renderer-independent layout input. */
  rowSpacing?: number;
}

interface IndexedStep {
  step: TraceStep;
  inputIndex: number;
  nodeId: string;
}

const DEFAULT_ROW_SPACING = 120;

function compareSteps(left: IndexedStep, right: IndexedStep): number {
  const leftStarted = typeof left.step.started_at === "string" ? left.step.started_at : "";
  const rightStarted = typeof right.step.started_at === "string" ? right.step.started_at : "";
  const leftEnded = typeof left.step.ended_at === "string" ? left.step.ended_at : "";
  const rightEnded = typeof right.step.ended_at === "string" ? right.step.ended_at : "";
  return leftStarted.localeCompare(rightStarted)
    || leftEnded.localeCompare(rightEnded)
    || left.step.step_id.localeCompare(right.step.step_id)
    || left.inputIndex - right.inputIndex;
}

function nodeIdFor(stepId: string, occurrence: number): string {
  // Encoding the caller-controlled ID prevents separators in an ID from
  // colliding with the graph's own ID syntax. The occurrence keeps bad,
  // duplicate fixture IDs as separate nodes rather than merging them.
  return `trace-step:${encodeURIComponent(stepId)}:${occurrence}`;
}

function edgeIdFor(kind: TraceGraphEdgeKind, source: string, target: string): string {
  return `trace-edge:${kind}:${source}->${target}`;
}

function warning(code: TraceGraphWarningCode, message: string, details: Pick<TraceGraphWarning, "stepIds" | "parentStepId"> = {}): TraceGraphWarning {
  return { code, message, ...details };
}

function sortedReachableNodeIds(startId: string, nodes: TraceGraphNode[], edges: TraceGraphEdge[]): string[] {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const targets = adjacency.get(edge.source) ?? [];
    targets.push(edge.target);
    adjacency.set(edge.source, targets);
  }

  const visited = new Set<string>([startId]);
  const pending = [...(adjacency.get(startId) ?? [])];
  while (pending.length > 0) {
    const nodeId = pending.shift()!;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);
    pending.push(...(adjacency.get(nodeId) ?? []));
  }
  visited.delete(startId);

  const order = new Map(nodes.map((node, index) => [node.id, index]));
  return [...visited].sort((left, right) => (order.get(left) ?? Number.MAX_SAFE_INTEGER) - (order.get(right) ?? Number.MAX_SAFE_INTEGER));
}

function findCycleNodeIds(nodes: TraceGraphNode[], edges: TraceGraphEdge[]): string[][] {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    adjacency.set(edge.source, [...(adjacency.get(edge.source) ?? []), edge.target]);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cycles: string[][] = [];
  const path: string[] = [];

  const visit = (nodeId: string) => {
    if (visiting.has(nodeId)) {
      const cycleStart = path.indexOf(nodeId);
      cycles.push(path.slice(cycleStart));
      return;
    }
    if (visited.has(nodeId)) return;
    visiting.add(nodeId);
    path.push(nodeId);
    for (const childId of adjacency.get(nodeId) ?? []) visit(childId);
    path.pop();
    visiting.delete(nodeId);
    visited.add(nodeId);
  };

  for (const node of nodes) visit(node.id);
  return cycles;
}

/**
 * Convert normalized trace steps into renderer-independent graph data.
 *
 * The function only reads `steps`; all arrays, maps, diagnostics, and layout
 * objects are newly allocated. Duplicate IDs are deliberately represented by
 * distinct occurrence-suffixed node IDs and are never merged.
 */
export function buildTraceGraph(steps: readonly TraceStep[], options: TraceGraphOptions = {}): TraceGraph {
  const indexedSteps: IndexedStep[] = steps.map((step, inputIndex) => ({ step, inputIndex, nodeId: "" }));
  const orderedSteps = [...indexedSteps].sort(compareSteps);
  const occurrences = new Map<string, number>();
  for (const indexed of orderedSteps) {
    const occurrence = occurrences.get(indexed.step.step_id) ?? 0;
    indexed.nodeId = nodeIdFor(indexed.step.step_id, occurrence);
    occurrences.set(indexed.step.step_id, occurrence + 1);
  }

  const nodes = orderedSteps.map(({ step, nodeId }, order) => ({
    id: nodeId,
    type: "trace-step" as const,
    data: {
      step: { ...step },
      step_id: step.step_id,
      originalStepId: step.step_id,
      order
    },
    position: { x: 0, y: order * (options.rowSpacing ?? DEFAULT_ROW_SPACING) }
  }));

  const byStepId = new Map<string, IndexedStep[]>();
  for (const indexed of orderedSteps) {
    byStepId.set(indexed.step.step_id, [...(byStepId.get(indexed.step.step_id) ?? []), indexed]);
  }

  const warnings: TraceGraphWarning[] = [];
  const malformedRelationships: MalformedRelationship[] = [];
  const edges: TraceGraphEdge[] = [];
  const recordedPairs = new Set<string>();

  const duplicateStepIds = [...byStepId.entries()]
    .filter(([, matchingSteps]) => matchingSteps.length > 1)
    .map(([stepId]) => stepId)
    .sort((left, right) => left.localeCompare(right));
  for (const stepId of duplicateStepIds) {
    warnings.push(warning("duplicate-step-id", `Duplicate trace step ID '${stepId}' was kept as separate graph nodes.`, { stepIds: [stepId] }));
  }

  for (const { step } of orderedSteps) {
    const timestamps = [step.started_at, step.ended_at];
    if (timestamps.some((value) => typeof value !== "string" || value.length === 0 || Number.isNaN(Date.parse(value)))) {
      warnings.push(warning("invalid-timestamp", `Trace step '${step.step_id}' has a missing or invalid timestamp; deterministic input order was used where needed.`, { stepIds: [step.step_id] }));
    }
  }

  for (const child of orderedSteps) {
    const parentStepId = child.step.parent_step_id;
    if (parentStepId === null) continue;
    if (parentStepId === child.step.step_id) {
      malformedRelationships.push({ childStepId: child.step.step_id, parentStepId, reason: "self-reference" });
      warnings.push(warning("self-reference", `Trace step '${child.step.step_id}' cannot be its own parent.`, {
        stepIds: [child.step.step_id],
        parentStepId
      }));
      continue;
    }
    const parent = byStepId.get(parentStepId)?.[0];
    if (!parent) {
      malformedRelationships.push({ childStepId: child.step.step_id, parentStepId, reason: "missing-parent" });
      warnings.push(warning("missing-parent", `Trace step '${child.step.step_id}' references missing parent '${parentStepId}'.`, {
        stepIds: [child.step.step_id],
        parentStepId
      }));
      continue;
    }
    const pair = `${parent.nodeId}\u0000${child.nodeId}`;
    if (recordedPairs.has(pair)) continue;
    recordedPairs.add(pair);
    edges.push({
      id: edgeIdFor("recorded", parent.nodeId, child.nodeId),
      source: parent.nodeId,
      target: child.nodeId,
      kind: "recorded",
      inferred: false,
      data: { kind: "recorded" }
    });
  }

  if (options.inferExecutionOrder) {
    for (let index = 1; index < orderedSteps.length; index += 1) {
      const source = orderedSteps[index - 1];
      const target = orderedSteps[index];
      const pair = `${source.nodeId}\u0000${target.nodeId}`;
      if (recordedPairs.has(pair)) continue;
      edges.push({
        id: edgeIdFor("inferred", source.nodeId, target.nodeId),
        source: source.nodeId,
        target: target.nodeId,
        kind: "inferred",
        inferred: true,
        data: { kind: "inferred" }
      });
    }
  }

  const firstFaultyStepIds = orderedSteps.filter(({ step }) => step.is_first_faulty_step).map(({ step }) => step.step_id);
  const fixtureAnnotations: FixtureAnnotationReport = {
    firstFaultyStepIds,
    count: firstFaultyStepIds.length,
    multiple: firstFaultyStepIds.length > 1
  };
  if (fixtureAnnotations.multiple) {
    warnings.push(warning("multiple-fixture-annotations", "Multiple trace steps are marked as the fixture's first faulty step.", {
      stepIds: [...firstFaultyStepIds]
    }));
  }

  for (const cycle of findCycleNodeIds(nodes, edges)) {
    warnings.push(warning("cycle-detected", "Displayed trace relationships contain a directed cycle.", {
      stepIds: cycle.map((nodeId) => nodes.find((node) => node.id === nodeId)!.data.step_id)
    }));
  }

  const layout = nodes.map((node) => ({ id: node.id, x: node.position.x, y: node.position.y, order: node.data.order }));
  const downstreamByNodeId = Object.fromEntries(nodes.map((node) => [node.id, sortedReachableNodeIds(node.id, nodes, edges)]));

  return {
    nodes,
    edges,
    layout,
    diagnostics: {
      warnings,
      malformedRelationships,
      duplicateStepIds,
      fixtureAnnotations
    },
    downstreamByNodeId
  };
}

export const traceStepsToGraph = buildTraceGraph;
export const transformTraceToGraph = buildTraceGraph;

/** Compute downstream nodes for an already-built/displayed graph safely. */
export function downstreamNodeIds(graph: Pick<TraceGraph, "nodes" | "edges">, nodeId: string): string[] {
  return sortedReachableNodeIds(nodeId, graph.nodes, graph.edges);
}
