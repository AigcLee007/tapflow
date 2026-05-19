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

## 3) New Main Path Misreferences (Must fix later)

The current `AppRouter` main path is correct (`/login`, `/register`, `/workspace`, `/projects/:projectId`, `/assets`, `/billing`, `/account`) and compatibility routes redirect.

But one cleanup gap remains:

1. `src/services/v2AssetsApi.ts` imports `getAuthorizedV2Headers` from `src/services/accountIdentity.ts`.
   - Evidence: `src/services/v2AssetsApi.ts:1`
   - Impact: New flow/runtime path (`src/flowCanvas/runtime/v2WorkflowRunner.ts`) depends on a legacy-anchored identity module.
   - Required follow-up type: `replace import`.

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
   - Decouple `v2AssetsApi` from `accountIdentity` and use a v2-native auth header provider.

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

