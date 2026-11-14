# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Heart Health Tips** — a patient-education app for people living with heart disease: a
searchable library of tips (nutrition, activity, medication, monitoring, lifestyle) plus a
permanent emergency warning-signs card. It deploys to the Substrait platform (see the
managed contract block at the end of this file).

## Commands

There is no test suite and no linter/formatter configured — don't claim otherwise or add
them unprompted.

```bash
# Local dev (needs Docker for the DB; see "No local database" below)
docker compose up -d db && docker compose run --rm migrate   # MySQL + Flyway
cd backend  && DATABASE_URL="mysql://root:root@localhost:3306/app" uvicorn main:app --reload
cd frontend && npm install && npm run dev                    # Vite proxies /api -> :8000

# Frontend build (also what the deploy runs)
cd frontend && npm run build

# Backend deps, in a venv OUTSIDE the repo so it never lands in the upload
python3 -m venv /tmp/ht-venv && /tmp/ht-venv/bin/pip install -r backend/requirements.txt
```

**No local database in this environment.** There is no Docker, no root, and no
`mysqld`/`mariadbd`, so `docker compose` won't run. To verify SQL without a DB, parse the
migration and the query strings with `sqlglot` (dialect `mysql`), and/or run the
`main.py` handlers against an in-memory SQLite mirror behind an async shim that only
rewrites `%s` → `?` and `INSERT IGNORE` → `INSERT OR IGNORE`. That tests the real query
text; what it does *not* prove is OceanBase behaviour — a deploy is the real test.

## Architecture

Three layers, each with a piece of the category vocabulary. **These must stay in sync:**

| Concern | Location |
|---|---|
| Tip content (source of truth) | `backend/resources/db/migration/V1__init.sql` |
| Category ordering | `CATEGORY_ORDER` in `backend/main.py` |
| Category labels + colours | `CATEGORY_META` in `frontend/src/App.jsx` |

The slugs are `warning`, `nutrition`, `activity`, `medication`, `monitoring`, `lifestyle`
(DB order is by `sort_order` — tens per category, `warning` at 510+ so it sorts last in
raw queries). Both sides degrade gracefully: the backend appends any category it doesn't
know about, and the frontend's `meta()` falls back to a grey chip — so a **missing**
entry is a cosmetic bug, not a crash. Adding a category still means editing all three.

**Tips carry a `why` rationale.** Every tip explains why it helps; the UI renders it as a
subdued aside. Keep that pattern — it is the app's main claim to being more than a list.

**The warning category is special.** `GET /api/today` excludes `warning` from its
rotation (those belong in the fixed emergency card the UI always shows), and the frontend
re-sorts any visible warning tips to the top regardless of filter. If you add warning-sign
content, it goes in the card or the category — not the daily rotation.

**Content policy:** general patient education only. No dosing advice, no numbers that
could override a user's own care plan. The app is careful to defer to the user's care
team, and there is a seeded tip saying exactly that — don't dilute it.

### Favourites identity

`_user_key()` in `backend/main.py` resolves who a favourite belongs to, in this order:

1. `X-Forwarded-Email` — set by the platform's auth proxy when the owner enables Google
   SSO. Unspoofable *only* while SSO is on.
2. `X-Client-Id` — a `crypto.randomUUID()` the frontend persists in `localStorage`.
3. Neither → `None`, and the favourites endpoints return `ok: false, note: "no user
   identity"` rather than erroring.

This is a **convenience key, not access control** — anyone can send either header, and
favourites aren't sensitive. Never gate real data on it.

### Database access

`asyncmy` with `%s` placeholders, against a MySQL-wire `DATABASE_URL`. OceanBase is
**not** PostgreSQL: no `asyncpg`, no `$1`. A module-level `_pool` is `None` when
`DATABASE_URL` is unset, and every read endpoint degrades to an empty result with a
`note` instead of raising — that is deliberate, so a databaseless boot still serves
`/health` and the UI shows a message rather than a blank page.

### API shape

Every route declares a `response_model`. That is what puts real field names and types in
`/openapi.json`, which feeds the portal's API tab and the API Library — a bare
`return {...}` publishes "object, any fields" and breaks that. New endpoints keep the
pattern.

