# Independent Image Workbench Design

## Goal

Build an independent image generation workbench that is usable on desktop and genuinely comfortable on mobile.

The workbench is not a project mode. It is a top-level creator surface for direct image generation:

```txt
/workbench
```

It must reuse the existing TapFlow v2 backend guarantees:

- authenticated tenant/user context
- server-side billing reserve, settle, and refund
- AI Gateway model and route configuration
- cloud asset persistence
- generated assets visible in `/assets`

It must not require the user to select a project, open a canvas, or understand canvas nodes before generating images.

## Approved Direction

Use Scheme C: shared generation core, two tailored shells.

- Desktop: professional left-parameters plus right-result-flow layout.
- Mobile: result-feed-first layout inspired by JiMeng mobile behavior.
- Data: independent workbench history first; project/canvas insertion is a secondary explicit action.
- Results: cards prioritize `再次生成` and `复用参数`; `发送到画布` is available but not primary.

This replaces the earlier project-scoped workbench direction documented in:

```txt
docs/superpowers/specs/2026-06-17-mobile-image-workbench-ui-design.md
```

The earlier `/projects/:projectId/workbench` implementation may remain temporarily for compatibility, but it is no longer the target product direction.

## Product Model

The workbench is a standalone image studio.

Users enter it from the main navigation item `工作台`, placed with the primary workspace navigation. Mobile users should enter `/workbench` by default when they tap the workbench entry; mobile project pages should not automatically force the user into project-scoped workbench mode.

The product concepts are:

- `Workbench Session`: optional current creator session that groups drafts and generations.
- `Workbench Generation`: one generate action with prompt, model, route, params, reference assets, requested count, display preference, and status.
- `Workbench Result`: one generated asset result stored in cloud assets and linked to the generation.
- `Reusable Params`: a snapshot of model, line, ratio, size, quality, count, references, and model-specific options.

The user-facing experience should feel like a focused image creation tool, not a hidden canvas wrapper.

## Route And Navigation

Add:

```txt
/workbench
```

Navigation behavior:

- Desktop shell shows `工作台` in the main nav alongside `首页`, `工作空间`, `素材库`, and billing/account surfaces.
- Mobile bottom nav includes `工作台` as a first-class item.
- `/workbench` is protected by `AuthGate`.
- Anonymous access redirects through the existing login flow.
- Non-canvas pages keep the shared shell chrome.

Compatibility behavior:

- `/projects/:projectId/workbench` should not be promoted in navigation.
- Existing project-scoped workbench code should be migrated, removed, or redirected after the independent workbench is complete.
- `/projects/:projectId` should continue to open the canvas/project flow as the project experience.

## Desktop UI

Desktop uses a direct production layout:

```txt
+--------------------------------------------------------------------------------+
| Shared app header: logo / 首页 / 工作台 / 工作空间 / 素材库 / account             |
+----------------------------+---------------------------------------------------+
| Left creation panel        | Result flow                                        |
|                            |                                                   |
| Reference image strip      | Latest generation card                             |
| Prompt editor              |   large image grid / status / actions             |
| Model + line               |                                                   |
| Ratio / size / count       | Previous generation card                           |
| Output options             |   prompt summary / images / reuse actions          |
| Advanced model params      |                                                   |
| Credits + Generate         |                                                   |
+----------------------------+---------------------------------------------------+
```

Desktop layout rules:

- Left panel width: about `360px` to `420px`.
- Right side is a vertical result flow with image-forward cards.
- The right result area owns the page scroll; the left panel remains stable.
- Avoid marketing hero sections and decorative card stacks.
- Do not put cards inside cards; use the page background plus functional panels and result cards only.
- Menus and selects must use the shared TapNow-style menu primitives.

Desktop generation controls:

- Prompt editor
- Reference image strip
- Model selector
- Route/line selector
- Aspect ratio
- Size or quality tier
- Quantity
- Multi-result display preference: merged card or separated result cards
- Output format when supported by the selected model
- Moderation / safety strength when supported by the selected model
- Advanced model-specific options
- Credit estimate
- Primary generate button

The control layout must keep quantity, credit estimate, and generate action visually coordinated. When quantity is greater than `1`, display preference should appear without breaking the primary action row.

## Mobile UI

Mobile follows a result-first creation flow.

Default state:

```txt
+--------------------------+
| 创作              account |
+--------------------------+
| Result feed              |
|                          |
| Generation card          |
|   images                 |
|   再次生成  复用参数      |
|                          |
| Generation card          |
|   images                 |
+--------------------------+
| rounded short input bar  |
| prompt placeholder   send|
+--------------------------+
```

Composer expanded state:

```txt
+--------------------------+
| dimmed result feed        |
+--------------------------+
| bottom composer sheet     |
| reference cards           |
| prompt editor             |
| model / line chips        |
| ratio / size / count      |
| display mode if count > 1 |
| credits        generate   |
+--------------------------+
```

