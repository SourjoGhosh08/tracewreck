# TraceWreck

**The flight recorder and root-cause debugger for AI agents.**

TraceWreck helps developers trace AI-agent failures, inspect decision paths, and review evidence-linked diagnosis hypotheses. The current implementation spans recorded-trace inspection (Phases 1–3) and a deterministic, read-only Phase 4 counterfactual simulation. Phase 5 records verification evidence and limits; it does not turn simulations into live enforcement or claim that a failure was prevented.

## Phase 1 scope

Implemented:

- Next.js 16.4.1 App Router, TypeScript, Tailwind CSS, and shadcn-style UI components.
- Drizzle ORM over SQLite using `better-sqlite3`.
- Normalized `agent_runs` and `trace_steps` tables.
- Eight deterministic synthetic fixtures: four successful, two suspicious, and two failed runs.
- A detailed failed `SupportRefund Agent` damaged-headphones scenario.
- Dashboard filters, run metrics, run table, run detail header, and timeline JSON inspection.
- `GET /api/runs`, `GET /api/runs/:id`, and explicit reset/reseed `POST /api/seed`.
- Phase 2 Decision Graph for recorded execution steps, evidence inspection, relationship warnings, downstream highlighting, and Timeline/Graph navigation.
- Phase 3 evidence-linked diagnosis with a runtime-validated report contract, additive SQLite storage, cache identity, bounded provider requests, one correction attempt, and sanitized provider errors.
- Optional server-side OpenAI-compatible chat-completions adapter, with an explicit precomputed demonstration report for the seeded failed refund run when live diagnosis is unavailable.
- Root-Cause Report sections for recorded facts, hypotheses and alternatives, suspected steps, impact, proposed fixes, regression ideas, missing evidence, limitations, and metadata-linked navigation.

Scope boundaries:

- Live agent replay or executable policy/guardrail enforcement. Phase 4 only compares a recorded trace with one selected local guardrail.
- Automatic code changes or automatic execution of generated tests.
- Authentication, authorization, tenant isolation, and production hardening.

The `is_first_faulty_step` values are fixture annotations. They are not live model diagnosis and must not be presented as proof that an arbitrary real failure has been automatically identified. Any future replay must be labeled a simulation, not proof that a failure was prevented.

## Architecture

```text
Browser
  └─ Next.js App Router UI
       ├─ Dashboard and /runs/[id] timeline
       └─ Route handlers: /api/runs, /api/runs/:id, /api/runs/:id/diagnosis
            └─ Drizzle ORM
                 └─ better-sqlite3 → SQLite file in ./data
```

- `src/app/` contains pages, metadata, styles, and API route handlers.
- `src/components/` contains the dashboard shell and reusable UI primitives.
- `src/db/schema.ts` defines the normalized database contract.
- `src/db/client.ts` performs additive schema initialization when SQLite opens.
- `src/db/start.ts` initializes and seeds only an empty database for production startup.
- `src/db/seed.ts` contains safe initialization plus an explicit destructive reset/reseed function.
- `src/db/seed-data.ts` contains the deterministic synthetic fixtures.
- `src/lib/trace-graph.ts` transforms normalized trace steps into typed, deterministic graph data and cycle-safe reachability diagnostics.
- `src/components/trace-graph-view.tsx` renders the interactive client-side graph and evidence inspector.
- `src/lib/diagnosis-evidence.ts` prepares trusted, redacted, bounded evidence from database rows and fingerprints it for cache identity.
- `src/lib/diagnosis-validation.ts` runtime-validates diagnosis output and rejects unknown or ambiguous step references.
- `src/lib/llm-openai-compatible.ts` is the small server-side OpenAI-compatible adapter. It never exposes the API key to the browser.
- `src/lib/diagnosis-service.ts` owns bounded diagnosis, storage, cache/in-flight deduplication, and sanitized failures.
- `test/database.test.ts`, `test/trace-graph.test.ts`, and `test/diagnosis-backend.test.ts` run isolated offline checks without touching the development database.

## Requirements and pinned versions

- Node.js **24.22.0 (Krypton LTS)**, pinned by `.nvmrc` and the Docker base image.
- npm **11.19.1**, the exact npm version bundled with Node 24.22.0.
- npm is the only package manager; `package-lock.json` is tracked.
- Docker Engine is required only for the container checks.

