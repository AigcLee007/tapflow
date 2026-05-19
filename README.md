# AI Flow Workspace

This repository is being refactored into a single authenticated AI Flow workspace product.

The v2 product path keeps:

- login and tenant-aware auth
- one unified workspace shell
- one primary Flow canvas per project
- server-backed draft persistence
- cloud asset library
- server-side billing with reserve / settle / refund

Legacy UI and legacy APIs are still present in the repo for migration support, but they are no longer the normal user-facing product path.

## Current Product Routes

Normal user-facing routes:

- `/login`
- `/register`
- `/workspace`
- `/projects/:projectId`
- `/assets`
- `/billing`
- `/account`

Compatibility redirects:

- `/` -> anonymous users go to `/login`; authenticated users go to `/workspace`
- `/create/flow` -> redirects to `/workspace`
- `/create/classic` -> redirects to `/workspace`

Not normal user-facing entry points:

- `/admin`
- `/model-mapping`

## Runtime Layout

Primary v2 runtime:

- frontend: Vite + React
- API: `apps/api`
- worker: `apps/worker`
- database: `packages/db`
- object storage helpers: `packages/storage`
- queue/redis helpers: `packages/redis`

Legacy runtime retained for migration/debug only:

- `server.cjs`
- legacy account / billing / classic canvas flows
- legacy UI archive under `legacy/ui/components/`
- legacy classic canvas subtree under `legacy/ui/classic-canvas/`
- compatibility shims in `src/{hooks,store,services}` are temporary legacy bridges and must not be used by the v2 product path

## Local Development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start local infrastructure:

   ```bash
   npm run dev:infra
   ```

3. Start the v2 API:

   ```bash
   npm run dev:api
   ```

4. Start the v2 worker:

   ```bash
   npm run dev:worker
   ```

5. Start the frontend:

   ```bash
   npm run dev
   ```

Useful scripts:

- `npm run build`
- `npm run build --workspace @aigc-flow/api`
- `npm run build --workspace @aigc-flow/db`
- `npm run build --workspace @aigc-flow/worker`
- `npm test`
- `npm run db:migrate`

Combined v2 entry:

```bash
npm run start:v2
```

Use legacy commands only when you explicitly need migration or rollback support:

- `npm run legacy:server`
- `npm run legacy:start`

## Product Flow

1. User logs in through `/api/v2/auth/*`.
2. User lands in `/workspace`.
3. Creating a project creates one project and one primary Flow canvas.
4. Opening `/projects/:projectId` loads the server-backed draft for that project flow.
5. Uploads and generated outputs become `assets` records backed by object storage.
6. Billing and workflow execution run through v2 billing and workflow APIs.

## Persistence Rules

### Projects and canvas

- Each user-facing project maps to one primary Flow canvas.
- High-frequency draft persistence goes to `flow_drafts`.
- `flow_versions` is for snapshots/history, not autosave.
- New main paths do not use browser `localStorage` or IndexedDB as the authoritative canvas store.

### Assets

- Authoritative asset data lives in `assets` and object storage.
- Canvas node data should reference `assetId`.
- Signed URLs and preview URLs are UI conveniences, not the source of truth.

### Billing

- Billing UI reads:
  - `GET /api/v2/billing/summary`
  - `GET /api/v2/billing/usage-events`
  - `GET /api/v2/billing/ledger`
- Billing mutations use v2 APIs such as redeem and payment checkout placeholders.
- Workflow billing follows:
  1. reserve
  2. enqueue/run
  3. settle on success
  4. refund/release on failure

The frontend never directly mutates balances.

## Authentication

The main auth flow uses:

- `POST /api/v2/auth/register`
- `POST /api/v2/auth/login`
- `POST /api/v2/auth/refresh`
- `POST /api/v2/auth/logout`
- `GET /api/v2/auth/me`

Auth state is centralized in:

- `src/auth/AuthProvider.tsx`
- `src/auth/useAuth.ts`
- `src/services/v2HttpClient.ts`
- `src/services/v2AuthClient.ts`

## Billing and Workflow Notes

- Billing state changes happen on the server only.
- Reserve / settle / refund actions are idempotent.
- Insufficient balance returns `402 INSUFFICIENT_BALANCE`.
- Failed workflow retries must not duplicate charges.

## Documentation

Project instructions and handoff docs:

- [docs/AGENTS.md](./docs/AGENTS.md)
- [docs/DEVELOPMENT_PLAN.md](./docs/DEVELOPMENT_PLAN.md)
- [docs/CODEX_HANDOFF.md](./docs/CODEX_HANDOFF.md)

For v2 local setup details, see:

- [docs/v2-local-development.md](./docs/v2-local-development.md)
