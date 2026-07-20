# Prompt Plaza Design

Date: 2026-07-20
Status: Approved product design; implementation pending

## Summary

Add an official, curated prompt plaza for image-generation prompts. Users can discover prompt examples and their generated-image results, search and filter the catalog, copy the main prompt text, favorite prompts, and create a new image-generation node from a prompt.

The first release is intentionally a quality-controlled catalog, not a community marketplace:

- Official content is entered or batch-imported by authorized administrators.
- Users can browse, search, copy, favorite, and reference prompts.
- The first release supports image-generation prompts only.
- Prompt reference always creates a new canvas image node and never overwrites an existing node.
- User collections are favorites only; custom folders are deferred.
- Model, route, and generation parameters are shown as reference metadata where available, but are not copied into a new node.

## Product Decisions

### Entry points

Add a normal user-facing `提示词广场` item to the existing `WorkspaceShell` navigation.

Required routes:

- `/prompts`: prompt plaza list.
- `/prompts/:promptId`: prompt detail page.

The canvas receives a compact prompt panel through the existing canvas dock. It is not a separate route.

Administrator management remains permission protected under the existing admin surface, for example `/admin#prompt-library`. It must not become a normal creator-facing navigation item.

### Core user flow

1. The user opens `/prompts` and sees the `精选` view.
2. The user searches by title, description, prompt text, or tag, or filters by an official category.
3. The user can favorite a card, copy its main prompt, or open its detail page.
4. The detail page shows a 2x2 effect gallery and a fixed right-side prompt panel.
5. `复制提示词` copies only the complete main prompt to the system clipboard. It does not navigate or mutate the canvas.
6. `引用到画布` opens a project picker from the standalone detail page. After a project is selected, the user is taken to that project's canvas and a new image-generation node is created.
7. The canvas prompt panel already has a project context, so it creates the new node directly.
8. The new node starts with the prompt text only. The current canvas defaults supply model, route, parameters, and reference-image state.
9. The node stores the source prompt id and a prompt snapshot. Later edits or removal of the official entry do not silently change existing canvases.

### Action hierarchy

The three actions have stable roles across list cards, detail pages, and the canvas panel:

- `引用到画布`: primary action; creates a new image-generation node.
- `复制提示词`: secondary action; copies the prompt only.
- `收藏`: icon action; toggles the user's favorite state.

Copy success shows `已复制`. Clipboard failure leaves the prompt selectable and shows a manual-copy fallback message. Reference failure does not leave a partially-created node.

## Information Architecture

### Prompt plaza list

The page uses the current dark TapFlow workbench visual language and a search-first tool layout, not a marketing hero.

Header and controls:

- Page title `提示词广场`.
- Debounced search input with placeholder such as `搜索标题、提示词或标签...`.
- View tabs: `精选`, `最新`, `我的收藏`.
- Official category tabs: `全部`, `人像`, `产品`, `电商`, `场景空间`, `插画动漫`, `海报设计`, `3D 材质`.
- Results count, loading state, empty state, and error state.

Prompt cards:

- First effect image as the cover.
- Prompt title and short description.
- Category plus up to three visible tags.
- Favorite icon, copy icon, and `引用` primary button.
- Clicking the cover or title opens the detail route.

Cards should follow existing compact UI conventions: stable media aspect ratio, restrained radius, shared button/icon tokens, tooltips for icon-only copy and favorite actions, and no oversized card typography.

### Prompt detail page

The detail page is a full route so it can preserve reading space and support a shareable URL.

- Top breadcrumb/back action returns to the list while preserving the query and filters.
- Left content area: 2x2 equal effect gallery, with image preview behavior reused from the asset preview patterns where appropriate.
- Right sticky panel: title, `官方精选` source label, category/tags, full main prompt block, optional negative-prompt/reference metadata, and the action hierarchy above.
- Model and parameter information is descriptive only. It is never treated as a credential and is not copied into the new node.
- Missing effect media renders a clear placeholder and does not hide the prompt text or actions.

### Canvas prompt panel

Extend the existing `CanvasDockDrawer` pattern with a compact `提示词` panel:

- Search input and compact category tabs.
- One-column compact prompt cards with a small cover, title, category/tags, copy icon, and new-node icon.
- The panel uses the current project context and never opens a project picker.
- The panel does not duplicate the full detail page. A card can open the standalone detail page if the user needs the full gallery.