The reproducible target is Node 24.22.0 with npm 11.19.1. The available shell here has Node **v24.14.0** and npm **11.12.1**, not the selected patch versions, so target-runtime verification is **NOT VERIFIED**. Do not treat the checks below as proof under Node 24.22.0/npm 11.19.1.

## Clean Linux setup

```bash
git clone <repository-url> tracewreck
cd tracewreck
nvm install
nvm use
node --version   # v24.22.0
npm --version    # 11.19.1
npm ci
```

Do not install project dependencies globally. If `nvm` is unavailable, install Node.js 24.22.0 with the version manager used by your Linux environment.

## Environment

Create the local environment file from the tracked template:

```bash
cp .env.example .env.local
```

The settings currently used are:

```env
DATABASE_URL=file:./data/agentpostmortem.db
ALLOW_DEMO_RESET=false
LLM_BASE_URL=
LLM_MODEL=
LLM_API_KEY=
LLM_TIMEOUT_MS=12000
LLM_MAX_RESPONSE_BYTES=131072
LLM_MAX_OUTPUT_TOKENS=2500
DIAGNOSIS_MAX_STEPS=200
DIAGNOSIS_MAX_CHARS=240000
DIAGNOSIS_MAX_STRING=2000
```

The filename `agentpostmortem.db` is intentionally retained for compatibility with existing local data and persisted volumes; it is an old product-name reference, not the current product identity. `ALLOW_DEMO_RESET` is an explicit opt-in for the destructive local demo reset endpoint and should remain false in production. `.env` and `.env.local` are ignored. Do not put secrets in `.env.example`.

## Database setup and demo data

```bash
npm run db:migrate
npm run db:seed
```

`db:migrate` initializes the current tables additively. `db:seed` is an explicit destructive local fixture reset: it replaces the two application tables with exactly eight synthetic runs. Startup does not call this reset operation.

## Development

```bash
npm run dev
```

Open <http://localhost:3000>.

API endpoints:

- `GET /api/runs` — list run summaries, newest first. Supports `status`, `agent`/`agentName`, and `failureClass` filters.
- `GET /api/runs/:id` — return a run and its ordered normalized trace steps.
- `GET /api/runs/:id/diagnosis` — return the latest stored live diagnosis and metadata for a run; it does not run a provider request.
- `POST /api/runs/:id/diagnosis/start` — load the trace by route run ID on the server and request a diagnosis. An optional JSON body `{ "regenerate": true }` explicitly bypasses a matching completed cache entry and makes another provider request. Client-supplied trace contents are ignored.
- `POST /api/runs/:id/diagnosis` — compatibility alias for the same start action.
- `POST /api/seed` — explicitly reset and reload all eight demo fixtures only when `ALLOW_DEMO_RESET=true`; otherwise it returns `403`.
- `POST /api/runs` — unsupported; run listing is read-only. The old convenience reset behavior was removed to prevent accidental data loss.

## Test and checks

The one required offline test command is:

```bash
npm test
```

It uses temporary SQLite databases, cleans them up, and asserts the eight-run/status contract, valid run and parent references, safe additive diagnosis storage, ordered detail retrieval, cache identity, redaction and fixture-label exclusion, duplicate-reference handling, malformed provider responses, bounded correction behavior, missing configuration, and explicit demo/live separation. It never resets `data/agentpostmortem.db` and makes no network calls.

Additional checks:

```bash
npm run typecheck
npm run lint
npm run build
npm audit --omit=dev
```

## Phase 2: Decision Graph

Open any run and select **Decision Graph** beside the Timeline. Every recorded trace step is rendered once as a node. Select a node with the mouse or keyboard to open the evidence inspector, which shows the original step ID, event type, status, timestamps, latency, token counts, recorded risk metadata, relationship identifiers, notes, input, and output. Long JSON stays inside scrollable panels and copy failures are reported in the inspector.

The graph uses `@xyflow/react` `12.12.0`, which is compatible with the existing React 19 stack. It uses a deterministic local top-to-bottom layout; no graph layout service or persisted graph coordinates are required.

Graph controls provide pan, zoom, fit-to-view, reset, a minimap, and an option to hide inferred execution-order edges. The legend distinguishes:

- **Recorded parent relationship** — an edge derived from the stored `parent_step_id`; it represents recorded execution/nesting, not causation.
- **Inferred execution order** — a dashed edge between adjacent deterministically ordered steps when no recorded parent edge covers that pair. These edges can be hidden.
- **Selected/downstream highlight** — the selected node and nodes reachable through the currently displayed directed edges. Highlighting does not establish a causal chain or identify a root cause.

