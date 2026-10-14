# AgentPostmortem Phase 1

Backend foundation for inspecting AI-agent runs and their structured execution traces. It uses Next.js 14, TypeScript, Drizzle, and SQLite with normalized `agent_runs` and `trace_steps` tables.

## Requirements

- Node.js `20.18.1` (see `.nvmrc`)
- npm 10+

## Setup

```bash
npm ci
cp .env.example .env.local
npm run db:migrate
npm run db:seed
```

`DATABASE_URL` defaults to `file:./data/agentpostmortem.db`; the `data/` directory is created automatically and is ignored by Git.

## Run

```bash
npm run dev
```

The API is available at `http://localhost:3000/api/runs`.

## API

- `GET /api/runs` returns all eight seeded run summaries, newest first. Each summary exposes the dashboard fields directly as `task_summary`, `llm_calls`, `tool_calls`, `total_tokens_in`, `total_tokens_out`, and the other `agent_runs` fields. Optional filters are `status` (`success`, `suspicious`, or `failed`), `agent`/`agentName`, and `failureClass`.
- `GET /api/runs/:id` returns one normalized run, a top-level `steps` array, and `run.trace.steps` (with `run.trace.events` retained as an alias). Every step includes `step_id`, `parent_step_id`, `type`, `title`, `started_at`, `ended_at`, `input`, `output`, `tokens_in`, `tokens_out`, `latency_ms`, `status`, `risk_score`, `notes`, and `is_first_faulty_step`.
- `POST /api/seed` resets both tables and inserts exactly eight deterministic fixtures: four `success`, two `suspicious`, and two `failed` runs. The damaged-headphones failure records the wrong-order first fault, policy recommendation, refund, and email actions. `POST /api/runs` remains an equivalent convenience endpoint.

## Database contract

`agent_runs` contains `id`, `agent_name`, `agent_version`, `model`, `task_summary`, `user_request`, `status`, `final_outcome`, `failure_class`, `started_at`, `ended_at`, `duration_ms`, `total_tokens_in`, `total_tokens_out`, `llm_calls`, `tool_calls`, and `created_at`.

`trace_steps` contains `id`, `run_id`, `step_id`, `parent_step_id`, `type`, `title`, `started_at`, `ended_at`, `input_json`, `output_json`, `tokens_in`, `tokens_out`, `latency_ms`, `status`, `risk_score`, `notes`, and `is_first_faulty_step`.

## Checks

```bash
npm test
npm run build
```

`npm test` is the single offline check command and runs the strict TypeScript check.

## Docker

```bash
docker run --rm -p 3000:3000 -v agentpostmortem-data:/app/data agentpostmortem
```

The image contains all runtime dependencies and uses the local SQLite database; no secrets are required.