### Project picker

The standalone detail action uses the existing workspace project list. The picker must:

- Show active tenant-scoped projects only.
- Support selecting one project and cancelling without mutation.
- Show an empty state with a link to create a project when the tenant has none.
- Preserve the prompt reference request when routing through project creation.

## Data Model

The catalog is a platform-scoped official content set, while favorites and interactions are tenant-scoped user data.

### `prompt_entries`

Official catalog record, following the existing `flow_templates` pattern for global official rows:

- `id uuid primary key`
- `tenant_id uuid null` for future tenant-owned entries; official rows use `null`
- `created_by uuid null`
- `external_key text null` for idempotent imports
- `title text`
- `description text`
- `prompt_text text`
- `negative_prompt text null` as reference-only metadata
- `category text`
- `tags text[]`
- `status text check (draft, published, archived)`
- `sort_weight integer`
- `version integer`
- `created_at`, `updated_at`, `published_at`

The official scope is a documented exception to the usual tenant ownership rule: the row is deliberately global and is readable only when published. Tenant-owned entries can be added later without changing the user API shape.

The migration must enable RLS on every user-owned table and add tenant-scoped indexes for favorites, interaction history, and common prompt lookups. The official catalog and its catalog-media relationship are platform-scoped by design; their policies must allow only published official rows/media or an explicitly authorized admin operation. No policy may broaden access to private tenant assets.

### Effect media

Effect images remain backed by the existing S3-compatible object storage and asset rules. Catalog media must be marked as a dedicated catalog source and must not reference a user's private asset as an official example.

Use a catalog relationship record containing:

- `prompt_id`
- `asset_id` for the catalog-scoped asset
- `sort_order`
- `alt_text`

The API returns short-lived signed URLs. URLs, blobs, base64 data, and File objects are never written into `flow_drafts.graph_json`.

### `prompt_favorites`

- `tenant_id uuid not null`
- `user_id uuid not null`
- `prompt_id uuid not null`
- `created_at`
- unique key on `(tenant_id, user_id, prompt_id)`
- indexes on `(tenant_id, user_id, created_at desc)` and `(tenant_id, prompt_id)`

### `prompt_interactions`

Tenant-scoped, append-only product signals for `view`, `copy`, and `reference`. Store ids and event metadata only; never store provider secrets, raw Authorization headers, or unnecessary prompt duplicates.

The table must include `tenant_id`, `user_id`, `prompt_id`, `event_type`, `project_id` when relevant, and `created_at`, with RLS and tenant/time indexes. A future retention policy can prune high-volume view events without affecting favorites or prompt records.

### Canvas node metadata

The new image node persists:

- the normal image-node prompt field;
- `sourcePromptId`;
- `sourcePromptTitle` when useful for UI attribution;
- `sourcePromptSnapshot` or an equivalent prompt snapshot field;
- a unique `promptInsertRequestId` used only for idempotency during one navigation request.

## API Design

All user endpoints use the existing v2 HTTP client and authenticated tenant context.

User routes:

- `GET /api/v2/prompts?query=&category=&view=&cursor=`
- `GET /api/v2/prompts/:promptId`
- `POST /api/v2/prompts/:promptId/favorite`
- `DELETE /api/v2/prompts/:promptId/favorite`
- `POST /api/v2/prompts/:promptId/interactions`

The list response includes favorite state for the current user, stable pagination fields, category/tag metadata, and signed media URLs. The detail response includes the full prompt text, effect gallery metadata, and descriptive generation metadata without exposing credentials or encrypted provider fields.

Admin routes are permission-protected:

- CRUD for prompt draft records;
- effect-media upload, reorder, and removal;
- publish, archive, and restore;
- batch import validation and confirmation.

Batch import is two-step: validate and return row-level errors first, then confirm. Required import fields are `externalKey`, `title`, `description`, `promptText`, `category`, and `tags`. Imported rows enter `draft` until an administrator publishes them. Existing audit logging records import and publish actions.

## Search and Classification

The first release uses PostgreSQL only:

- Search title, description, prompt text, and tags.
- Use parameterized matching and appropriate tenant/status/category indexes.
- Add trigram support if the deployed Postgres instance supports it; otherwise retain a bounded `ILIKE` implementation and revisit after real catalog size is known.
- Do not add Elasticsearch or a vector database for the first release.

