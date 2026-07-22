# Prompt Library Management And Media Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make prompt lifecycle management complete and make the prompt plaza fast through generated local media variants, HTTP caching, lazy loading, and bounded concurrency.

**Architecture:** Keep prompt originals on the dedicated local prompt-catalog filesystem. Add preview and thumbnail keys beside the existing original key, expose a variant-aware authenticated byte endpoint, and let the plaza load cached thumbnail blobs only when cards approach the viewport. Extend the existing admin prompt APIs with guarded deletion and atomic ordering, then align the admin panel with explicit lifecycle actions and the eight fixed categories.

**Tech Stack:** React, TypeScript, Fastify, PostgreSQL migrations/RLS, `sharp`, Vitest, Testing Library, Vite, Docker Compose v2

---

## File Map

### Database and server

- Create `packages/db/migrations/000041_prompt_library_management_media_variants.sql` for derived media keys, category support, and indexes.
- Modify `apps/api/src/modules/prompts/prompts.schemas.ts` for the eight-category validation and reorder/delete input types.
- Modify `apps/api/src/modules/prompts/prompts.service.ts` for lifecycle guards, prompt deletion, atomic ordering, variant generation, variant reads, and cleanup logging.
- Modify `apps/api/src/modules/prompts/prompts.routes.ts` for prompt delete, reorder, and `variant` query support.
- Create `scripts/migrate-prompt-media-variants.ts` plus `scripts/migrate-prompt-media-variants.test.ts` for idempotent historical generation.

### Frontend

- Modify `src/services/v2PromptsApi.ts` for prompt delete/order calls and variant-aware media reads.
- Modify `src/admin/PromptLibraryPanel.tsx` for status filters, dirty state, lifecycle actions, fixed category select, advanced external key, and drag ordering.
- Modify `src/admin/PromptLibraryPanel.test.tsx` for the action/state contract.
- Create `src/prompts/promptMediaCache.ts` and `src/prompts/promptMediaCache.test.ts` for in-flight deduplication, four-request concurrency, and object URL eviction.
- Modify `src/prompts/PromptCard.tsx` and `src/prompts/PromptPlazaPage.tsx` to load thumbnail variants through an intersection-aware boundary.
- Modify `src/prompts/PromptDetailModal.tsx` to request thumb/preview/original variants in the correct interaction state.
- Modify `src/prompts/PromptPlazaPage.test.tsx`, `src/prompts/PromptDetailModal.test.tsx`, and add `src/prompts/PromptCard.test.tsx` coverage for lazy media and cache reuse.

### Documentation and deployment

- Modify `PROJECT_RECORD.md` after implementation and migration validation.
- Modify `docs/STAGING_ENV_TEMPLATE.md` only if the migration command requires a new documented variable; otherwise record the command in `docs/staging-runbook.md`.
- Modify `docs/staging-runbook.md` with the migration dry-run/write sequence and rollback behavior.

---

### Task 1: Lock the lifecycle and category contracts with failing tests

**Files:**
- Create: `apps/api/test/prompts.service.test.ts`
- Modify: `src/admin/PromptLibraryPanel.test.tsx`
- Modify: `src/services/v2PromptsApi.test.ts`

- [ ] **Step 1: Add API transition tests**

Assert these cases against the service or route harness:

```ts
expect(await service.updateAdminPrompt(ctx, publishedId, publishedInput)).toMatchObject({ status: "published" });
await expect(service.setAdminStatus(ctx, publishedId, "draft")).resolves.toMatchObject({ status: "draft" });
await expect(service.deleteAdminPrompt(ctx, publishedId)).rejects.toMatchObject({ code: "PROMPT_DELETE_REQUIRES_ARCHIVE" });
await expect(service.deleteAdminPrompt(ctx, archivedId)).resolves.toEqual({ ok: true });
```

- [ ] **Step 2: Add category and reorder validation tests**

Verify `video` is accepted, an unknown category is rejected by admin input validation, and an order payload with a missing or foreign prompt ID fails with `PROMPT_ORDER_INVALID` before any update query runs.

- [ ] **Step 3: Add admin UI state tests**

