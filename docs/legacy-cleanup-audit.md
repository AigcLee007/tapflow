# Legacy Cleanup Audit (Sprint 7.1)

Date: 2026-05-19  
Branch: `main`  
Workspace status: clean (`git status --short` empty, `git status -sb` => `## main...origin/main`)

This audit follows:
- `AGENTS.md`
- `docs/DEVELOPMENT_PLAN.md`
- `docs/CODEX_HANDOFF.md`
- `docs/v2-local-development.md`

Scope rule for Sprint 7.1: audit only, no business-code deletion/modification, no new feature work.

## 1) Current Legacy File Inventory

All required audit targets exist in repo:

- `components/InfiniteCanvas.tsx`
- `components/ControlPanel.tsx`
- `components/Toolbar.tsx`
- `components/MobileView.tsx`
- `src/store/canvasStore.ts`
- `src/hooks/useCanvasOperations.ts`
- `src/services/assetStorage.ts`
- `src/flowCanvas/store/imageFolderStore.ts`
- `components/AccountCenterPage.tsx`
- `components/BillingCenterPage.tsx`
- `src/services/accountService.ts`
- `src/services/accountIdentity.ts`
- `server.cjs`
- `authStore.cjs`, `authStore.file.cjs`, `authStore.mysql.cjs`
- `billingStore.cjs`, `billingStore.file.cjs`, `billingStore.mysql.cjs`
- `generationRecordStore.cjs`, `generationRecordStore.file.cjs`, `generationRecordStore.mysql.cjs`
- `flowProjectStore.cjs`
- `generatedAssetService.cjs`

## 2) Per-file Reference Audit

| File | Referenced? | Reference sources (examples) | On new main path? | Recommendation |
|---|---|---|---|---|
| `components/InfiniteCanvas.tsx` | No active runtime import found | Only self/doc mentions (`docs/*`, plans) | No | `move to legacy/` then `delete` in later phase |
| `components/ControlPanel.tsx` | Yes | `components/ContextMenu.tsx` | No | `move to legacy/` (not safe to delete alone yet) |
| `components/Toolbar.tsx` | No active runtime import found | Mostly self/doc mentions | No | `move to legacy/` then `delete` |
| `components/MobileView.tsx` | No active runtime import found | Mostly self/doc mentions | No | `move to legacy/` then `delete` |
| `src/store/canvasStore.ts` | Yes | `components/CanvasNode.tsx`, `components/ControlPanel.tsx`, `components/InfiniteCanvas.tsx`, multiple `src/hooks/*` legacy hooks | No | `keep as migration reference` until legacy UI slice removed |
| `src/hooks/useCanvasOperations.ts` | Yes | `components/MultiSelectToolbar.tsx`, `components/ContextSatellite/SatelliteLayer.tsx` | No | `keep as migration reference` |
| `src/services/assetStorage.ts` | Yes | `components/ControlPanel.tsx`, `components/SettingsModal.tsx`, `src/flowCanvas/pages/ImageLibraryPage.tsx`, `src/flowCanvas/nodes/ImageFolderOverlay.tsx` | No (new `/assets` path uses `src/assets/*`) | `keep as migration reference` |
| `src/flowCanvas/store/imageFolderStore.ts` | Yes | `src/flowCanvas/pages/ImageLibraryPage.tsx`, `src/flowCanvas/nodes/ImageFolderOverlay.tsx`, tests | No | `keep as migration reference` |
| `components/AccountCenterPage.tsx` | Not used by current router | Old component exists; includes `window.location.href='/create/flow'` | No | `move to legacy/` (and later `delete`) |
| `components/BillingCenterPage.tsx` | Not used by current router | Old component exists; includes `window.location.href='/create/classic'` | No | `move to legacy/` (and later `delete`) |
| `src/services/accountService.ts` | Yes | Used by legacy components (`components/BillingPanel.tsx`, `components/AccountCenterPage.tsx`, etc.) and `src/services/userAdminService.ts` | Not in main user route directly | `keep as migration reference` + later isolate admin-only dependencies |
| `src/services/accountIdentity.ts` | Yes | Many imports; notably `src/services/v2AssetsApi.ts` uses `getAuthorizedV2Headers` | **Partly yes** (via `v2AssetsApi` in flow runtime) | **`replace import`** on new main path to v2 auth-owned header source |
| `server.cjs` | Yes | `package.json` `legacy:server`; internal requires legacy stores | No | `keep as migration reference` (explicit legacy entry) |
| `authStore*.cjs` | Yes | Required by `server.cjs`, migration scripts/tests | No | `keep as migration reference` |
| `billingStore*.cjs` | Yes | Required by `server.cjs`, migration scripts/tests | No | `keep as migration reference` |
| `generationRecordStore*.cjs` | Yes | Required by `server.cjs` | No | `keep as migration reference` |
| `flowProjectStore.cjs` | Yes | Required by `server.cjs` | No | `keep as migration reference` |
| `generatedAssetService.cjs` | Yes | Required by `server.cjs` | No | `keep as migration reference` |