Categories are stable platform-owned values. Tags are flexible metadata and can cover style, lighting, camera, composition, color, and use case. The frontend must not expose arbitrary provider or credential names as end-user categories.

## Security and Tenant Boundaries

- Official prompts are readable only when published.
- Favorites and interaction events always include tenant and user context.
- Admin management requires an existing operations/admin permission; no new unprotected route is introduced.
- Catalog effect media uses a dedicated object-storage source and short-lived signed URLs.
- Raw provider credentials, encrypted credential material, nonces, auth tags, and full headers never enter prompt responses, prompt nodes, drafts, logs, or screenshots.
- Project selection and node creation validate the selected project against the current tenant before mutation.
- Prompt text is treated as content, not executable markup; sanitize any rendered description or import metadata.

## Reference Flow and Idempotency

The standalone detail page does not put the full prompt in the URL. It creates a new `promptInsertRequestId` and routes with only the prompt id and request id. The project page fetches the prompt through the authenticated API, checks whether that request id already exists in the current graph, and creates the new node only if it has not been consumed. After a successful remote draft save, the route removes the transient query parameters.

This preserves the requirement that every deliberate reference creates a new node while preventing accidental duplication from a browser refresh or a repeated route effect. A new user click generates a new request id and therefore creates another node as expected.

## Error and Empty States

The UI must explicitly handle:

- no prompts matching the query;
- no favorites;
- prompt unpublished between list and detail load;
- effect media missing or signed URL failure;
- clipboard API unavailable or denied;
- no projects available for standalone reference;
- selected project no longer accessible;
- prompt fetch failure during project navigation;
- remote flow draft revision conflict;
- batch import row validation errors;
- admin permission failure.

Errors should preserve user-entered search and prompt text where possible. Reference errors must not claim a node was created unless the node and remote draft mutation succeeded.

## Testing and Verification

Focused frontend tests should cover:

- list search, category, view, pagination, loading, empty, and error states;
- favorite optimistic update and rollback;
- copy success and clipboard failure fallback;
- detail gallery and action hierarchy;
- project picker selection, cancellation, no-project state, and return routing;
- canvas panel reference always creating a new node;
- standalone reference idempotency across refresh;
- prompt snapshot/source metadata and remote autosave behavior.

Backend/API tests should cover:

- authenticated tenant access;
- published official visibility and unpublished exclusion;
- favorite uniqueness and tenant isolation;
- interaction event validation;
- signed catalog media response without secret leakage;
- admin permission checks;
- batch import validation, duplicate external keys, and publish transitions;
- project ownership checks during reference routing.

Required validation for the implementation task is `npm run build`, plus relevant API, database, and frontend tests. Browser smoke should verify the list-to-detail-to-project-picker-to-new-node flow against a seeded local catalog.

## Delivery Phases

### Phase 1: Catalog foundation

- Add migration, RLS, catalog asset source rules, prompt service, list/detail/admin APIs.
- Add administrator manual editor, CSV/XLSX validation/import, media upload, and publish flow.
- Seed a small official set of image prompts with four effect images where available.

### Phase 2: User discovery

- Add `/prompts` and `/prompts/:promptId` routes and top navigation.
- Add search, categories, favorites, copy behavior, detail gallery, and responsive states.

### Phase 3: Canvas integration

- Add the canvas prompt dock panel.
- Add project picker and idempotent standalone reference routing.
- Add new image node source metadata and remote draft integration.

### Phase 4: Operational polish

- Add interaction dashboards and catalog quality metrics.
- Tune indexes and pagination from real catalog behavior.
- Add mobile-specific layout refinements and expand the official catalog.

## Acceptance Criteria

The feature is ready for implementation sign-off when:

- A user can search and filter official image prompts from `/prompts`.
- A user can view four effect images and the full prompt on `/prompts/:promptId`.
- Copy works from list, detail, and canvas panel without creating a node.
- Reference from detail uses a project picker and creates exactly one new image node for that action.
- Reference from the canvas panel creates a new node in the current project.
- Existing nodes are never overwritten by prompt reference.
- Favorites are tenant/user isolated and survive reload.
- Official prompt media is served through short-lived URLs without leaking private assets or provider credentials.
- Administrators can import, validate, edit, publish, archive, and reorder official prompts.
- Empty, permission, clipboard, media, project, and autosave conflict states are visible and actionable.
- The implementation passes `npm run build` and the focused API/frontend/database tests.