Mobile rules:

- The result feed is the first visual priority.
- The short bottom input bar is always reachable in the thumb zone.
- Tapping the input expands a bottom composer over the feed.
- The expanded composer should feel like a native mobile creation sheet, not a squeezed desktop sidebar.
- Frequent controls stay visible; advanced controls sit behind a compact expandable section.
- Touch targets should be at least `44px`.
- No dense desktop tables.
- Result card actions should be concise: `再次生成`, `复用参数`, and a compact more menu.
- A result image tap opens a bottom sheet for preview, download, use as reference, and send to canvas.

## Result Flow

Results are grouped by generation action.

Each generation card contains:

- prompt preview
- created time
- model display name
- line label
- ratio
- size or quality tier
- quantity
- credit cost
- status
- generated image results
- error details when failed
- actions: `再次生成`, `复用参数`, `设为参考`, `下载`, `发送到画布`

Primary actions:

- `再次生成`: rerun with the same parameter snapshot.
- `复用参数`: load the parameter snapshot into the composer without running.
- `设为参考`: add selected result asset to the reference strip.

Secondary actions:

- `发送到画布`: choose or create a project, then add the result asset as an image node or generation node in the selected canvas.
- `下载`: download the persisted asset URL.
- `收藏`: optional V1.1 feature unless existing asset favorite plumbing already exists.

## Data Model

The workbench needs server-side authoritative history. Browser local storage or IndexedDB must not be the source of truth.

Recommended new tables:

```txt
workbench_sessions
workbench_generations
workbench_results
```

`workbench_sessions`:

- `id`
- `tenant_id`
- `created_by`
- `title`
- `status`
- `created_at`
- `updated_at`

`workbench_generations`:

- `id`
- `tenant_id`
- `session_id`
- `created_by`
- `prompt`
- `model_id`
- `route_key`
- `params_json`
- `reference_asset_ids`
- `requested_count`
- `display_mode`
- `estimated_credits`
- `charged_credits`
- `status`
- `workflow_run_id` or dedicated job/run id
- `error_json`
- `created_at`
- `updated_at`

`workbench_results`:

- `id`
- `tenant_id`
- `generation_id`
- `asset_id`
- `sort_order`
- `metadata_json`
- `created_at`

Tenant isolation:

- Every table includes `tenant_id`.
- Queries are tenant-scoped.
- RLS policies should follow the existing tenant context pattern.

## API Design

Recommended endpoints:

```txt
GET    /api/v2/workbench/generations?limit=&cursor=
POST   /api/v2/workbench/generations
GET    /api/v2/workbench/generations/:generationId
POST   /api/v2/workbench/generations/:generationId/retry
POST   /api/v2/workbench/results/:resultId/send-to-project
```

`POST /api/v2/workbench/generations` input:

```ts
{
  prompt: string;
  modelId: string;
  routeKey: string;
  params: Record<string, unknown>;
  referenceAssetIds: string[];
  requestedCount: number;
  displayMode: "merged" | "separate";
  idempotencyKey?: string;
}
```

Response:

```ts
{
  generationId: string;
  status: "pending" | "running" | "succeeded" | "failed";
  estimatedCredits: number;
}
```

The API must:

- validate model and active route visibility for the tenant
- estimate pricing before enqueueing
- reserve credits server-side
- enqueue work through the existing AI Gateway/media runtime path
- persist generated assets through the existing cloud asset pipeline
- settle credits on success
- refund/release on failure
- return clear failure codes for missing pricing, inactive route, insufficient credits, provider failure, and asset persistence failure

## Generation Runtime

The workbench should reuse existing model adapters and billing logic instead of creating a frontend generation path.

Recommended runtime shape:

1. Frontend posts a workbench generation request.
2. API validates route, pricing, and references.
3. API creates `workbench_generations` in `pending`.
4. API reserves credits.
5. API enqueues a worker job.
6. Worker calls the existing media runtime / AI Gateway route.
7. Worker persists output images as normal assets.
8. Worker writes `workbench_results`.
9. Worker settles or refunds credits.
10. Frontend polls or streams generation status and updates the result flow.

This intentionally avoids creating hidden canvas nodes as the primary workbench persistence mechanism.

Canvas insertion is a separate action after generation:

1. User chooses `发送到画布`.
2. UI asks for target project or offers quick create.
3. API/frontend loads the target project draft.
4. The selected asset is inserted as an image node or generation-derived node.
5. The normal canvas autosave path persists the project draft.

## Model Parameter Rules

The workbench composer must use the same model semantics already established in the canvas:

- Nano Banana Pro and Nano Banana 2 keep the TapNow-style ratio and `1K / 2K / 4K` options.
- GPT-Image-2 keeps its dedicated parameter rules:
  - size can be `Auto` or a model-supported pixel/tier value based on existing implementation
  - quality is supported
  - output format is supported
  - moderation/safety strength is supported
  - quantity greater than `1` follows the existing safe multiple `n=1` request strategy when required by the route