Render one draft, one published, and one archived entry. Assert the visible actions are respectively `发布/删除`, `保存修改/下架`, and `恢复草稿/永久删除`; assert the external key input is read-only and the category control is a select with `视频`.

- [ ] **Step 4: Add client request tests**

Assert `deleteAdminPrompt(id)` sends `DELETE /admin/prompts/:id`, `reorderAdminPrompts(input)` sends the complete ordered payload, and `getPromptMediaBlob(id, promptId, "thumb")` includes `?variant=thumb` while preserving the admin path.

- [ ] **Step 5: Run the tests and record the expected RED state**

Run:

```bash
npx vitest --run apps/api/test/prompts.service.test.ts src/admin/PromptLibraryPanel.test.tsx src/services/v2PromptsApi.test.ts
```

Expected: failures for the not-yet-defined delete/order methods, missing `video` category, old action labels, and missing variant argument.

---

### Task 2: Add schema, migration, and server lifecycle behavior

**Files:**
- Create: `packages/db/migrations/000041_prompt_library_management_media_variants.sql`
- Modify: `apps/api/src/modules/prompts/prompts.schemas.ts`
- Modify: `apps/api/src/modules/prompts/prompts.service.ts`
- Modify: `apps/api/src/modules/prompts/prompts.routes.ts`
- Test: `apps/api/test/prompts.service.test.ts`

- [ ] **Step 1: Add the migration**

Add nullable `preview_storage_key` and `thumbnail_storage_key` columns to `prompt_entry_media`. Add an index on `(prompt_id, sort_order, id)` if the migration history does not already provide it. Do not change the existing original `storage_key` contract or move files to S3.

- [ ] **Step 2: Extend schema constants and payloads**

Define the eight stored category values, add an admin reorder schema containing `promptIds: z.array(z.string().uuid()).min(1).max(500)`, and add `variant` query validation with `thumb`, `preview`, and `original` defaulting to `original`.

- [ ] **Step 3: Implement guarded deletion**

Add `deleteAdminPrompt(context, promptId)` that rejects `published`, selects all three storage keys, deletes the row transactionally, then unlinks existing files and logs cleanup failures. Use the existing tenant transaction helper and return `{ ok: true }`.

- [ ] **Step 4: Implement atomic reorder**

Add `reorderAdminPrompts(context, promptIds)` that loads the IDs in the current admin scope, compares sets, and updates `sort_weight` in one transaction. Assign descending weights from `promptIds.length * 1000` so future inserts can be placed between existing entries without rewriting the public sort contract.

- [ ] **Step 5: Preserve published edits and explicit transitions**

Keep `status` and `published_at` unchanged in `updateAdminPrompt` when the submitted status is `published`. Add explicit transition checks in `setAdminStatus`; call the existing media requirement before either draft-to-published or archived-to-published transitions.

- [ ] **Step 6: Add routes and route tests**

Register `DELETE /api/v2/admin/prompts/:promptId`, `PATCH /api/v2/admin/prompts/order`, and `variant` parsing on both prompt media byte routes. Use the existing `adminHandlers` and `readHandlers`; never return storage keys.

- [ ] **Step 7: Run the server tests GREEN**

Run:

```bash
npx vitest --run apps/api/test/prompts.service.test.ts
```

Expected: lifecycle, delete guard, order validation, category, and variant route tests pass.

---

### Task 3: Generate and serve local media variants

**Files:**
- Modify: `apps/api/src/modules/prompts/prompts.service.ts`
- Modify: `apps/api/src/modules/prompts/prompts.routes.ts`
- Create: `scripts/migrate-prompt-media-variants.ts`
- Create: `scripts/migrate-prompt-media-variants.test.ts`
- Test: `apps/api/test/prompts.service.test.ts`

- [ ] **Step 1: Extract variant generation helpers**

Use `sharp` to generate `thumb.webp` at 640px/quality 78 and `preview.webp` at 1600px/quality 82 with `fit: "inside"` and `withoutEnlargement: true`. Write each variant with exclusive-create semantics and return its dimensions and MIME type.

- [ ] **Step 2: Extend upload handling**

