# TraceWreck — hackathon submission

## 1. Project description

TraceWreck is a flight recorder and root-cause debugger for AI-agent executions. It turns normalized agent runs into an inspectable timeline and decision graph, then keeps three kinds of reasoning visibly separate: what the trace recorded, what a model might hypothesize, and what a local counterfactual simulation assumes.

The app ships with eight deterministic synthetic SQLite fixtures, including a failed support-refund run where two similar orders are retrieved before an order is selected and refunded. The dashboard filters runs by status, agent, and failure class. A run detail view exposes inputs, outputs, latency, tokens, risk metadata, parent relationships, inferred order edges, and graph diagnostics without presenting execution order as causality. Fixture `is_first_faulty_step` values are shown as **Demo fixture annotation**, not as live diagnosis.

The Root-Cause Report can request a bounded, server-side OpenAI-compatible chat-completions diagnosis. Evidence is loaded by run ID from SQLite, redacted and size-bounded, fingerprinted for cache identity, validated against occurrence-qualified step references, and persisted separately from the trace. When no provider is configured, the seeded refund run has an explicitly labeled precomputed demonstration report; it is not a provider response.

Phase 4 adds a deterministic counterfactual simulation. A user selects one guardrail—disambiguation, customer confirmation, eligibility/amount validation, or human approval—and the pure engine compares the recorded path with a local, hypothetical guarded path. It does not call an LLM, execute tools, change the run, persist simulation output, or prove that prevention would have occurred. Results include assumptions, missing evidence, evidence links, divergence, limitations, and proposed regression tests marked **proposed / not executed**.

Phase 5 documents the verification boundary honestly: offline tests and static/build checks passed, but the pinned runtime, Docker, browser automation, and live provider each have explicit limitations described below.

## 2. Three-minute honest demo script

Use the seeded local data. Keep the labels visible while presenting them.

| Time | Demo action and narration |
| --- | --- |
| 0:00–0:20 | Introduce TraceWreck as a recorder and review tool. State the boundary: the graph is recorded evidence, the report is hypothesis-oriented, and the counterfactual is a simulation—not an agent replay or prevention proof. |
| 0:20–0:45 | On the dashboard, show the eight synthetic runs and filter to **Failed**. Point out the SupportRefund failed run and the status/step metrics. Say that these are fixtures, not production traffic. |
| 0:45–1:15 | Open the failed refund run on **Timeline**. Show the retrieval with two matching orders, the annotated selection step, and the refund side effect. Call the annotation **Fixture annotation** and explain that the preceding retrieval is recorded evidence, not automatically the cause. |
| 1:15–1:40 | Switch to **Decision Graph**. Select the candidate, selection, and refund nodes; use the evidence inspector and downstream highlighting. Explain that parent edges and inferred order edges describe the stored trace, not causal proof. |
| 1:40–2:05 | Open **Root-Cause Report**. If no provider is configured, select **Demonstration report — precomputed synthetic example** and say exactly that. It is a **Demo report**, not live diagnosis. A live request is only possible with a configured compatible provider; that path was not exercised for this submission. |
| 2:05–2:45 | Open **Counterfactual Simulation**, select **Disambiguation**, keep the default minimum of two candidates, and start it. Show the introduced policy-check step, the modified selection, and downstream steps marked not executed in the simulation. Identify the result as **Counterfactual simulation**: it reads the trace locally and executes no tool or refund. |
| 2:45–3:00 | Show the assumptions, missing evidence, limitations, and **Proposed regression tests — not executed**. Close with verification: 34/34 offline tests, typecheck/lint/build, production/API and persistence checks passed; pinned-runtime, Docker, browser automation, and live-provider verification remain limited as listed below. |

## 3. Requirement and verification checklist

| Area | Status | Evidence and honest qualification |
| --- | --- | --- |
| Dashboard, filters, run detail, timeline | **PASS** | Implemented in `src/app/page.tsx` and `src/app/runs/[id]/page.tsx`; backed by the recorded SQLite fixtures. |
| Decision graph and evidence inspection | **PASS** | `src/lib/trace-graph.ts` and `src/components/trace-graph-view.tsx`; graph tests passed. Edges are not causal claims. |
| Evidence-linked diagnosis contract | **PASS** | `src/lib/diagnosis-evidence.ts`, `diagnosis-validation.ts`, and `diagnosis-service.ts`; mocked provider and validation behavior are covered by engine tests. |
| Counterfactual guardrail support | **PASS** | `src/lib/counterfactual-simulation.ts` supports one validated guardrail at a time; the UI is in `src/components/counterfactual-simulation.tsx`. No tools or side effects run. |
| Proposed guardrail tests | **NOT VERIFIED** | The simulator emits structured tests with `status: proposed`, `execution_status: not_executed`, and `executed: false`; they are specifications, not executed tests. |
| Offline automated tests | **PASS** | Isolated `npm test` passed **34/34**. This is recorded engine/test evidence, not live-provider evidence. |
| Typecheck, lint, production build | **PASS** | All three recorded checks passed. |
| Production startup/API behavior | **PASS** | Production startup/API checks passed using direct HTTP checks. Browser automation timed out, so this is not a browser E2E claim. |
| Migration, seed, and persistence behavior | **PASS** | Isolated checks passed; startup seeds only an empty database and does not reset existing data. |
| Clean install under pinned Node/npm | **NOT VERIFIED** | `npm ci` succeeded in an isolated copy on Node 24.14.0/npm 11.12.1 with engine warnings. The project pins Node 24.22.0/npm 11.19.1. |
| Docker build/start/restart | **BLOCKED** | Docker was unavailable in the verification environment; the Dockerfile was not reported as successfully exercised. |
| Browser automation | **BLOCKED** | Automation timed out. Direct `curl` checks worked. No browser automation pass is claimed. |
| Live provider diagnosis | **NOT VERIFIED** | No compatible live provider was configured or exercised. Provider responses in tests are mocked; the seeded report is a demo fixture. |
| Production dependency audit | **PASS** | `npm audit --omit=dev` reported 0 vulnerabilities. |
| Full dependency audit | **FAIL** | Full `npm audit` reported 13 development-only vulnerabilities (6 moderate, 7 high); available fixes required breaking or unsafe force changes. |

