import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTraceGraph, downstreamNodeIds } from "../src/lib/trace-graph";
import type { TraceStep } from "../src/types/trace";

function step(step_id: string, started_at: string, parent_step_id: string | null = null, is_first_faulty_step = false): TraceStep {
  return {
    step_id,
    parent_step_id,
    type: "tool_call",
    title: step_id,
    started_at,
    ended_at: started_at,
    input: { step_id },
    output: { ok: true },
    tokens_in: 1,
    tokens_out: 1,
    latency_ms: 1,
    status: "ok",
    risk_score: null,
    notes: null,
    is_first_faulty_step,
    id: step_id,
    runId: "run-test",
    stepIndex: 0,
    name: step_id,
    startedAt: started_at,
    completedAt: started_at,
    durationMs: 1,
    isFirstFaultyStep: is_first_faulty_step
  };
}

test("creates one stable node per step, preserves IDs, and lays out deterministically", () => {
  const graph = buildTraceGraph([
    step("child", "2024-01-01T00:00:02Z", "root"),
    step("root", "2024-01-01T00:00:01Z")
  ]);
  assert.equal(graph.nodes.length, 2);
  assert.deepEqual(graph.nodes.map((node) => node.data.step_id), ["root", "child"]);
  assert.deepEqual(graph.nodes.map((node) => node.position), [{ x: 0, y: 0 }, { x: 285, y: 0 }]);
  assert.deepEqual(graph.nodes.map((node) => [node.layout.row, node.layout.column, node.layout.rowDirection]), [
    [0, 0, "ltr"],
    [0, 1, "ltr"]
  ]);
  assert.equal(graph.edges.length, 1);
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  for (const edge of graph.edges) {
    assert.equal(nodeIds.has(edge.source), true);
    assert.equal(nodeIds.has(edge.target), true);
  }
  assert.equal(graph.edges[0].source, graph.nodes[0].id);
  assert.equal(graph.edges[0].target, graph.nodes[1].id);
  assert.equal(graph.edges[0].kind, "recorded");
  assert.equal(graph.edges[0].inferred, false);
});

test("wraps twelve steps into two alternating horizontal rows with short row-boundary handles", () => {
  const graph = buildTraceGraph(Array.from({ length: 12 }, (_, index) => step(
    `step-${index + 1}`,
    `2024-01-01T00:00:${String(index + 1).padStart(2, "0")}Z`,
    index === 0 ? null : `step-${index}`
  )), { inferExecutionOrder: true });

  assert.deepEqual(graph.layout.map(({ x, y }) => [x, y]), [
    [0, 0], [285, 0], [570, 0], [855, 0], [1140, 0], [1425, 0],
    [1425, 170], [1140, 170], [855, 170], [570, 170], [285, 170], [0, 170]
  ]);
  assert.deepEqual(graph.layout.map(({ row, column, rowDirection }) => [row, column, rowDirection]), [
    [0, 0, "ltr"], [0, 1, "ltr"], [0, 2, "ltr"], [0, 3, "ltr"], [0, 4, "ltr"], [0, 5, "ltr"],
    [1, 5, "rtl"], [1, 4, "rtl"], [1, 3, "rtl"], [1, 2, "rtl"], [1, 1, "rtl"], [1, 0, "rtl"]
  ]);
  assert.deepEqual(graph.layout.map(({ sourcePosition, targetPosition }) => [sourcePosition, targetPosition]), [
    ["right", "left"], ["right", "left"], ["right", "left"], ["right", "left"], ["right", "left"], ["bottom", "left"],
    ["left", "top"], ["left", "right"], ["left", "right"], ["left", "right"], ["left", "right"], ["left", "right"]
  ]);
  assert.equal(new Set(graph.layout.map((item) => item.row)).size, 2);
  assert.equal(graph.edges.length, 11);
  assert.equal(graph.edges.filter((edge) => edge.kind === "recorded").length, 11);
  assert.equal(graph.edges.filter((edge) => edge.kind === "inferred").length, 0);
});