The graph reports missing parents, self-references, cycles, duplicate step IDs, and multiple fixture annotations without dropping evidence. Duplicate IDs receive collision-safe graph IDs while retaining the original recorded ID. Disconnected steps remain visible. Tool calls and tool results are not paired because the Phase 1 schema has no reliable pairing identifier.

The synthetic `is_first_faulty_step` marker is displayed as **Demo fixture annotation** with this explanation: “This step was annotated in the synthetic demo data. It has not been identified by live AI diagnosis.” For the refund fixture, the annotated step is the wrong-order selection; the preceding retrieval returning two matching orders is not automatically marked faulty.

Use **View in graph** on a Timeline step or **View in timeline** in the inspector to move between views. The Timeline remains the accessible fallback if graph rendering is unavailable or the viewport is narrow.

Known Phase 2 limitations retained in the graph: it visualizes recorded execution only; it does not expose hidden model reasoning, infer tool-result pairing, prove causation, predict corrected outcomes, or import arbitrary production traces. The Phase 3 report is a separate evidence-linked hypothesis view.

## Phase 3: Evidence-Linked AI Failure Diagnosis

Open a run and select **Root-Cause Report**. **Diagnose run** requests a live report only when the server has a configured provider. **Regenerate** requires an explicit confirmation because it makes another model request. The UI never silently replaces a failed live request with the demo report.

### Provider configuration

The adapter supports an OpenAI-compatible **chat-completions** endpoint. Set these server-side variables in `.env.local` or the deployment environment:

```env
LLM_BASE_URL=https://provider.example/v1
LLM_MODEL=the-model-identifier-required-by-that-provider
LLM_API_KEY=server-side-secret-if-required
```

`LLM_BASE_URL` must be either the provider API root, such as `https://provider.example/v1`, or the full `https://provider.example/v1/chat/completions` URL. When the path does not already end in `/chat/completions`, TraceWreck appends that path. TraceWreck does not assume OmniRush access, invent a provider address, or invent a model identifier. The key is sent only from the server to that configured endpoint; no `NEXT_PUBLIC_` variable is used.

For Groq `openai/gpt-oss-20b` and `openai/gpt-oss-120b`, TraceWreck requests Groq Structured Outputs with `response_format.type=json_schema` and `strict=true`. The schema closes every object with `additionalProperties=false`, marks every field required, and represents the nullable suspected-step reference with a `null` union. Groq documents these models as supporting strict Structured Outputs. Other OpenAI-compatible providers retain JSON Object Mode unless their endpoint is explicitly recognized as Groq GPT-OSS; runtime validation and evidence-reference checks still apply.

If `LLM_BASE_URL` or `LLM_MODEL` is missing, the application stays functional and the UI says **Provider not configured**. The seeded failed refund run offers **Demonstration report — precomputed synthetic example** separately. That report is not stored as a live report, is not sent to the provider, and is never presented as live analysis.

### Evidence and honesty boundaries

The diagnosis service loads the run and trace steps from SQLite by run ID. It does not accept client-provided trace contents. Evidence includes the recorded user request, agent/model/tool/retrieval/policy/error steps, recorded inputs/outputs, and available observed outcomes. Fixture markers, seeded failure-class labels, prewritten fixture recommendations/explanations, and the stored final-outcome hint are excluded from the model input. Duplicate step IDs require an occurrence-qualified reference; unknown or ambiguous citations invalidate a response.

Credential-like fields and selected sensitive fields are redacted best-effort before external transmission. This is not complete PII protection. Configurable limits (`DIAGNOSIS_MAX_STEPS`, `DIAGNOSIS_MAX_CHARS`, `DIAGNOSIS_MAX_STRING`) preserve structured fields where possible and record truncation/omission metadata. A trace fingerprint plus model, prompt version, and schema version provides the cache identity. A completed matching report is reused; regeneration is explicit; concurrent matching requests are deduplicated.

The report distinguishes recorded facts, model hypotheses, missing evidence, and proposed fixes. It identifies the earliest supported suspect step or returns null, considers alternatives, and never claims hidden reasoning or causal proof. Metadata shows live/demo source, model, timestamp, available provider token usage (or “Not returned by provider”), fingerprint, and truncation/redaction warnings. A valid `insufficient_evidence` response is rendered as an inconclusive report; malformed provider output is rendered as a failed request and is not relabeled as insufficient evidence.