Routes: `/health`, and under `/api`: `config`, `me`, `categories`, `tips`
(`?category=`, `?q=`, `?limit=`, `?offset=`; returns `has_more`), `today`, `reviews`,
`favourites`, `favourites/{tip_id}` (POST — 404 unknown tip, 409 at the per-user cap,
429 when write-limited; DELETE — idempotent).

`/api/today` returns `null` (not 503) when `DATABASE_URL` is unset — the daily tip is
decoration and must not make a databaseless boot look broken.

### Search

`?q=` is not plain `LIKE`. `_expand_term` maps a word through `_SYNONYM_GROUPS` and
`_SPELLING`, and `_term_groups` extracts multi-word phrases first so "blood pressure"
is one term rather than `blood AND pressure`. Expansions shorter than 4 characters are
dropped because `LIKE '%x%'` makes short aliases match unrelated words ("flu" hits
"fluid"). If the widened query finds nothing, `_fuzzy_terms` retries once against
`_SEARCH_VOCAB`. Extend the groups/vocab when adding content vocabulary; keep the
30-second mental test: does "fiber" find "fibre", and does a typo still find the tip?

### Clinical review metadata

`tips.reviewed_on` / `reviewed_by` / `source` (`V2`, `V3`). **All reviews are `NULL` on
purpose** — no clinician has signed off. The UI renders "Not yet clinically reviewed";
`/api/reviews` counts coverage and reports anything past `REVIEW_INTERVAL_MONTHS`
(default 12) as due, and a NULL date always counts as due. When a real review happens,
set the columns in a new migration — never backfill a guessed date or an invented
reviewer name to make the number look better.

### Frontend

React 18 + Vite + Tailwind, no router (single page, all state in `App.jsx`). Talks to the
backend only through relative `/api` paths via the `api()` helper (which also injects
`X-Client-Id`). Favourite toggles are optimistic, reconciled on failure. Search input is
debounced 250 ms; the effect aborts stale responses with a `cancelled` flag.

Sizing is deliberately generous (base font 1.0625rem, big tap targets, visible
`:focus-visible` ring, skip link) because the audience skews older. Don't trim those for
visual density.

Offline staleness: `sw.js` marks cache-served responses with `X-From-Cache` and
`X-Cached-Age`; `api()` lifts those onto the parsed object as a non-enumerable
`__cache`, and the UI shows a "saved copy from 3 days ago" banner. Don't strip that —
a cached tip presented as current is the failure mode it exists to prevent.

Printing (F6.9): a Print button calls `window.print()`; `@media print` hides `.no-print`
chrome and keeps `.print-source`. Paper is a real delivery channel for this audience.

## Constraints worth knowing before editing

- **Never edit `V1__init.sql` once it has deployed anywhere.** Flyway records a checksum;
  editing it breaks the next deploy of that environment with `Migration checksum
  mismatch`. Schema or seed changes go in a new `V2__*.sql`. (`V2` adds review
  metadata, `V3` sets tip sources — both applied, neither revisable.)
- On OceanBase, never add a column and a foreign key in one `ALTER TABLE`, and never use a
  self-referencing `ON DELETE CASCADE`. A failed migration wedges every later deploy until
  the portal's **Repair migration history** is run.
- `cicd/nginx.conf` must not reverse-proxy `/api` — the ingress routes it, and an
  unresolvable upstream hostname makes nginx refuse to start (frontend crash-loop).
- Keep the security-upgrade line directly under the `FROM` in both Dockerfiles, and keep
  the runtime bases on floating tags (`nginx:stable-alpine`, `python:3.12-slim`). A pinned
  minor accumulates fixable CVEs that block promotion to production.
- `APP_TITLE` (backend env var) is the app's display name — the backend serves it via
  `/api/config` and the frontend sets the header and `document.title` from it. Don't
  hard-code the title in `App.jsx`.
- Uploads are source-only, ≤ 16 MB. `node_modules/`, `dist/`, `__pycache__/` and `.venv/`
  are gitignored — keep it that way.

---

<!-- The block below is generated and maintained by the substrait plugin. Do not hand-edit
     inside it; `/substrait:link` and `/substrait:deploy` rewrite it. -->

<!-- BEGIN substrait-app contract (v7) — managed by the substrait plugin (link/deploy); edits inside this block are overwritten on update. Delete the whole block to opt out. -->
## Substrait deployment

**Linked app:** `cardiac-care-tips` — https://cardiac-care-tips.dev.sctp-dsai-1.apps.pluto.substrait.build