## 4. Architecture and data flow

```text
Browser
  ├─ src/app/page.tsx
  │    └─ GET /api/runs → run summaries and filters
  └─ src/app/runs/[id]/page.tsx
       ├─ GET /api/runs/:id → normalized run + ordered trace steps
       ├─ buildTraceGraph(...) → local timeline/graph navigation
       ├─ RootCauseReport
       │    ├─ GET /api/runs/:id/diagnosis → stored live report only
       │    └─ POST /api/runs/:id/diagnosis/start (or compatibility POST)
       │         └─ diagnosis-service → bounded/redacted evidence →
       │              OpenAI-compatible adapter → validation → SQLite report
       └─ CounterfactualSimulation
            └─ simulateCounterfactual(...) → local pure comparison
               (no API call, tool call, persistence, or run mutation)

Next.js App Router route handlers
  ├─ src/app/api/runs/route.ts              GET list/filter
  ├─ src/app/api/runs/[id]/route.ts         GET detail
  ├─ src/app/api/runs/[id]/diagnosis/route.ts
  ├─ src/app/api/runs/[id]/diagnosis/start/route.ts
  └─ src/app/api/seed/route.ts              POST explicit reset when enabled

Drizzle ORM → better-sqlite3 → ./data/agentpostmortem.db
  ├─ agent_runs
  ├─ trace_steps
  └─ diagnosis_reports
```

`src/db/schema.ts` defines the normalized tables. `src/db/client.ts` opens SQLite with WAL/foreign keys and creates missing tables/additive diagnosis columns. `src/db/start.ts` calls the safe seed path at production startup; `src/db/seed.ts` only replaces fixtures through an explicit local reset. The seed endpoint is disabled unless `ALLOW_DEMO_RESET=true`.

Diagnosis evidence is **Recorded evidence** selected server-side by route run ID. `diagnosis-evidence.ts` excludes fixture markers and prewritten fixture explanations from model input, applies redaction and bounds, and fingerprints the resulting evidence. `diagnosis-service.ts` caches matching completed reports, deduplicates concurrent requests, persists live results, and returns sanitized failures. `diagnosis-demo.ts` supplies the separate **Demo report** for the seeded refund case.

The counterfactual engine assigns `phase4-counterfactual-v1`, stable source fingerprints, occurrence-qualified references, assumptions, missing evidence, intervention points, and original-versus-simulated changes. It can report `completed`, `insufficient_evidence`, or `not_applicable`; it does not infer missing confirmation, thresholds, approvals, or causality.

## 5. Known limitations, security, and deployment notes

- **Recorded evidence:** Synthetic traces and their inputs/outputs are the source data. `is_first_faulty_step` is a **Fixture annotation**, not live model diagnosis.
- **Live diagnosis:** Requires server-side `LLM_BASE_URL`, `LLM_MODEL`, and (when required) `LLM_API_KEY`. Keys are not sent to the browser. Redaction is best effort, not complete PII protection; do not use real sensitive traces without a deployment review.
- **Demo report:** The seeded refund report is precomputed synthetic content, marked `demo_fixture`, and is never presented as live provider output.
- **Counterfactual simulation:** This is a local deterministic comparison over the recorded steps. It never executes tools, changes SQLite data, changes a diagnosis, or proves prevention. Any configured threshold is a **configured assumption** unless a threshold is recorded in the trace.
- **Proposed guardrail/test:** Generated regression ideas are labeled proposed/not executed. They are not evidence that a guardrail or code change works.
- **Engine tests:** The 34/34 result is offline automated test evidence using isolated databases/mocked provider behavior. It does not verify a live endpoint, browser interaction, Docker image, or the pinned Node/npm patch versions.
- There is no authentication, authorization, tenant isolation, encryption-at-rest, or role model. SQLite is local storage, not a tamper-evident audit trail.
- `POST /api/seed` is destructive when explicitly enabled and is intended for local fixtures only. Keep `ALLOW_DEMO_RESET=false` in deployment environments.
- The production dependency audit passed with `npm audit --omit=dev`; full audit still has 13 development-only advisories. No unsafe force fix was applied.
- The Dockerfile describes a deployment path, but Docker build/start/restart was **BLOCKED** in this verification environment because Docker was unavailable. Browser automation was also blocked by timeout; direct HTTP checks worked.
- The project pins Node 24.22.0/npm 11.19.1, but the recorded isolated install used Node 24.14.0/npm 11.12.1 and emitted engine warnings. Pinned-runtime clean-install verification remains **NOT VERIFIED**.