After the original upload succeeds, generate both variants in the same prompt directory and persist only the keys that were written. If a variant fails, keep the original and return a warning-safe media record; publishing still requires an original media row.

- [ ] **Step 3: Implement the migration script**

Support:

```bash
node scripts/migrate-prompt-media-variants.ts --dry-run
node scripts/migrate-prompt-media-variants.ts --concurrency 4
```

The script must skip rows whose original file is missing, never overwrite an existing derived key, print processed/generated/skipped/failed counts, and exit nonzero only when a database or filesystem operation prevents a reliable summary.

- [ ] **Step 4: Add variant resolution and cache headers**

Resolve `thumb`, `preview`, or `original` to the corresponding key with original fallback. Set content length and MIME type, plus:

```text
Cache-Control: private, max-age=31536000, immutable
Vary: Authorization
ETag: "<media-id>-<variant>-<version>"
```

Return `304` when `If-None-Match` matches. Keep the admin and public authorization predicates unchanged.

- [ ] **Step 5: Test variants and headers**

Assert upload writes all expected keys, migration is idempotent, missing variants fall back to original, unpublished media remains protected, and repeated requests return the cache headers/304 behavior.

- [ ] **Step 6: Run variant tests**

Run:

```bash
npx vitest --run scripts/migrate-prompt-media-variants.test.ts apps/api/test/prompts.service.test.ts
```

---

### Task 4: Upgrade the admin prompt library UI

**Files:**
- Modify: `src/services/v2PromptsApi.ts`
- Modify: `src/admin/PromptLibraryPanel.tsx`
- Modify: `src/admin/PromptLibraryPanel.test.tsx`

- [ ] **Step 1: Add client methods and category metadata**

Add `deleteAdminPrompt`, `reorderAdminPrompts`, and fixed category options containing `video`. Add a `variant` argument to `getPromptMediaBlob` without exposing storage keys.

- [ ] **Step 2: Add state filter and status-aware actions**

Track `statusFilter`, derive visible list items, and render actions from the selected prompt state. Use `保存修改` for existing prompts, `保存草稿` only for new prompts, and make delete confirmation explicit.

- [ ] **Step 3: Make form semantics clear**

Replace free-text category input with the shared select/menu pattern, move external key into a read-only advanced details block, remove sort weight input, and add the optional-description helper. Keep prompt text, negative prompt, tags, and media upload behavior.

- [ ] **Step 4: Add dirty-state and immediate published-save behavior**

Compare the current form to the selected entry, show `未保存修改`, disable duplicate saves while pending, and retain `published` in the update payload for published entries. On success replace the selected item with the server response and clear the dirty state.

- [ ] **Step 5: Add drag ordering**

Use native pointer drag events on list rows, keep an accessible keyboard move alternative (`上移`/`下移`), optimistically reorder the visible list, call `reorderAdminPrompts`, and restore the previous order on failure.

- [ ] **Step 6: Add lifecycle and deletion tests**

Test draft deletion, published delete guard messaging, archived permanent deletion confirmation, published save retaining status, category `视频`, read-only external key, dirty indicator, and reorder request payload.

- [ ] **Step 7: Run admin tests**

Run:

```bash
npx vitest --run src/admin/PromptLibraryPanel.test.tsx src/services/v2PromptsApi.test.ts
```

---

### Task 5: Add cached, lazy plaza media loading

**Files:**
- Create: `src/prompts/promptMediaCache.ts`
- Create: `src/prompts/promptMediaCache.test.ts`
- Modify: `src/services/v2PromptsApi.ts`
- Modify: `src/prompts/PromptCard.tsx`
- Modify: `src/prompts/PromptPlazaPage.tsx`
- Modify: `src/prompts/PromptDetailModal.tsx`
- Modify: `src/prompts/PromptPlazaPage.test.tsx`
- Modify: `src/prompts/PromptDetailModal.test.tsx`

- [ ] **Step 1: Write cache and lazy-loading tests**

Assert two consumers of the same `mediaId + variant` share one fetch, no more than four requests are active, an error is not cached forever, and an intersection event starts a card thumbnail request only after it approaches the viewport.

