# TanStack Taskboard

A meaningful server-rendered (SSR) taskboard built with
**[TanStack Start](https://tanstack.com/start)** (React + Nitro) and **real
SQLite** persistence. Every page reads are performed server-side from SQLite;
all writes go through validated, server-side mutations (TanStack Start server
functions) and the documented [`/api/tasks`](#http-api) REST surface.

It is a functional replacement of the original `mcpqa-tanstack-start` fixture
for xCloud git-deployment QA: it ships deterministic schema/init, health
endpoints with a real DB check, a release marker, and an end-to-end
verification script that runs against a real production server.

## Stack

- **Framework**: [TanStack Start](https://tanstack.com/start) (file-based
  routing via `@tanstack/react-router`, SSR + client hydration, Nitro server
  adapter).
- **Data**: [SQLite](https://nodejs.org/api/sqlite.html) via Node's built-in
  `node:sqlite` — no ORM, no native compile step, no fake/in-memory API.
  Data lives in a durable file that survives restarts.
- **Validation**: [Zod](https://zod.dev) v4 on the server boundaries (server
  functions + REST) and for URL search params.
- **Runtime**: Node `>=22.12.0` (required by `@tanstack/react-start`);
  `node:sqlite` is used as-is on Node 22.

## Feature set

- **Server-rendered DB reads** — the index route's loader calls a server
  function that queries SQLite during SSR; the returned HTML already contains
  the task list (verified by `scripts/verify.sh`).
- **Server-side form mutations / hydration** — create, inline edit, status
  change and delete all POST to `createServerFn` endpoints, are Zod-validated
  on the server, then `router.invalidate()` re-reads the DB so server and
  client stay coherent.
- **Validated CRUD + filter UI** — full create/read/update/delete plus a
  `?status=` filter (all / todo / in_progress / done) validated as a search
  param and respected both in the SSR loader and the filter links.
- **SQLite persistence across restart** — verified by `scripts/verify.sh`
  (create a task, restart the server, assert it is still there).
- **Deterministic schema/init** — `CREATE TABLE IF NOT EXISTS` + a fixed,
  idempotent seed (seeded only when the table is empty) + `PRAGMA user_version`.
- **Liveness / readiness with DB check** — see [Health](#health).
- **Release marker** — the page footer and health payload expose
  `tanstack-taskboard OK` v1.0.0.
- **No runtime artifacts** — build output (`.output/`), dev caches and the
  SQLite data directory are gitignored.

## Getting started

```bash
# Install (Node >= 22.12.0 required)
npm ci

# Local development (hot reload, port 3000)
npm run dev

# Production build
npm run build

# Production server (reads PORT and HOST env vars)
npm run start
```

### Commands

| Command                  | Purpose                                        |
| ------------------------ | ---------------------------------------------- |
| `npm run dev`            | Vite dev server (HMR) on port `3000`           |
| `npm run generate-routes`| Regenerate `src/routeTree.gen.ts`              |
| `npm run typecheck`      | `tsc --noEmit` strict typecheck                |
| `npm run build`          | Production build (Nitro `node-server` preset)  |
| `npm run start`          | Run `.output/server/index.mjs`                 |
| `npm run verify`         | End-to-end verification against a prod server  |

### Environment variables (see `.env.example`)

| Variable         | Default             | Purpose                                        |
| ---------------- | ------------------- | ---------------------------------------------- |
| `PORT`           | `3000`              | TCP port for the production server             |
| `HOST`           | `0.0.0.0`           | Bind interface for the production server       |
| `DATABASE_PATH`  | `./data/taskboard.db` | Path to the SQLite database file (file-backed) |

The SQLite file is created on first use; parent directories are created
automatically. Deleting it resets to the deterministic seed.

## Project layout

```text
src/
  functions/tasks.functions.ts   createServerFn RPCs used by the UI
  lib/schemas.ts                 shared Zod schemas (client-safe)
  lib/release.ts                 release marker / version
  lib/db.server.ts               node:sqlite connection + deterministic init
  lib/tasks.server.ts            server-only task service (single source)
  routes/__root.tsx              root layout / head
  routes/index.tsx               taskboard page (SSR loader + filter + forms)
  routes/api/tasks.ts            /api/tasks REST surface (CRUD, validated)
  routes/api/health.ts           /api/health combined summary
  routes/api/health.live.ts      liveness probe
  routes/api/health.ready.ts     readiness probe (checks the DB)
  start.ts                       Start instance (CSRF middleware)
scripts/verify.sh                production end-to-end verification
```

Conventions follow TanStack Start docs: loaders are isomorphic and only call
server functions (`createServerFn`) — they never touch the DB directly;
server-only logic lives in `*.server.ts`; the same task service backs both the
REST API and the server functions so SSR stays independent of URL resolution.

## Health

| Endpoint            | Semantics                                        |
| ------------------- | ------------------------------------------------ |
| `GET /api/health/live`  | Liveness — returns `200 {"status":"ok"}` as long as the process is up. |
| `GET /api/health/ready` | Readiness — runs a real `SELECT 1` against SQLite; `200` when the DB answers, `503` otherwise. |
| `GET /api/health`       | Summary — status, DB check result and release marker. |

## HTTP API

`GET /api/tasks[?status=todo|in_progress|done|all]` — list tasks (server-rendered data, no client simulation).

`POST /api/tasks` — `{"title": "<1..120 chars>", "priority": "low|medium|high", "status": "..."}` → `201` with the task, `400` with Zod issues when invalid.

`PATCH /api/tasks` — `{"id": 1, "title"?, "status"?, "priority"?}` → `200`, `400` invalid, `404` unknown id.

`DELETE /api/tasks?id=<n>` — deletes the task → `200 {"deleted": true}`, `400` invalid id, `404` unknown id.

## Release marker

The index route footer and the `/api/health` payload expose
`tanstack-taskboard OK` and `tanstack-taskboard v1.0.0`
(defined in `src/lib/release.ts`).

## Verification

`scripts/verify.sh` performs:
1. a fresh **production build**;
2. **smoke** checks that the SSR HTML contains DB-seeded tasks and the release marker;
3. **health** checks (live + ready-with-DB + release payload);
4. **CRUD** checks over `/api/tasks` including the `?status=` filter;
5. **error** checks (`400` validation, `404` missing task, `404` unknown route);
6. **persistence**: creates a task, restarts the production server, and asserts it survives.

It binds a private port (`127.0.0.1:4487` by default, override with
`VERIFY_PORT`), uses its own temporary database, and terminates only the
server process it spawned.

```bash
npm run verify
VERIFY_PORT=8181 npm run verify
```

## FAQ

- **Why `node:sqlite`?** It is real, durable SQLite on Node 22 with no native
  build step — deterministic and dependency-free for host deployment QA.
- **The `ExperimentalWarning: SQLite is an experimental feature`** message may
  appear on Node 22 stderr; it is harmless. Use `NODE_OPTIONS=--no-warnings`
  or a newer Node release (where `node:sqlite` is stable) to silence it.

## License

[MIT](./LICENSE)