Diagnosis failures include a sanitized correlation ID. Server logs record only the request ID, run ID, processing stage, category, attempt number, and provider HTTP status where available. They do not record API keys, authorization headers, provider response bodies, or trace contents. Provider HTTP 429 responses are surfaced separately as rate-limit failures; they are not silently retried.

### Live versus demo verification

The default test suite uses mocked provider responses and makes no network calls. Unless a compatible endpoint is actually configured and exercised, live-provider behavior is **NOT VERIFIED**. The demo report is an explicit synthetic example only. Public exposure and access control require later review because this repository has no authentication, authorization, or tenant isolation.

## Phase 4: Deterministic Counterfactual Simulation

Open a run and select **Counterfactual Simulation**. The simulator reads only the server-loaded recorded trace and evaluates one selected guardrail locally. It never calls an LLM, executes tools, changes the run or diagnosis, persists simulation output, or claims to prove prevention.

Implemented guardrails:

- Disambiguation before an order-specific action when the trace records multiple matching candidates.
- Customer confirmation before a consequential refund when confirmation is not resolved in the captured evidence.
- Eligibility/amount validation when a threshold is explicitly configured or recorded.
- Human approval when a configured or recorded threshold is exceeded; approval remains pending unless an approval event is recorded.

Each result includes a stable source fingerprint, engine version, guardrail configuration, explicit assumptions, missing evidence, intervention point, evidence references, original-versus-simulated step changes, divergence rationale, limitations, warnings, and structured proposed regression tests. Proposed tests are always labeled **proposed / not executed**; generated specifications are not proof that a fix works.

The original trace and Phase 3 diagnosis remain unchanged. A result can be `completed`, `insufficient_evidence`, or `not_applicable`; missing policy thresholds, confirmations, or approvals are not invented. Duplicate recorded step IDs use occurrence-qualified references. The implementation is a pure function in `src/lib/counterfactual-simulation.ts`, so identical trace/configuration inputs produce identical output.

Run the offline simulation tests with:

```bash
npm test
```

## Phase 5: Verification status

The recorded verification run is intentionally separated from implementation claims:

- **PASS:** An isolated-copy `npm ci` completed using Node **24.14.0** and npm **11.12.1**, with engine warnings because the project pins Node **24.22.0** and npm **11.19.1**. The install therefore does not verify a clean install under the pinned runtime.
- **PASS:** The isolated offline test suite passed **34/34**; typecheck, lint, and production build also passed.
- **PASS:** Production startup/API checks and isolated migration, seed, and persistence checks passed. Direct `curl` checks worked.
- **PASS:** `npm audit --omit=dev` reported **0 production vulnerabilities**. The tracked `.env.example` uses blank credential placeholders.
- **FAIL:** A full `npm audit` still reports **13 development-only vulnerabilities** (6 moderate, 7 high). Available fixes require breaking or unsafe force changes, so no blind remediation was applied.
- **BLOCKED:** Docker build/start/restart verification was not run because Docker was unavailable.
- **BLOCKED:** Browser automation timed out; direct HTTP checks succeeded, so no browser end-to-end pass is claimed.
- **NOT VERIFIED:** A live diagnosis provider was not configured or exercised. Diagnosis tests use mocked responses, and the seeded report is a labeled synthetic demo.

These results describe the checks that were actually recorded; they are not evidence of verification under Node 24.22.0/npm 11.19.1, in Docker, through browser automation, or against a live provider.

## Production build and start

```bash
npm run build
npm start
```

`npm start` first runs `src/db/start.ts`, which creates missing tables and seeds only when `agent_runs` is empty. Existing SQLite data is not deleted or reseeded on restart. The Next.js 16 production server then listens on `0.0.0.0:3000`.

## Docker

The Dockerfile uses Node 24.22.0 Bookworm slim, runs `npm ci` inside Linux, builds the production Next.js app, prunes dev dependencies from the runtime image, includes the runtime SQLite initialization source and `tsx`, runs as the non-root `node` user, and starts a production server.

```bash
docker build -t tracewreck .
docker run --rm -p 3000:3000 -v tracewreck-data:/app/data tracewreck
```

Open <http://localhost:3000>. On first startup, an empty mounted database is initialized and seeded. On later restarts with the same `tracewreck-data` volume, the existing data is preserved. Without the volume, removing the container removes its SQLite data. To intentionally reset fixtures in a running local container, explicitly opt in with `-e ALLOW_DEMO_RESET=true` and call:

