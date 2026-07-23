# Prompt Media 25 MB Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accept prompt effect-image originals up to 25 MB, reject larger files with a specific message, and continue serving generated WebP derivatives in the prompt plaza.

**Architecture:** Keep the existing raw binary upload and server-local original storage. Align the Fastify parser, service validation, and browser preflight around one exported 25 MB limit so oversized input is rejected before network transfer while the server remains authoritative.

**Tech Stack:** React, TypeScript, Fastify, Vitest, Sharp

---

### Task 1: Define and enforce the shared server limit

**Files:**
- Modify: `apps/api/src/modules/prompts/prompts.service.ts`
- Modify: `apps/api/src/modules/prompts/prompts.routes.ts`
- Test: `apps/api/test/prompts.routes.test.ts`
- Test: `apps/api/test/prompts.service.test.ts`

- [ ] **Step 1: Write failing route and service tests**

Add a route test that injects an 11 MB `application/x-prompt-media` body and expects it to reach `uploadLocalMedia`. Add service tests asserting 25 MB is accepted past size validation and 25 MB plus one byte fails with `PROMPT_MEDIA_SIZE_INVALID` and `效果图大小必须在 25 MB 以内`.

- [ ] **Step 2: Run tests to verify RED**

Run: `npm test -- apps/api/test/prompts.routes.test.ts apps/api/test/prompts.service.test.ts`

Expected: the 11 MB request is rejected by the existing 10 MB parser or the service returns the old 10 MB behavior.

- [ ] **Step 3: Implement the 25 MB server limit**

Export `PROMPT_MEDIA_MAX_BYTES = 25 * 1024 * 1024` from the service, use it in the service validation, update the validation message, and use the same value as the content parser `bodyLimit`.

- [ ] **Step 4: Run tests to verify GREEN**

Run: `npm test -- apps/api/test/prompts.routes.test.ts apps/api/test/prompts.service.test.ts`

Expected: all selected tests pass.

### Task 2: Reject oversized files in the browser

**Files:**
- Modify: `src/services/v2PromptsApi.ts`
- Modify: `src/services/v2PromptsApi.test.ts`
- Modify: `src/admin/PromptLibraryPanel.tsx`
- Test: `src/admin/PromptLibraryPanel.test.tsx`

- [ ] **Step 1: Write failing frontend tests**

Add an API-client test using a `File` larger than 25 MB and assert `uploadAdminPromptMedia` rejects with `效果图大小必须在 25 MB 以内` without calling `fetch`. Add a panel assertion that upload guidance visibly says `单张最大 25 MB`.

- [ ] **Step 2: Run tests to verify RED**

Run: `npm test -- src/services/v2PromptsApi.test.ts src/admin/PromptLibraryPanel.test.tsx`

Expected: the oversized file reaches `fetch` or the guidance assertion fails.

- [ ] **Step 3: Implement browser preflight and guidance**

Export a frontend `PROMPT_MEDIA_MAX_BYTES` constant, validate the file before reading dimensions or sending it, and update the effect-image helper text to mention JPG/PNG/WebP, WebP display derivatives, and the 25 MB limit.

- [ ] **Step 4: Run tests to verify GREEN**

Run: `npm test -- src/services/v2PromptsApi.test.ts src/admin/PromptLibraryPanel.test.tsx`

Expected: all selected tests pass.

### Task 3: Record and verify the change

**Files:**
- Modify: `PROJECT_RECORD.md`

- [ ] **Step 1: Record behavior and deployment impact**

Document the 25 MB original upload ceiling, browser preflight, accurate error, retained original, and WebP derivative behavior. Note that no database migration or environment variable is required.

- [ ] **Step 2: Run full verification**

Run: `npm test -- apps/api/test/prompts.routes.test.ts apps/api/test/prompts.service.test.ts src/services/v2PromptsApi.test.ts src/admin/PromptLibraryPanel.test.tsx`

Run: `npm run build`

Expected: both commands exit successfully.

- [ ] **Step 3: Commit and push only relevant files**

Stage the plan, prompt route/service/client/panel tests and implementations, and `PROJECT_RECORD.md`. Commit with `fix: accept larger prompt effect images`, then push `main` to `origin`.
