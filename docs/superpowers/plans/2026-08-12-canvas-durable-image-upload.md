# Canvas Durable Image Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make new project-canvas local image uploads durable `assets` stored in the configured S3-compatible object store while retaining temporary `bytea` uploads for standalone workbench references.

**Architecture:** Reuse `uploadAssetFile` and `buildAssetBackedNodeData` through the existing local-image helper. Replace only project-canvas callers of the temporary-reference helper. The standalone workbench continues using `uploadReferenceImageFile`; existing persisted `referenceUploadId` values are deliberately untouched.

**Tech Stack:** React 19, TypeScript, Vitest, Fastify v2 asset APIs, PostgreSQL, S3-compatible object storage.

---

## File Map

- `src/flowCanvas/utils/localImageUpload.ts`: asset-backed local image upload helper used by project-canvas entry points.
- `src/flowCanvas/utils/localImageUpload.test.ts`: proves canvas helper behavior and preserves the workbench-only temporary helper.
- `src/flowCanvas/canvas/AiFlowCanvas.tsx`: drag-and-drop and paste image insertion.
- `src/flowCanvas/nodes/FlowNodes.tsx`: image-node local main and local-reference uploads.
- `src/flowCanvas/nodes/FlowNodes.image-inputs.test.tsx`: image-node upload regression coverage.
- `PROJECT_RECORD.md`: records the completed storage-policy change and verification.

### Task 1: Establish Asset-Backed Local Image Helper Coverage

**Files:**

- Modify: `src/flowCanvas/utils/localImageUpload.test.ts`
- Modify: `src/flowCanvas/utils/localImageUpload.ts`

- [ ] **Step 1: Write the failing durable-asset test**

Replace the temporary-reference expectation with a test that mocks `uploadAssetFile` returning `asset-cat`, calls `uploadLocalImageAndBuildAssetNodeData` with `projectId: 'project-1'`, and asserts `uploadAssetFile({ file, kind: 'image', projectId: 'project-1' })`, `assetId: 'asset-cat'`, `assetIds: ['asset-cat']`, and no `referenceUploadId`.

Retain a separate temporary-helper test proving `uploadLocalImageAndBuildReferenceNodeData` calls `uploadReferenceImageFile` and not `uploadAssetFile`.

- [ ] **Step 2: Verify the test is red**

Run: `npm test -- src/flowCanvas/utils/localImageUpload.test.ts`

Expected: the new durable-asset expectation initially fails because current project-canvas callers still use the temporary-reference helper.

- [ ] **Step 3: Keep the helper project-aware and asset-backed**

Ensure `uploadLocalImageAndBuildAssetNodeData` uses the existing contract: call `uploadAssetFile` with `file`, `kind: 'image'`, and `projectId`; resolve a signed asset preview; return `buildAssetBackedNodeData` with `naturalHeight`, `naturalWidth`, preview URL, source, and title. Do not alter `uploadLocalImageAndBuildReferenceNodeData` or `referenceUploadsApi.ts`.

- [ ] **Step 4: Verify the helper tests are green**

Run: `npm test -- src/flowCanvas/utils/localImageUpload.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit helper coverage**

Run: `git add src/flowCanvas/utils/localImageUpload.ts src/flowCanvas/utils/localImageUpload.test.ts`

Run: `git commit -m "test: cover durable canvas image uploads"`

### Task 2: Route Canvas Drag, Paste, and Image Upload Through Assets

**Files:**

- Modify: `src/flowCanvas/canvas/AiFlowCanvas.tsx`
- Modify: `src/flowCanvas/nodes/FlowNodes.tsx`
- Test: `src/flowCanvas/nodes/FlowNodes.image-inputs.test.tsx`

- [ ] **Step 1: Write the failing image-node local upload test**

Add a test that binds `backendProjectId: 'project-image-upload'`, mocks an uploaded image asset and preview URL, selects a local image through the image node, and asserts `uploadAssetFile({ file: expect.any(File), kind: 'image', projectId: 'project-image-upload' })`. Assert the node contains `assetId: 'asset-uploaded-image'`, `assetIds: ['asset-uploaded-image']`, `source: 'node-upload'`, and no `referenceUploadId`.

- [ ] **Step 2: Verify the test is red**

Run: `npm test -- src/flowCanvas/nodes/FlowNodes.image-inputs.test.tsx`

Expected: FAIL because the current local upload calls `uploadLocalImageAndBuildReferenceNodeData` and writes `referenceUploadId`.

- [ ] **Step 3: Replace every project-canvas temporary helper call**

In `AiFlowCanvas.tsx` and `FlowNodes.tsx`, replace the `uploadLocalImageAndBuildReferenceNodeData` import and all three call sites with `uploadLocalImageAndBuildAssetNodeData`. Preserve immediate blob preview, error state, upload state, and local URL revocation. Pass each call's existing `file`, `natural`, `source`, and `title` plus `projectId: backendProjectId ?? null`.

Change exactly these call sites: canvas drag/paste insertion, image-node main upload, and image-node local reference upload. Do not change `src/workbench/**`, `src/services/referenceUploadsApi.ts`, or API workbench routes.

- [ ] **Step 4: Verify focused tests are green**

Run: `npm test -- src/flowCanvas/utils/localImageUpload.test.ts src/flowCanvas/nodes/FlowNodes.image-inputs.test.tsx`

Expected: PASS, proving canvas uploads create `assets` while the temporary helper remains available for standalone workbench references.

- [ ] **Step 5: Commit caller migration**

Run: `git add src/flowCanvas/canvas/AiFlowCanvas.tsx src/flowCanvas/nodes/FlowNodes.tsx src/flowCanvas/nodes/FlowNodes.image-inputs.test.tsx`

Run: `git commit -m "feat: persist canvas image uploads as assets"`

### Task 3: Verify Boundaries and Record Policy

**Files:**

- Modify: `PROJECT_RECORD.md`
- Test: `src/flowCanvas/utils/localImageUpload.test.ts`

- [ ] **Step 1: Verify the temporary-workbench boundary**

Run: `npm test -- src/flowCanvas/utils/localImageUpload.test.ts`

Expected: PASS, including the test that the temporary helper calls `uploadReferenceImageFile`, returns `referenceUploadId`, and does not call `uploadAssetFile`.

- [ ] **Step 2: Record the policy change**

Append a dated `PROJECT_RECORD.md` entry stating that new project-canvas local image uploads use durable `/api/v2/assets` records and asset IDs; standalone `/workbench` reference images remain seven-day `workbench_reference_uploads.bytes` records; existing canvas `referenceUploadId` drafts are deliberately not migrated; and include fresh test/build results.

- [ ] **Step 3: Run required verification**

Run: `npm test -- src/flowCanvas/utils/localImageUpload.test.ts src/flowCanvas/nodes/FlowNodes.image-inputs.test.tsx`

Run: `npm run build`

Expected: both commands exit code `0`; report any non-fatal warnings separately.

- [ ] **Step 4: Commit the record**

Run: `git add PROJECT_RECORD.md`

Run: `git commit -m "docs: record durable canvas upload policy"`

## Plan Review

- Spec coverage: Task 1 tests the helper, Task 2 changes all identified project-canvas call sites, and Task 3 proves the workbench boundary, records the change, and runs the required build.
- Scope control: no migrations, asset API changes, workbench API changes, or rewrites of existing `referenceUploadId` draft data are included.
- Placeholder scan: no TBD, TODO, or deferred implementation language remains.
- Type consistency: all callers use the existing local-image helper inputs: `file`, `natural`, `projectId`, `source`, and `title`.