test("adds only adjacent inferred execution-order edges and marks them", () => {
  const graph = buildTraceGraph([
    step("a", "2024-01-01T00:00:01Z"),
    step("b", "2024-01-01T00:00:02Z", "a"),
    step("c", "2024-01-01T00:00:03Z")
  ], { inferExecutionOrder: true });
  assert.deepEqual(graph.edges.map((edge) => [edge.kind, edge.source, edge.target]), [
    ["recorded", graph.nodes[0].id, graph.nodes[1].id],
    ["inferred", graph.nodes[1].id, graph.nodes[2].id]
  ]);
  assert.equal(graph.edges[1].data.kind, "inferred");
});

test("reports missing parents and disconnected steps without inventing recorded edges", () => {
  const graph = buildTraceGraph([
    step("orphan", "2024-01-01T00:00:01Z", "missing"),
    step("disconnected", "2024-01-01T00:00:02Z")
  ]);
  assert.equal(graph.edges.length, 0);
  assert.deepEqual(graph.diagnostics.malformedRelationships, [{
    childStepId: "orphan",
    parentStepId: "missing",
    reason: "missing-parent"
  }]);
  assert.equal(graph.diagnostics.warnings[0].code, "missing-parent");
});

test("rejects self references, tolerates cycles, and follows downstream direction safely", () => {
  const graph = buildTraceGraph([
    step("a", "2024-01-01T00:00:01Z", "b"),
    step("b", "2024-01-01T00:00:02Z", "a"),
    step("self", "2024-01-01T00:00:03Z", "self")
  ]);
  assert.equal(graph.edges.length, 2);
  assert.deepEqual(downstreamNodeIds(graph, graph.nodes[0].id), [graph.nodes[1].id]);
  assert.deepEqual(downstreamNodeIds(graph, graph.nodes[1].id), [graph.nodes[0].id]);
  assert.equal(graph.diagnostics.malformedRelationships.some((item) => item.reason === "self-reference"), true);
  assert.equal(graph.diagnostics.warnings.some((item) => item.code === "cycle-detected"), true);
});

test("reports duplicate IDs without merging nodes", () => {
  const graph = buildTraceGraph([
    step("same", "2024-01-01T00:00:01Z"),
    step("same", "2024-01-01T00:00:02Z")
  ]);
  assert.equal(graph.nodes.length, 2);
  assert.notEqual(graph.nodes[0].id, graph.nodes[1].id);
  assert.deepEqual(graph.diagnostics.duplicateStepIds, ["same"]);
  assert.deepEqual(graph.nodes.map((node) => node.data.step_id), ["same", "same"]);
});

test("handles empty input and fixture annotation diagnostics", () => {
  const empty = buildTraceGraph([]);
  assert.deepEqual(empty.nodes, []);
  assert.deepEqual(empty.edges, []);
  assert.deepEqual(empty.downstreamByNodeId, {});
  assert.equal(empty.diagnostics.fixtureAnnotations.multiple, false);
  assert.deepEqual(buildTraceGraph([step("ok", "2024-01-01T00:00:01Z")]).diagnostics.warnings, []);

  const annotated = buildTraceGraph([
    step("a", "2024-01-01T00:00:01Z", null, true),
    step("b", "2024-01-01T00:00:02Z", null, true)
  ]);
  assert.equal(annotated.diagnostics.fixtureAnnotations.count, 2);
  assert.equal(annotated.diagnostics.warnings.some((item) => item.code === "multiple-fixture-annotations"), true);
});

test("handles missing or invalid timestamps without throwing", () => {
  const invalid = step("invalid-time", "not-a-date");
  const missing = { ...step("missing-time", "2024-01-01T00:00:01Z"), ended_at: "" };
  const graph = buildTraceGraph([invalid, missing]);
  assert.equal(graph.nodes.length, 2);
  assert.equal(graph.diagnostics.warnings.filter((warning) => warning.code === "invalid-timestamp").length, 2);
});

test("does not mutate input steps", () => {
  const input = [step("a", "2024-01-01T00:00:01Z")];
  const before = structuredClone(input);
  buildTraceGraph(input, { inferExecutionOrder: true });
  assert.deepEqual(input, before);
});