## 3) New Main Path Misreferences (Status)

The current `AppRouter` main path is correct (`/login`, `/register`, `/workspace`, `/projects/:projectId`, `/assets`, `/billing`, `/account`) and compatibility routes redirect.

Sprint 7.1 audit found one cleanup gap:

1. `src/services/v2AssetsApi.ts` imported `getAuthorizedV2Headers` from `src/services/accountIdentity.ts`.
   - Evidence: `src/services/v2AssetsApi.ts:1`
   - Impact: New flow/runtime path (`src/flowCanvas/runtime/v2WorkflowRunner.ts`) depends on a legacy-anchored identity module.
   - Follow-up type: `replace import`.

Sprint 7.2 status update:

- Fixed: `src/services/v2AssetsApi.ts` now uses `apiGet` from `src/services/v2HttpClient.ts`.
- Result: new main path flow-runtime asset URL fetch no longer depends on `accountIdentity`.
- `accountIdentity.ts` is retained for legacy/admin/debug paths (no deletion in Sprint 7.2).

## 4) Legacy Scripts / Docs Audit

### package.json legacy scripts

Still present (expected for migration support):
- `legacy:server`
- `legacy:start`
- `migrate:legacy:v2`
- `migrate:legacy:v2:dry-run`
- `migrate:mysql`

Recommendation: `update docs only` now (keep scripts until Sprint 7.2/7.3 deletion window is approved).

### README / docs legacy startup notes

Current docs already describe legacy usage as migration/fallback:
- `README.md` keeps legacy commands under explicit legacy section.
- `docs/v2-local-development.md` points v2 local flow and explicitly avoids old compose path.
- `deployment_guide.md` explicitly says it documents legacy `server.cjs` path.

Recommendation: `update docs only` (no runtime change needed in Sprint 7.1).

## 5) Safety Classification Summary

- **Can be deleted later (after move/isolation):**
  - `components/InfiniteCanvas.tsx`
  - `components/Toolbar.tsx`
  - `components/MobileView.tsx`
  - likely `components/AccountCenterPage.tsx`, `components/BillingCenterPage.tsx` once no remaining indirect references

- **Keep for now (legacy/debug/test/migration):**
  - `server.cjs`
  - `authStore*.cjs`, `billingStore*.cjs`, `generationRecordStore*.cjs`, `flowProjectStore.cjs`, `generatedAssetService.cjs`
  - `src/store/canvasStore.ts`, `src/hooks/useCanvasOperations.ts`, `src/services/assetStorage.ts`, `src/flowCanvas/store/imageFolderStore.ts`
  - `src/services/accountService.ts`

- **Must fix later because touching new main path:**
  - `src/services/accountIdentity.ts` usage through `src/services/v2AssetsApi.ts` (`replace import` to v2-native auth header source).

## 6) Sprint 7.2 Safe Deletion Plan (Recommended)

1. Replace new-path identity dependency:
   - Done in Sprint 7.2: `v2AssetsApi` decoupled from `accountIdentity` and switched to `v2HttpClient`.

2. Move clearly legacy UI files into `legacy/` namespace first (no behavior change):
   - `components/InfiniteCanvas.tsx`
   - `components/Toolbar.tsx`
   - `components/MobileView.tsx`
   - `components/AccountCenterPage.tsx`
   - `components/BillingCenterPage.tsx`

3. Remove unreachable legacy UI subtree in one focused PR after import graph check passes:
   - `components/ControlPanel.tsx` and its dependency chain (`ContextMenu`, `CanvasNode`, `MultiSelectToolbar`, etc.) only after proving no active route imports.

4. Keep CJS legacy server/store stack until migration scripts and rollback policy are formally retired; then remove together, not piecemeal.

5. Docs cleanup pass:
   - Keep one explicit "legacy migration only" section.
   - Remove any wording that implies `/create/classic`, `/create/flow`, `/model-mapping` are normal user routes.

## 7) Commands Run for This Audit

- `git branch --show-current`
- `git status --short`
- `git status -sb`
- `rg "InfiniteCanvas|ControlPanel|MobileView|Toolbar" .`
- `rg "canvasStore|useCanvasOperations|assetStorage|imageFolderStore" .`
- `rg "accountService|accountIdentity|/api/account|/api/auth|billing-center" .`
- `rg "server.cjs|authStore|billingStore|generationRecordStore|flowProjectStore|generatedAssetService" .`
- `rg "legacy|classic|model-mapping|create/classic|create/flow" .`