This project deploys to the **Substrait platform** (linked via the gitignored
`.substrait/config.json`). Deploy with **`/substrait:deploy`** (packages source-only,
uploads, `--watch` follows the build to the live preview); re-link with
`/substrait:link`. When the DEPLOYED app misbehaves (500s, blank page, a change that
didn't take), read its runtime logs with **`/substrait:logs`** — `--watch` stops at the
green deploy and cannot see runtime faults. The `substrait-app` skill has the full
contract; the essentials:

**Hard requirements (platform-enforced):**
- Backend in any language. Its Dockerfile — `cicd/Dockerfile.backend` (repo-root build
  context), `cicd/Dockerfile`, or `backend/Dockerfile` (backend/ context) — must
  `EXPOSE 8000`, serve `GET /health` (200) and the API under **`/api`**.
- Frontend optional, any framework: built site served on **port 80** via
  `cicd/Dockerfile.frontend` (or `frontend/Dockerfile`). One ingress host routes
  `/api` → backend, everything else → frontend (no `frontend/` → everything → backend,
  so serve `/` yourself). The frontend calls the API via **relative `/api` paths** —
  never an absolute URL, never `VITE_API_URL`.
- Database is **explicit**: declare `database:` in `substrait.yaml` and the platform
  provisions it and injects `DATABASE_URL`; no declaration → no database, no
  `DATABASE_URL` (`JWT_SECRET` is always injected). Engines: `oceanbase` (default —
  shared HA cluster, MySQL wire, backed up, portal Database tab) or `postgres` /
  `mysql` (the app's own single-node pod + disk: real engine, but no HA, no backups,
  no Database-tab tooling). The engine can't change after the first deploy. **All DDL
  lives in Flyway files** `backend/resources/db/migration/V*.sql` in that engine's
  dialect — the app never `CREATE TABLE`s, and migrations without a `database:`
  declaration fail validation.
- Backing services (redis / kafka / qdrant / object-storage): declare them in a
  **`substrait.yaml`** at the repo root (`services: {redis: {}, kafka: {persistent: true},
  qdrant: {}, object-storage: {}}`) — the platform provisions them and injects
  `REDIS_URL` / `KAFKA_BROKERS` / `QDRANT_URL` / `OBJECT_STORAGE_BUCKET` only for what's
  declared. The three pod services are ephemeral unless `persistent: true`;
  `object-storage` is a private file bucket per app PER ENVIRONMENT — durable, no options,
  no credential to configure, and removing the declaration never deletes the files. Read
  `OBJECT_STORAGE_BUCKET` rather than hard-coding a name; a new environment's bucket
  starts empty.
- Custom env vars/secrets: declare in `backend/.env.example` (`NAME=value`, trailing
  `# secret` marks a secret) — the portal pre-creates them for the owner to fill in.
  Build-time frontend vars go in a committed `frontend/.env.production` (public,
  non-secret values only).
- Never create `k8s/` (platform-owned, discarded). Uploads are source-only, ≤ 16 MB
  (no `node_modules/`, `.venv/`, `dist/`, build output).

**Platform capabilities to build on:**
- **User identity (Google SSO):** when the app owner enables SSO (portal Access tab),
  every gated backend request carries unspoofable `X-Forwarded-Email` /
  `X-Forwarded-User` headers — identity with no OAuth flow in the app. Absent in local
  dev, on declared public paths, and when SSO is off (then they're client-spoofable —
  never treat as access control). The browser can't see them: expose e.g. `/api/me`.
  SSO-exempt paths (MCP servers, webhooks) are declared on the Access tab and must be
  authenticated by the app itself (e.g. Bearer token from an env secret).
- **API endpoint inventory:** the portal's API tab lists the backend's endpoints,
  auto-harvested from the app's OpenAPI spec after each deploy (FastAPI serves
  `/openapi.json` by default). Spec-less stacks: `/substrait:deploy` generates
  `.substrait/endpoints.json` instead.

**Local dev:** use a MySQL-wire DB so drivers/migrations run unchanged — never SQLite.
Scaffolded projects: `docker compose up -d db && docker compose run --rm migrate`, then
the backend on `:8000` (reading `DATABASE_URL`) and `npm run dev` in `frontend/`.
<!-- END substrait-app contract -->