- [ ] **Step 2: Implement the media cache**

Export `getPromptMediaObjectUrl(mediaId, variant, options)` backed by an in-flight map and a bounded LRU map. Use the normal browser fetch cache (no `no-store`), create one object URL per cached response, and revoke URLs when evicted.

- [ ] **Step 3: Implement the card boundary**

Render a fixed-ratio placeholder while a card is outside the observer margin. Once visible, request only `thumb`, set `loading="lazy"` and `decoding="async"`, and preserve the existing masonry layout and intrinsic-ratio behavior.

- [ ] **Step 4: Update the detail modal variants**

Use `thumb` for thumbnails, `preview` for the selected main image, and request `original` only when zoom opens. Selecting a previously loaded item must change the image immediately from the cache.

- [ ] **Step 5: Add plaza and modal regressions**

Assert the plaza no longer starts one original fetch per card on mount, repeat openings reuse the cache, detail requests use the expected variants, and failed thumbnails do not hide titles/actions.

- [ ] **Step 6: Run frontend media tests**

Run:

```bash
npx vitest --run src/prompts/promptMediaCache.test.ts src/prompts/PromptCard.test.tsx src/prompts/PromptPlazaPage.test.tsx src/prompts/PromptDetailModal.test.tsx
```

---

### Task 6: Verify, document, and stage the rollout

**Files:**
- Modify: `PROJECT_RECORD.md`
- Modify: `docs/staging-runbook.md`

- [ ] **Step 1: Run the complete focused suite**

```bash
npx vitest --run apps/api/test/prompts.service.test.ts scripts/migrate-prompt-media-variants.test.ts src/services/v2PromptsApi.test.ts src/admin/PromptLibraryPanel.test.tsx src/prompts/promptMediaCache.test.ts src/prompts/PromptCard.test.tsx src/prompts/PromptPlazaPage.test.tsx src/prompts/PromptDetailModal.test.tsx
```

- [ ] **Step 2: Build all affected workspaces**

```bash
npm run build --workspace @aigc-flow/db
npm run build --workspace @aigc-flow/api
npm run build
```

- [ ] **Step 3: Run the migration script in dry-run mode**

```bash
node scripts/migrate-prompt-media-variants.ts --dry-run --concurrency 4
```

Record the planned generated/skipped/failed counts before changing files.

- [ ] **Step 4: Update staging instructions**

Document the Compose v2 order: pull/build, stop worker, run `node packages/db/dist/cli.js`, run the compiled or approved media-variant migration, start services, and inspect API/worker logs. Include the fallback behavior when a derived variant is missing.

- [ ] **Step 5: Browser-check the acceptance matrix**

Verify desktop and mobile admin lifecycle actions, published in-place edits, archive/delete guard, category selection, drag ordering, single-image plaza first load, repeat-load cache hits, multi-image detail variants, zoom original, no horizontal overflow, and no console errors.

- [ ] **Step 6: Update the project record**

Record migration counts, focused test counts, build results, browser results, and any remaining original-only media rows.

- [ ] **Step 7: Commit the implementation in bounded commits**

Use separate commits for server lifecycle/API, media variants, frontend admin UI, and plaza loading. Stage only task files and run `git diff --cached --check` before each commit.

---

## Plan Self-Review

- Spec coverage: lifecycle actions, published in-place saves, archive-before-delete, fixed `video` category, read-only external keys, drag ordering, optional descriptions, local variants, migration, cache headers, lazy loading, bounded concurrency, tenant isolation, tests, browser checks, deployment, and rollback each have an explicit task.
- Type consistency: the plan uses `promptIds`, `variant`, `thumbnail_storage_key`, `preview_storage_key`, `deleteAdminPrompt`, `reorderAdminPrompts`, and `getPromptMediaObjectUrl` consistently across the file map, API tasks, UI tasks, and tests.
- Placeholder scan: no `TODO`, `TBD`, or unspecified implementation steps are required; every command names its target and expected result.
- Scope: database/API lifecycle and media delivery are coupled through the same prompt media table, but each has an independently testable task boundary and can be rolled out with original-file fallback.