## 8) Sprint 7.3 Status (Safe Legacy UI Move / Cleanup)

Completed in Sprint 7.3:

- Moved clear legacy-only UI files to `legacy/ui/components/`:
  - `components/InfiniteCanvas.tsx` -> `legacy/ui/components/InfiniteCanvas.tsx`
  - `components/Toolbar.tsx` -> `legacy/ui/components/Toolbar.tsx`
  - `components/MobileView.tsx` -> `legacy/ui/components/MobileView.tsx`
  - `components/AccountCenterPage.tsx` -> `legacy/ui/components/AccountCenterPage.tsx`
  - `components/BillingCenterPage.tsx` -> `legacy/ui/components/BillingCenterPage.tsx`

Not moved/deleted in Sprint 7.3 (intentionally retained in-place):

- `components/ControlPanel.tsx`
- `components/ContextMenu.tsx`
- `components/CanvasNode.tsx`
- `components/MultiSelectToolbar.tsx`
- `src/store/canvasStore.ts`
- `src/hooks/useCanvasOperations.ts`
- `src/services/assetStorage.ts`
- `src/flowCanvas/store/imageFolderStore.ts`
- `src/services/accountService.ts`
- `src/services/accountIdentity.ts`
- `server.cjs`
- `authStore*.cjs`, `billingStore*.cjs`, `generationRecordStore*.cjs`
- `flowProjectStore.cjs`
- `generatedAssetService.cjs`

Reason: these still have legacy/debug/test/migration references; not safe for deletion in this stage.

Verification summary:

- New main route runtime (`/login`, `/register`, `/workspace`, `/projects/:projectId`, `/assets`, `/billing`, `/account`) does not import the moved legacy UI files.
- Compatibility routes remain redirect/non-normal-entry behavior (`/create/flow`, `/create/classic`, `/admin`, `/model-mapping`); no restoration of classic entrypoints.

Next-step note for Sprint 7.4:

- Consider isolating/removing deeper legacy dependency chains (`ControlPanel` + `canvasStore` + `assetStorage`) only after a full import-graph validation and scoped cleanup PR.

## 9) Sprint 7.4 Status (Classic Canvas Subtree Audit / Safe Move)

Completed in Sprint 7.4:

- Moved classic-canvas legacy subtree files to `legacy/ui/classic-canvas/`:
  - `components/ControlPanel.tsx` -> `legacy/ui/classic-canvas/components/ControlPanel.tsx`
  - `components/ContextMenu.tsx` -> `legacy/ui/classic-canvas/components/ContextMenu.tsx`
  - `components/CanvasNode.tsx` -> `legacy/ui/classic-canvas/components/CanvasNode.tsx`
  - `components/MultiSelectToolbar.tsx` -> `legacy/ui/classic-canvas/components/MultiSelectToolbar.tsx`
  - `components/BillingPanel.tsx` -> `legacy/ui/classic-canvas/components/BillingPanel.tsx`
  - `components/SettingsModal.tsx` -> `legacy/ui/classic-canvas/components/SettingsModal.tsx`
  - `components/ContextSatellite/*` -> `legacy/ui/classic-canvas/components/ContextSatellite/*`
  - `src/hooks/useCanvasOperations.ts` -> `legacy/ui/classic-canvas/hooks/useCanvasOperations.ts`
  - `src/store/canvasStore.ts` -> `legacy/ui/classic-canvas/store/canvasStore.ts`
  - `src/services/assetStorage.ts` -> `legacy/ui/classic-canvas/services/assetStorage.ts`

Compatibility shims added (non-business, import-safe only):

- `src/hooks/useCanvasOperations.ts` re-exports from legacy subtree.
- `src/store/canvasStore.ts` re-exports from legacy subtree.
- `src/services/assetStorage.ts` re-exports from legacy subtree.

Retained in original location (not moved in Sprint 7.4):

- `src/flowCanvas/pages/ImageLibraryPage.tsx`
- `src/flowCanvas/nodes/ImageFolderOverlay.tsx`
- `src/flowCanvas/store/imageFolderStore.ts`

Reason:

- These files are under `src/flowCanvas` and still connected to legacy/local asset flows and tests; moving them in this step would increase blast radius without direct value to v2 user routes.

New main path status:

- No normal v2 product route depends on classic-canvas subtree as primary UI path:
  - `/login`
  - `/register`
  - `/workspace`
  - `/projects/:projectId`
  - `/assets`
  - `/billing`
  - `/account`

Sprint 7.5 recommendation:

- Continue with remaining local image-folder legacy files (`ImageLibraryPage`, `ImageFolderOverlay`, `imageFolderStore`) as a separate scoped move/removal.
- Optionally separate CJS legacy server/store retirement plan.
- Keep known legacy migration test failures tracked independently.
