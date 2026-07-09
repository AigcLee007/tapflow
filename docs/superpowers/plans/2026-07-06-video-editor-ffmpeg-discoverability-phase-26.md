# Video Editor FFmpeg Discoverability Phase 26 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the internal `tapflow.video-editor-ffmpeg` route template easy to discover, install without credentials, and use from the runtime video model catalog.

**Architecture:** Keep the existing plugin install pipeline and model catalog service as the source of truth. Add only safe credential-requirement metadata to admin plugin summaries, hide irrelevant credential fields in Template Library for credential-free plugins, and prove the published route appears in `/api/v2/ai/model-catalog` with only public capability fields.

**Tech Stack:** Vite, React, TypeScript, Fastify API, PostgreSQL-backed v2 AI Gateway plugin/admin services, Vitest.

---

## Task 1: Admin Plugin Summary Credential Metadata

**Files:**
- Modify: `apps/api/src/modules/ai-plugins/ai-plugins.service.ts`
- Modify: `src/services/v2AiPluginAdminApi.ts`
- Modify: `src/services/v2AiPluginAdminApi.test.ts`

- [x] **Step 1: Write failing service/client test**

Add a client test that expects `listAiPlugins("video")` to preserve a `credentials.required` flag from the API response.

- [x] **Step 2: Run test to verify failure**

Run: `npm test -- src/services/v2AiPluginAdminApi.test.ts`

Expected: fail because the frontend type/API contract does not include credential metadata yet.

- [x] **Step 3: Add metadata**

Expose safe credential metadata in `AiPluginSummaryView`:

```ts
credentials: {
  fields: manifest.credentials.fields.map(({ key, label, placeholder, required, secret }) => ({
    key,
    label,
    placeholder,
    required,
    secret,
  })),
  required: manifest.credentials.fields.some((field) => field.required),
  type: manifest.credentials.type,
}
```

Mirror that shape in `src/services/v2AiPluginAdminApi.ts`.

- [x] **Step 4: Run test to verify pass**

Run: `npm test -- src/services/v2AiPluginAdminApi.test.ts`

## Task 2: Template Library Credential-Free Install UX

**Files:**
- Create: `src/account/TemplateLibraryPage.test.tsx`
- Modify: `src/account/TemplateLibraryPage.tsx`

- [x] **Step 1: Write failing UI test**

Render the Template Library with the video FFmpeg plugin selected. Assert:

- Video modality can be selected.
- The plugin appears.
- API Key and credential-name inputs are absent.
- Clicking install calls `installAiPlugin("tapflow.video-editor-ffmpeg", { publishImmediately: true })` without `credential`.

- [x] **Step 2: Run test to verify failure**

Run: `npm test -- src/account/TemplateLibraryPage.test.tsx`

Expected: fail because the UI currently always renders credential inputs.

- [x] **Step 3: Hide credential fields when no credential is required**

Use `selectedPlugin.credentials.required` and `selectedPlugin.credentials.fields.length` to determine whether credential inputs should render. Keep `baseUrlOverride` and `publishImmediately` available.

- [x] **Step 4: Run test to verify pass**

Run: `npm test -- src/account/TemplateLibraryPage.test.tsx`

## Task 3: Runtime Video Model Catalog Coverage

**Files:**
- Modify: `apps/api/test/ai-model-catalog.test.ts`

- [x] **Step 1: Write API regression test**

Install `tapflow.video-editor-ffmpeg` with `publishImmediately: true`, then assert:

- `/api/v2/admin/ai/plugins?modality=video` lists `tapflow.video-editor-ffmpeg` and says credentials are not required.
- `/api/v2/ai/model-catalog?modality=video` returns `video-editor-ffmpeg`.
- `/api/v2/ai/model-catalog/video-editor-ffmpeg/routes` returns `video.editor.ffmpeg`.
- Route capabilities include `supportedVideoWorkflows: ["video_editor_export"]`.
- Route response does not include `videoEditorRenderEngine`, `requestConfig`, or `internalRender`.

- [x] **Step 2: Run test**

Run: `npm run test --workspace @aigc-flow/api -- test/ai-model-catalog.test.ts`

Expected locally: DB-backed tests may skip if no local database env exists; otherwise the new test should pass.

## Task 4: Validation And Record

**Files:**
- Modify: `PROJECT_RECORD.md`

- [x] **Step 1: Run focused verification**

Run:

```bash
npm test -- src/services/v2AiPluginAdminApi.test.ts src/account/TemplateLibraryPage.test.tsx
npm run test --workspace @aigc-flow/api -- test/ai-model-catalog.test.ts test/ai-plugins.test.ts
npm run build --workspace @aigc-flow/api
npm run build
git diff --check
```

- [x] **Step 2: Update project record**

Add a top entry for Phase 26 with changed behavior and validation.

- [x] **Step 3: Commit**

Commit the scoped changes as:

```bash
git commit -m "feat: expose video editor ffmpeg plugin install path"
```
