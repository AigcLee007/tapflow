# Prompt Library Management And Media Performance Design

Date: 2026-07-22
Status: Approved for implementation

## Goal

Make the prompt library an operable administration surface and make the prompt plaza fast on repeat visits without changing the dedicated server-side media storage decision.

The approved behavior is:

- drafts can be edited, published, archived, or permanently deleted;
- published prompts can be edited and saved in place, remain published, and update the plaza immediately;
- published prompts must be archived or taken down before permanent deletion;
- archived prompts can be restored to draft or permanently deleted;
- categories are fixed and include a new `video` category;
- external keys are generated once and become read-only;
- featured ordering is managed by drag-and-drop rather than a raw numeric field;
- descriptions remain optional;
- Chinese and English prompt text are stored, displayed, copied, and referenced independently;
- existing and newly uploaded prompt media receive optimized variants, while the plaza uses lazy-loaded thumbnails.

## Root Cause

The current Prompt Library panel already calls `updateAdminPrompt` and `setAdminPromptStatus`, but it labels every save as `保存草稿` and exposes no prompt-level delete action. The API registers `POST /api/v2/admin/prompts/:promptId/status` and `DELETE` only for individual media, not for the prompt entity. The database has a prompt delete RLS policy, so the missing capability is an API and UI contract, not a database permission gap.

The current media path stores one original local file per media row. `PromptPlazaPage` requests the first media for every loaded card, and `getPromptMediaBlob` sends `cache: "no-store"`. This causes every plaza mount to download all first images again, even though the API response advertises a five-minute private cache. There are no prompt-specific thumbnail or preview variants, and card requests are not gated by viewport visibility.

## Information Architecture

### Library navigation

The Prompt Library tab keeps its current two-column layout but gains a compact state filter above the left list:

- `全部`
- `草稿`
- `已发布`
- `已归档`

The list is filtered locally after the authenticated admin fetch. Each row shows title, Chinese category, status, and updated time. Dragging is enabled only within the current filtered list and persists the new featured order for the rows being reordered.

The editor header shows the current state and a dirty indicator. The primary action changes with state:

| State | Allowed actions | Primary save label |
| --- | --- | --- |
| 草稿 | 保存修改、发布、归档、删除 | 保存修改 |
| 已发布 | 保存修改、下架为草稿、归档 | 保存修改 |
| 已归档 | 恢复为草稿、永久删除 | 恢复为草稿 |

`永久删除` is never shown for a published prompt. The confirmation dialog names the prompt and states that its server-side original, preview, and thumbnail files will also be removed.

### Form fields

The primary form contains:

- title;
- fixed Chinese category select;
- optional description;
- Chinese prompt text;
- English prompt text;
- negative prompt;
- comma-separated tags.

The advanced section contains the read-only external key and a short explanation of import synchronization. The numeric sort weight is removed from the form. A visible helper below the list explains that featured order is controlled by dragging.

Fixed categories and stable values are:

| Display label | Stored value |
| --- | --- |
| 人像 | `portrait` |
| 产品 | `product` |
| 电商 | `ecommerce` |
| 场景空间 | `scene` |
| 插画动漫 | `illustration` |
| 海报设计 | `poster` |
| 3D 材质 | `3d` |
| 视频 | `video` |

Descriptions are optional. When empty, cards and the modal omit the description region rather than rendering placeholder prose.

### Bilingual prompt text

The editor uses a compact `中文 / English` segmented control above two independent text fields. Either field may be empty, but at least one language is required before a draft can be saved or published. The interface shows which language has content without placing both long prompts on screen at once.

The public detail modal follows these rules:

- prefer Chinese when the browser language is Chinese and Chinese text exists;
- otherwise prefer English when it exists, then fall back to the remaining language;
- hide the language switch when only one language exists;
- `复制提示词` copies only the active language;
- the adjacent copy menu offers `复制中文`, `复制英文`, and `复制中英文` only when the corresponding content exists;
- `复制中英文` writes clearly separated `中文提示词：` and `English Prompt:` sections;
- prompt reference inserts only the active language into the target canvas node;
- search matches both language fields.

Language selection is modal-local UI state and is not authoritative persisted user data. Existing prompt-reference idempotency and project selection behavior remain unchanged.

## Lifecycle And Data Rules

### Published edits

`PATCH /api/v2/admin/prompts/:promptId` accepts the current status. When a published prompt is edited, the transaction updates its fields, increments `version`, updates `updated_at`, and leaves `status = 'published'` and `published_at` intact. The response is the fresh prompt view so the editor can clear its dirty state.

### Bilingual storage compatibility

Add nullable `prompt_text_zh` and `prompt_text_en` columns while retaining the current non-null `prompt_text` column for rollback compatibility. Backfill all existing `prompt_text` values into `prompt_text_en`. New writes require at least one bilingual field and maintain `prompt_text = COALESCE(NULLIF(prompt_text_en, ''), prompt_text_zh)` as a compatibility shadow.

The API response adds `promptTextZh` and `promptTextEn` while retaining `promptText` as the same fallback value during the compatibility window. JSON import accepts the two new names and continues accepting legacy `promptText` as an English alias. A future separately approved migration may remove the compatibility column only after rollback support is no longer required.

### Status transitions

The status endpoint validates these transitions:

- draft -> published only when at least one local media row exists;
- draft -> archived;
- published -> draft (explicit “下架为草稿”);
- published -> archived;
- archived -> draft;
- archived -> published only when local media exists.

