# AGENTS.md

## Project mission

This repository is being refactored into a single authenticated AI Flow workspace product.

The final product must keep:

- User login and tenant-aware auth.
- TapNow-style workspace project list.
- One Flow canvas per user-facing project.
- Server-side canvas persistence.
- Cloud asset library.
- Billing, credits, reserve/settle/refund, and ledger records.

The final product must remove or stop using as primary product paths:

- The old `InfiniteCanvas` classic UI.
- `/create/classic` as a product route.
- Browser localStorage/IndexedDB as the authoritative canvas or asset store.
- Legacy account/billing frontend API calls when a `/api/v2/*` equivalent exists.
- Multiple disconnected frontend shells.

Read `DEVELOPMENT_PLAN.md` before implementing large changes.

---

## Current architecture direction

Use the v2 runtime as the main path:

- Frontend: Vite + React.
- Flow canvas: `@xyflow/react`.
- Backend API: `apps/api`.
- Worker: `apps/worker`.
- Database and migrations: `packages/db`.
- Object storage: existing storage packages and S3-compatible flow.
- Queue/background work: Redis/BullMQ where already used.

Prefer existing project conventions and avoid adding new production dependencies unless necessary.

---

## Required product routes

Implement or preserve these as the only normal user-facing routes:

```txt
/login
/register
/workspace
/projects/:projectId
/assets
/billing
/account
```

Route compatibility:

```txt
/                -> authenticated users go to /workspace; anonymous users go to /login
/create/flow     -> redirect to /workspace or a selected project
/create/classic  -> redirect to /workspace
/admin           -> not a normal user-facing route
/model-mapping   -> not a normal user-facing route
```

---

## Implementation rules

### Auth

- Use `/api/v2/auth/register`, `/api/v2/auth/login`, `/api/v2/auth/refresh`, `/api/v2/auth/logout`, and `/api/v2/auth/me`.
- Add an `AuthProvider` and `AuthGate`.
- Do not rely on legacy `/api/auth/*` as the main path.
- Keep token handling centralized in `src/services/v2HttpClient.ts` and `src/services/v2AuthClient.ts`.
- If token refresh fails, clear auth state and return to `/login`.

### App shell

- Replace the overloaded root `App.tsx` with a small composition:
  - `AuthProvider`
  - `AppRouter`
  - `WorkspaceShell`
- Do not keep `InfiniteCanvas`, `ControlPanel`, `MobileView`, or legacy create UI mounted from the root app router.
- Do not delete large legacy files in the same PR that introduces new routing. First remove references, build, then clean up in a later PR.

### Workspace and projects

- The user-facing concept is: one project has one primary canvas.
- Internally, it is acceptable to keep `project -> flow`, but the UI should not expose multiple flows per project.
- Creating a workspace project should create:
  1. `projects` row
  2. default `flows` row
  3. default `flow_drafts` row
- Project cards should support name, updated time, cover image, and basic counts when available.

### Canvas persistence

- Do not use localStorage or IndexedDB as the authoritative canvas store.
- Add or use `flow_drafts` for high-frequency autosave.
- Keep `flow_versions` for snapshots/publish/history, not high-frequency autosave.
- Persist this graph shape at minimum:

```ts
{
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 }
}
```

- Autosave should be debounced and expose save status in the UI.
- If using revision numbers, return 409 on stale writes and show a clear conflict message.

### Assets

- Do not store image/video/audio base64 or blob URLs as authoritative node data.
- Upload files through the backend asset flow and object storage.
- Node data should persist `assetId` as the source of truth.
- Temporary preview or signed URLs may be cached in UI state, but must be recoverable from `assetId`.
- Generated outputs must become `assets` records and appear in `/assets`.

### Billing

- User-facing balance can be shown as credits/points.
- Billing state must be changed only on the server.
- Generation workflow should follow:
  1. estimate cost
  2. reserve credits
  3. enqueue/run job
  4. settle on success
  5. refund/release on failure
- Use idempotency keys for reserve, usage, settle, refund, redeem, and payment webhook flows.
- Billing UI should read `/api/v2/billing/summary`, `/api/v2/billing/usage-events`, and `/api/v2/billing/ledger`.

### Database

- Every new multi-tenant table must include `tenant_id` unless there is a strong reason not to.
- Add indexes for common tenant-scoped queries.
- Add RLS policies using the existing tenant context pattern.
- Do not create migrations that assume only one tenant.
- Do not store provider secrets, payment secrets, or raw API keys in frontend-visible data.

---

## Suggested files to inspect first

When working on routing and app shell:

```txt
App.tsx
src/services/accountIdentity.ts
components/BillingCenterPage.tsx
components/AccountCenterPage.tsx
src/flowCanvas/FlowCanvasPage.tsx
src/flowCanvas/pages/ImageLibraryPage.tsx
```

When working on backend modules:

```txt
apps/api/src/app.ts
apps/api/src/modules/auth/*
apps/api/src/modules/projects/*
apps/api/src/modules/flows/*
apps/api/src/modules/assets/*
apps/api/src/modules/billing/*
packages/db/migrations/*
packages/db/src/*
```

When working on canvas state:

```txt
src/flowCanvas/**
src/store/canvasStore.ts
src/services/assetStorage.ts
src/flowCanvas/store/imageFolderStore.ts
```

---

## Commands

Use the existing npm scripts unless package files change:

```bash
npm run dev
npm run build
npm test
npm run dev:infra
npm run dev:api
npm run dev:worker
npm run db:migrate
```

For each implementation task, run at least:

```bash
npm run build
```

Run tests when touching backend services, database logic, billing, auth, or worker behavior:

```bash
npm test
```

If a command fails because the local environment is missing infrastructure, report the exact failure and what was already validated.

---

## PR and change management

Prefer small PRs in this order:

1. `app-router-auth-shell`
2. `workspace-projects`
3. `flow-drafts-remote-autosave`
4. `asset-library-server-side`
5. `canvas-asset-id-migration`
6. `billing-redeem-pricing`
7. `workflow-billing-reserve-settle-refund`
8. `cleanup-legacy-ui`
9. `docs-and-agent-instructions`

Do not mix unrelated areas in one PR. For example, do not combine billing reserve/settle with App router cleanup unless the task explicitly requires it.

---

## Definition of Done

A task is not done until:

- The main user flow affected by the change works from the UI.
- `npm run build` passes, or the failure is documented with a concrete reason.
- Relevant tests pass, or missing infrastructure is documented.
- New APIs use auth and tenant checks.
- New tables have tenant isolation and RLS where applicable.
- No new browser local persistence is introduced as authoritative storage.
- No secrets are exposed to the frontend.
- The final response lists changed files, validation commands, and known follow-ups.

---

## Prohibited shortcuts

Do not:

- Keep old local canvas persistence and call it "server sync".
- Store base64 images in `graph_json`.
- Use frontend-only balance updates for billing.
- Delete legacy UI files before the replacement route builds successfully.
- Add a new router library unless necessary.
- Add a new state manager unless necessary.
- Bypass tenant isolation to make development easier.
- Hardcode a single user, tenant, project, model, or price in production code.

---

## If the plan conflicts with code

When the codebase differs from `DEVELOPMENT_PLAN.md`, inspect the current code and choose the safest minimal change that advances the plan. Then update `DEVELOPMENT_PLAN.md` or this file if the discovered repo reality changes the implementation strategy.
