# AgentPostmortem Phase 1

Backend foundation for inspecting AI-agent runs and their structured execution traces. Phase 1 uses Next.js 14, TypeScript, Drizzle, and SQLite with normalized `agent_runs` and `trace_steps` tables.

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

- `GET /api/runs` returns all eight seeded run summaries, newest first. Optional filters are `status` (`success`, `suspicious`, or `failed`), `agent`/`agentName`, and `failureClass`.
- `GET /api/runs/:id` returns one run with its normalized steps and a structured `run.trace.events` trace, or a 404 for an unknown id. Trace events include `stepIndex`, `type`, `status`, payloads, errors, and `isFirstFaultyStep`.
- `POST /api/seed` resets both tables and inserts exactly eight deterministic fixtures: four `success`, two `suspicious`, and two `failed` runs. `POST /api/runs` remains an equivalent convenience endpoint.

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