The current media requirement remains server-side and fail-closed.

### Permanent deletion

Add `DELETE /api/v2/admin/prompts/:promptId` with the existing admin-system permission and tenant context. The service must:

1. select all local storage keys for the prompt;
2. delete the prompt row inside the tenant transaction, relying on the existing foreign-key cascades for media, favorites, and interactions;
3. remove the original, preview, and thumbnail files after the transaction commits;
4. ignore missing files while returning `{ ok: true }`;
5. reject published prompts with `PROMPT_DELETE_REQUIRES_ARCHIVE`.

If file cleanup partially fails, the API still returns success and logs the orphaned keys for an operator cleanup pass; database deletion must not be rolled back because of a missing filesystem file.

### Ordering

Add an authenticated admin endpoint accepting the complete ordered list of prompt IDs in one category/state scope. The service validates that every ID belongs to the current tenant/system-admin scope and updates `sort_weight` in one transaction using descending integer weights. The exact generated values are an implementation detail; the public contract is list order, not numeric weight.

The public featured query continues to sort by `sort_weight DESC, updated_at DESC, id DESC`. Latest and search ordering are unchanged.

## Media Storage And Delivery

Keep the prompt catalog root directory and original `storage_key` column. Add nullable derived keys for `preview_storage_key` and `thumbnail_storage_key` to `prompt_entry_media`. Each upload writes:

```text
<promptId>/<mediaId>.<original-extension>
<promptId>/<mediaId>.preview.webp
<promptId>/<mediaId>.thumb.webp
```

`sharp` creates:

- thumbnail: fit inside 640px, WebP quality 78;
- preview: fit inside 1600px, WebP quality 82;
- original: the uploaded JPG/PNG/WebP, retained for zoom/download.

The dimensions in the row remain the original dimensions. Variant dimensions are returned by the media list only when needed by the UI.

Add a one-off migration script that scans rows with a valid original file and missing derived keys, generates missing variants idempotently, and updates only successfully written files. It must support `--dry-run`, bounded concurrency, and a summary of skipped/failed rows. Run it after the database migration and before restarting the frontend for staging.

### API delivery contract

Extend both prompt media byte routes with `?variant=thumb|preview|original`, defaulting to `original` for compatibility. The service resolves the selected derived key and falls back to original only when the derived variant is missing. The response includes the selected MIME type and byte length.

For immutable media IDs, successful variant responses use:

```text
Cache-Control: private, max-age=31536000, immutable
ETag: "<media-id>-<variant>-<version>"
Vary: Authorization
```

The frontend media fetch helper must stop sending `cache: "no-store"` and use the browser's private HTTP cache. No prompt or media data is written to localStorage, IndexedDB, or canvas graph JSON.

## Plaza Loading Strategy

`PromptPlazaPage` requests only the first media metadata per card as it does today, but the card image fetch is moved behind a small `PromptMediaPreview`/loader boundary:

- use `IntersectionObserver` with a 300px root margin;
- maintain a module-level in-flight/cache map keyed by `mediaId + variant` for the current browser session;
- limit active fetches to four;
- revoke object URLs when an entry is evicted or the page is permanently unmounted;
- keep failed requests isolated to their card;
- use `loading="lazy"` and `decoding="async"` on the resulting image.

The detail modal requests the preview variant for its main image and the thumbnail variant for the rail. It requests the original only when zoom opens. Switching thumbnails must reuse the cache and never refetch an already loaded variant.

## Security And Tenant Isolation

All new routes use `requireAuth`, `requireTenant`, and the existing admin permission chain. The service continues to use `withPromptTransaction` and existing RLS policies. Storage keys are never returned to the frontend. Variant paths are resolved with the existing path traversal guard. `Vary: Authorization` prevents one authenticated response from being reused across authorization headers.

## Error Handling

- duplicate external keys return a clear `PROMPT_EXTERNAL_KEY_CONFLICT` validation error;
- saving with both bilingual prompt fields empty returns `PROMPT_TEXT_REQUIRED`;
- attempts to permanently delete published prompts return a 409-style domain error with the required archive action;
- invalid reorder payloads return `PROMPT_ORDER_INVALID` without partial updates;
- missing original files mark only that media as failed and do not hide prompt text;
- variant generation failures keep the original usable and report the failed variant in the migration summary;
- an expired or unauthorized admin session follows the existing centralized auth refresh behavior.

## Verification And Rollout

Focused tests must cover status transitions, published in-place edits, delete guards and cleanup, category validation including `video`, bilingual validation/backfill/search/copy/reference behavior, deterministic reorder updates, variant generation/fallback, cache headers, lazy card loading, and admin action labels.

Run the focused API, database, admin, and plaza tests, then `npm run build`. For staging:

1. pull the new commit and build Compose v2 images;
2. stop the worker before migration;
3. run the compiled database migration CLI;
4. run the media variant migration script in dry-run then write mode;
5. start API, worker, and frontend;
6. verify admin lifecycle actions, published editing, archive/delete guard, drag ordering, first-load request count, repeat-load cache hits, and detail zoom.

Rollback uses the previous image/commit. If variant generation is incomplete, the API falls back to originals and the migration can be rerun idempotently.

## Scope Boundaries

This design does not introduce a recycle-bin status, automatic prompt translation, move prompt media to S3, change canvas persistence, or expose external keys to end users. Prompt reference keeps its existing node-insertion contract and changes only which explicitly selected language text is inserted.
