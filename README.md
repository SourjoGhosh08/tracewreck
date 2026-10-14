# AgentPostmortem Phase 1

Backend foundation for inspecting AI-agent runs and their structured execution traces. Phase 1 includes a Next.js 14 / TypeScript application foundation, a local Drizzle SQLite database, deterministic fixtures, and read/seed API routes. UI pages and LLM integrations are intentionally not included.

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

- `GET /api/runs` returns all eight seeded runs, newest first.
- `GET /api/runs/:id` returns one run, including its exact structured `trace` JSON, or a 404 for an unknown id.
- `POST /api/seed` resets and inserts the deterministic eight-run fixture set. `POST /api/runs` is also supported as an equivalent convenience endpoint.

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