- Route labels remain creator-friendly, such as `线路一`, `线路二`.
- Provider names, base URLs, raw upstream model names, and API keys must not appear in creator-facing UI.

The composer should be model-aware:

- controls irrelevant to the selected model are hidden
- controls supported by the selected model are shown in the same visual language
- changing model should preserve compatible settings when possible and reset incompatible settings clearly

## Reference Images

Reference image sources:

- upload to cloud assets
- select from `/assets`
- use a previous workbench result

Reference cards show:

- thumbnail
- remove action
- optional source label

References should store `asset_id` references, not base64, blob URLs, or signed URLs as authoritative data.

## Visual System

The workbench should feel like a mature creative production surface:

- dark neutral background
- restrained borders and surfaces
- image-forward result cards
- compact professional typography
- familiar icons for actions
- no decorative gradient blobs or landing-page composition

Menus, dropdowns, popovers, and command menus must use:

```txt
src/components/menu/MenuSelect.tsx
src/components/menu/MenuSurface.tsx
src/components/menu/menuStyles.ts
src/components/menu/useDismissibleLayer.ts
```

Workbench-specific menu styling should not introduce a separate density system.

## Loading And Empty States

Initial empty state:

- Desktop: right result area shows a quiet prompt-like empty state with example chips, not a marketing hero.
- Mobile: feed shows a compact empty state above the bottom input bar.

Generating state:

- Generation card appears immediately in `pending/running`.
- It shows prompt, params, estimated credits, and progress/status.
- The composer remains usable unless a duplicate submission is being prevented.

Failure state:

- Failed generation remains in history.
- Card shows a concise error and `再次生成`.
- Credits are shown as refunded/released when applicable.

## Testing Requirements

Frontend tests:

- `/workbench` route renders under `AuthGate`.
- main nav includes `工作台` on desktop and mobile shell.
- desktop layout renders left composer and result flow.
- mobile layout renders result feed plus bottom input bar.
- composer expansion does not hide the generate button on mobile.
- model-aware controls change when switching Nano Banana and GPT-Image-2 models.
- quantity greater than `1` reveals display mode without breaking action row.
- result card `复用参数` loads composer state.
- result card `再次生成` submits with the saved parameter snapshot.

Backend/API tests:

- generation create endpoint requires auth and tenant context.
- inactive route or missing pricing fails closed.
- insufficient credits does not enqueue generation.
- successful generation creates workbench history, asset records, and billing settlement.
- failed generation refunds/releases the reservation.
- tenant A cannot read tenant B workbench generations.
- send-to-project validates target project tenant ownership.

Build verification:

```bash
npm run build
```

When backend/database work is implemented, also run relevant workspace tests:

```bash
npm run test --workspace @aigc-flow/api
npm run test --workspace @aigc-flow/worker
npm run test --workspace @aigc-flow/db
npm run test --workspace @aigc-flow/ai-gateway-core
```

## V1 Scope

V1 includes:

- top-level `/workbench`
- desktop left-parameters plus right-result-flow UI
- mobile result-feed-first UI with bottom composer
- authenticated independent workbench history
- text-to-image generation
- model and line selection
- core model-aware image parameters
- multi-result display preference
- reference images from assets/upload/previous results
- generated assets persisted to cloud assets
- result actions: regenerate, reuse params, use as reference, download
- secondary send-to-canvas/project action

V1 excludes:

- full image editing tools inside the workbench
- Agent planning workflows inside the workbench
- batch CSV prompt upload
- collaborative sessions
- advanced search/filtering over long history
- automatic project creation for every generation

## Acceptance Criteria

- `/workbench` opens a standalone image generation surface without selecting a project.
- Desktop workbench uses the approved left-parameters plus right-result-flow layout.
- Mobile workbench opens to a result-first feed with a bottom input/composer flow.
- A new generation is stored in server-side workbench history.
- Generated outputs are stored as normal cloud assets and appear in `/assets`.
- Billing reserve, settle, and refund remain server-side.
- Provider credentials and upstream internals are never exposed to the frontend.
- Quantity greater than `1` supports merged or separated result presentation.
- `复用参数` and `再次生成` work from result cards.
- `发送到画布` is explicit and secondary, not automatic.
- Existing project canvas behavior remains intact.

## Migration Notes

The current project-scoped workbench files under `src/flowCanvas/workbench/*` should be treated as reusable UI experiments, not the final architecture.

Implementation should either:

- move reusable components into a new independent `src/workbench/*` feature area, or
- create new independent components and retire project-scoped pieces after the new path is stable.

Avoid extending the old project-scoped approach in ways that deepen its coupling to canvas drafts.

