# Prompt Local Media Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store prompt-plaza effect images in a dedicated persistent server directory, expose them only through authenticated API reads, and let administrators upload, order, and remove images from the prompt library.

**Architecture:** Extend `prompt_entry_media` with a stable media ID and local-file metadata while retaining legacy asset columns for migration compatibility. The API writes validated image buffers under `PROMPT_CATALOG_MEDIA_DIR`, and the frontend fetches authenticated bytes into short-lived object URLs. The navigation is made single-line at desktop widths by preventing label wrapping and using a compact fallback before mobile navigation.

**Tech Stack:** React, Vite, Fastify, PostgreSQL migrations/RLS, Node `fs/promises`, Docker Compose v2, Vitest.

---

### Task 1: Local media schema and service contract

**Files:**
- Create: `packages/db/migrations/000040_prompt_catalog_local_media.sql`
- Modify: `apps/api/src/modules/prompts/prompts.schemas.ts`
- Modify: `apps/api/src/modules/prompts/prompts.service.ts`
- Test: `apps/api/test/prompts.schemas.test.ts`

- [ ] Add media schema tests for a filename, image MIME type, dimensions, and ordered media IDs.
- [ ] Add an additive migration that makes `asset_id` nullable, adds `id`, `storage_key`, `original_filename`, `mime_type`, `size_bytes`, `width`, `height`, changes the primary key to `id`, and requires exactly one storage location.
- [ ] Add `uploadLocalMedia`, `listPromptMedia`, `updatePromptMedia`, and `deletePromptMedia` service methods. Validate the prompt belongs to the official catalog, validate image MIME types and a 10 MB limit, and write only generated relative paths below the configured directory.
- [ ] Make publishing fail with `PROMPT_MEDIA_REQUIRED` when no local media is attached.

### Task 2: Authenticated local-file routes and client

**Files:**
- Modify: `apps/api/src/modules/prompts/prompts.routes.ts`
- Modify: `apps/api/src/config/env.ts`
- Modify: `src/services/v2HttpClient.ts`
- Modify: `src/services/v2PromptsApi.ts`
- Test: `src/services/v2PromptsApi.test.ts`

- [ ] Add admin upload, media list/order patch, and media delete endpoints.
- [ ] Add an authenticated `GET /api/v2/prompts/media/:mediaId/bytes` endpoint that streams only a published, visible media record.
- [ ] Add an authenticated client blob helper and replace asset download URL use with a local `PromptMedia` binary fetch.
- [ ] Verify that upload calls send raw bytes with filename/MIME/dimension headers and that bytes endpoint is requested by media ID.

### Task 3: Prompt-library image controls and external key clarity

**Files:**
- Modify: `src/admin/PromptLibraryPanel.tsx`
- Modify: `src/admin/PromptLibraryPanel.test.tsx`

- [ ] Write a failing component test for the disabled-before-save state and for an uploaded media item being rendered with a remove action.
- [ ] Add an effect gallery upload area with file picker, 1-4 image limit, previews, order controls, delete, and upload state.
- [ ] Generate an external key automatically from title when blank; rename the label to `外部唯一标识（用于导入同步）` and show concise help text.

### Task 4: Single-line shell navigation and deployment persistence

**Files:**
- Modify: `src/app/WorkspaceShell.tsx`
- Test: `src/app/WorkspaceShell.test.tsx`
- Modify: `docker-compose.staging.yml`
- Modify: `docs/STAGING_ENV_TEMPLATE.md`
- Modify: `PROJECT_RECORD.md`

- [ ] Write a regression test that asserts desktop navigation controls carry a no-wrap class.
- [ ] Set the desktop navigation and button labels to no-wrap, reduce desktop padding/gaps, and retain the existing mobile navigation fallback.
- [ ] Add `PROMPT_CATALOG_MEDIA_DIR=/var/lib/tapflow/prompt-catalog` to API runtime environment and a host bind mount controlled by `PROMPT_CATALOG_MEDIA_HOST_DIR`.
- [ ] Document directory creation, backup, and deployment validation in the staging environment template and project record.

### Task 5: Verification and delivery

**Files:**
- Modify: relevant tests and production files only

- [ ] Run focused frontend prompt/admin/shell tests and API prompt schema tests.
- [ ] Build API dependency packages, API, and frontend with `npm run build`.
- [ ] Inspect the staged diff, commit only task files, push `main`, and verify `origin/main` matches the commit.