```bash
docker run --rm -e ALLOW_DEMO_RESET=true -p 3000:3000 -v tracewreck-data:/app/data tracewreck
curl -X POST http://localhost:3000/api/seed
```

That endpoint is destructive to the local trace tables and is not an automatic startup mechanism. The Dockerfile defaults `ALLOW_DEMO_RESET=false`.

## Security and known limitations

- No authentication, authorization, tenant isolation, encryption-at-rest, or role model exists.
- The seed endpoints are destructive and intended for local development only.
- Trace payloads may contain sensitive data in real deployments; use synthetic data for this repository.
- SQLite is local storage, not a tamper-evident audit trail.
- `npm audit --omit=dev` was run for the recorded Phase 5 verification and reported **zero production advisories** without excluding optional dependencies. `tailwindcss-animate` is correctly classified as a build-time `devDependency`, so the Tailwind toolchain is not shipped as a production dependency. A separate full `npm audit` reported 13 development-only vulnerabilities (6 moderate, 7 high) in the existing Tailwind/PostCSS and Drizzle Kit/esbuild tool chains; the suggested fixes require breaking upgrades or unsafe downgrades, so no blind upgrade was applied. Passing an audit is not a security guarantee.
  - `GHSA-vfj7-8cjw-p6xm` (high; nested-pattern stack-exhaustion DoS): `tailwindcss@3.4.19 → chokidar@3.6.0 → braces@3.0.3`, `tailwindcss@3.4.19 → micromatch@4.0.8 → braces@3.0.3`, and `eslint-config-next@16.4.1 → @next/eslint-plugin-next@16.4.1 → fast-glob@3.3.1 → micromatch@4.0.8 → braces@3.0.3`. `braces@3.0.3` is installed; npm's clean parent remediation for the Tailwind paths is `tailwindcss@4.3.3`. The Next ESLint path has no supported patched parent upgrade identified by npm; its suggested `eslint-config-next@14.2.35` is an unsafe downgrade and is not used.
  - `GHSA-rj75-hqrm-r3gf` (moderate; quadratic selector parsing can exhaust CPU): `tailwindcss@3.4.19 → postcss-nested@6.2.0 → postcss-selector-parser@6.1.4`. The installed vulnerable package is `postcss-selector-parser@6.1.4`; the direct patched range is `>=7.1.6`, but `postcss-nested@6.2.0` requires the 6.x line. The supported clean parent remediation is the Tailwind 4.3.3 migration.
  - `GHSA-67mh-4wv8-2f99` (moderate; an exposed esbuild development server can read arbitrary cross-origin responses): `drizzle-kit@0.31.11 → @esbuild-kit/esm-loader@2.6.5 → @esbuild-kit/core-utils@3.3.2 → esbuild@0.18.20`. The installed vulnerable package is the nested `esbuild@0.18.20`; patched esbuild versions are `>0.24.2`, but this old nested loader chain has no focused supported upgrade in the current Drizzle Kit line. npm's suggested `drizzle-kit@0.18.1` is a downgrade and is not used.
  These are build/lint/development-tool findings, not production runtime findings. No `npm audit fix --force` was used.
- Docker build/start/restart checks are not verified when Docker Engine is unavailable.

## Troubleshooting

- **Wrong project directory:** run `pwd`, then `ls package.json package-lock.json`; commands must run from the repository root.
- **`npm ci` fails:** select Node 24.22.0 with `nvm use`, confirm both manifest and lockfile are present, and retry.
- **Empty dashboard:** run `npm run db:migrate` and `npm run db:seed`, or set `ALLOW_DEMO_RESET=true` in a local `.env.local` before calling `POST /api/seed`.
- **SQLite cannot open:** confirm `DATABASE_URL` is a valid relative `file:` path and that the process can create/write `data/`.
- **Container loses data:** use `-v tracewreck-data:/app/data` and keep the mount at `/app/data`.
- **Port 3000 is busy:** publish another host port, for example `-p 3001:3000`, and open <http://localhost:3001>.
- **Fixture data differs:** `npm run db:seed` intentionally replaces the local fixture set. The HTTP reset endpoint also replaces it only when explicitly enabled with `ALLOW_DEMO_RESET=true`.

## Old product-name references intentionally retained

The SQLite filename `agentpostmortem.db` remains in `.env.example`, Docker configuration, Drizzle configuration, and documentation so existing local databases and named volumes continue to work. The previous `__agentPostmortem*` global names are internal compatibility identifiers and are not user-facing branding.
