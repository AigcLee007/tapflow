# Video Editor Local Render Output Phase 21 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the worker persist internally rendered local media files through the existing `MediaAssetStore` asset pipeline without converting large videos to base64 or creating a browser-local export path.

**Architecture:** Extend the shared `MediaOutput` shape with a worker-only `localFilePath` field, then teach `MediaAssetStore.resolveOutputBinary` to read that file into the existing object-storage + `assets` insertion flow. This keeps rendered FFmpeg outputs on the same authoritative asset path as provider outputs. No workflow wiring, no new API, no pricing unit, and no frontend behavior change is introduced in this phase.

**Tech Stack:** TypeScript, Node.js `fs/promises`, existing worker `MediaAssetStore`, Vitest.

---

### File Structure

- Modify `packages/ai-gateway-core/src/types.ts`
  - Add optional `localFilePath?: string | null` to `MediaOutput`.
  - This field is for worker-internal outputs and should not be persisted into canvas graph JSON.
- Modify `apps/worker/src/workflow-runtime/media-asset-store.ts`
  - Read local file outputs before URL/base64 fallback.
  - Infer filename/content type from `MediaOutput` metadata and local path extension.
  - Keep the existing upload, asset-row insert, and ref output behavior.
- Modify `apps/worker/src/workflow-runtime/service.ts`
  - Preserve `localFilePath` in `normalizeMediaOutputs` for internal worker outputs.
- Modify `apps/worker/test/media-asset-store.test.ts`
  - Add coverage proving local video files are uploaded and inserted as assets without base64.
- Modify `apps/worker/test/worker.test.ts`
  - Add a narrow `__workerTestUtils.normalizeMediaOutputs` regression so local file metadata survives normalization.
- Modify `PROJECT_RECORD.md`
  - Add Phase 21 notes and validation evidence.

---

### Task 1: Failing Local File Persistence Test

**Files:**
- Modify: `apps/worker/test/media-asset-store.test.ts`

- [ ] **Step 1: Write the failing local video output test**

Add imports:

```ts
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
```

Add this test:

```ts
test("persists local rendered video files without base64 conversion", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "tapflow-render-output-"));
  try {
    const outputPath = join(tempDir, "rendered-output.mp4");
    await writeFile(outputPath, Buffer.from("fake mp4 bytes"));

    const client = {
      query: vi.fn(async () => ({ rows: [] })),
    };
    const storageProvider = new MemoryStorageProvider();
    const store = new MediaAssetStore({
      assetBucket: "test-bucket",
      storageProvider,
    });

    const result = await store.persistOutputs(client as never, {
      kind: "video",
      nodeRunId: "00000000-0000-4000-8000-000000000032",
      outputs: [
        {
          durationMs: 4200,
          localFilePath: outputPath,
          mimeType: "video/mp4",
        },
      ],
      projectId: "00000000-0000-4000-8000-000000000033",
      tenantId: "00000000-0000-4000-8000-000000000034",
      workflowRunId: "00000000-0000-4000-8000-000000000035",
    });

    expect(result.refs).toEqual([
      expect.objectContaining({
        durationMs: 4200,
        kind: "video",
        mimeType: "video/mp4",
      }),
    ]);
    expect(storageProvider.objects.size).toBe(1);
    expect([...storageProvider.objects.values()][0]?.toString()).toBe("fake mp4 bytes");
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO assets"),
      expect.arrayContaining([
        "video/mp4",
        expect.stringContaining("rendered-output.mp4"),
        "rendered-output.mp4",
        14,
        null,
        null,
        4200,
      ]),
    );
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test --workspace @aigc-flow/worker -- test/media-asset-store.test.ts
```

Expected: FAIL because `MediaOutput.localFilePath` is not typed and `resolveOutputBinary` rejects outputs without URL/base64.

### Task 2: Local File Output Implementation

**Files:**
- Modify: `packages/ai-gateway-core/src/types.ts`
- Modify: `apps/worker/src/workflow-runtime/media-asset-store.ts`

- [ ] **Step 1: Extend `MediaOutput` type**

Add:

```ts
localFilePath?: string | null;
```

- [ ] **Step 2: Read local file outputs in `MediaAssetStore`**

In `media-asset-store.ts`:

- import `readFile` from `node:fs/promises`
- import `basename` from `node:path`
- add extension inference for `.mp4`, `.webm`, `.mov`, `.png`, `.jpg`, `.jpeg`, `.webp`
- in `resolveOutputBinary`, before URL handling:

```ts
if (output.localFilePath?.trim()) {
  const localFilePath = output.localFilePath.trim();
  const mimeType = output.mimeType?.trim() || inferMimeTypeFromFilename(localFilePath) || defaultMimeType(kind);
  return {
    body: await readFile(localFilePath),
    filename: inferFilename({ explicitFilename: output.filename ?? null, index, kind, mimeType, url: localFilePath }),
    mimeType,
  };
}
```

Make `inferFilename` use `basename()` for local paths when URL parsing fails.

- [ ] **Step 3: Run media asset store test to verify green**

Run:

```bash
npm run test --workspace @aigc-flow/worker -- test/media-asset-store.test.ts
```

Expected: PASS.

### Task 3: Worker Normalization Regression

**Files:**
- Modify: `apps/worker/src/workflow-runtime/service.ts`
- Modify: `apps/worker/test/worker.test.ts`

- [ ] **Step 1: Write failing normalization test**

Add `normalizeMediaOutputs` to `__workerTestUtils`.

Then add a worker skeleton test:

```ts
test("media output normalization preserves worker-local render file paths", () => {
  const outputs = (__workerTestUtils as {
    normalizeMediaOutputs: (
      outputs: Array<Record<string, unknown>>,
    ) => Array<Record<string, unknown>>;
  }).normalizeMediaOutputs([
    {
      durationMs: 4200,
      localFilePath: "C:/render/output.mp4",
      mimeType: "video/mp4",
    },
  ]);

  expect(outputs).toEqual([
    expect.objectContaining({
      durationMs: 4200,
      localFilePath: "C:/render/output.mp4",
      mimeType: "video/mp4",
    }),
  ]);
  expect(JSON.stringify(outputs)).not.toContain("base64");
});
```

Expected initial failure: `normalizeMediaOutputs` is not exported or strips `localFilePath`.

- [ ] **Step 2: Implement normalization support**

In service `normalizeMediaOutputs`, copy:

```ts
localFilePath: typeof output.localFilePath === "string" ? output.localFilePath : null,
```

Export the helper through `__workerTestUtils`.

- [ ] **Step 3: Run worker test to verify green**

Run:

```bash
npm run test --workspace @aigc-flow/worker -- test/worker.test.ts
```

Expected: PASS, with existing DB-backed tests skipped when local DB env is unavailable.

### Task 4: Validation, Record, Commit

**Files:**
- Modify: `PROJECT_RECORD.md`
- Track: `docs/superpowers/plans/2026-07-05-video-editor-local-render-output-phase-21.md`

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm run test --workspace @aigc-flow/worker -- test/media-asset-store.test.ts test/worker.test.ts
```

Expected: PASS, with existing DB-backed worker tests skipped when local DB env is unavailable.

- [ ] **Step 2: Run affected builds**

Run:

```bash
npm run build --workspace @aigc-flow/ai-gateway-core
npm run build --workspace @aigc-flow/worker
```

Expected: PASS.

- [ ] **Step 3: Run root build**

Run:

```bash
npm run build
```

Expected: PASS, allowing existing Browserslist, dynamic-import, and chunk-size warnings.

- [ ] **Step 4: Run whitespace check**

Run:

```bash
git diff --check
```

Expected: PASS.

- [ ] **Step 5: Update project record**

Prepend `2026-07-05 - Video Editor Local Render Output Phase 21` summarizing:

- `MediaOutput.localFilePath` and `MediaAssetStore` local-file persistence.
- worker normalization preserves local rendered file paths internally.
- no workflow wiring, browser-local export, new pricing unit, database schema change, or frontend draft persistence change was added.
- validation commands and outcomes.

- [ ] **Step 6: Commit**

Run:

```bash
git add packages/ai-gateway-core/src/types.ts apps/worker/src/workflow-runtime/media-asset-store.ts apps/worker/src/workflow-runtime/service.ts apps/worker/test/media-asset-store.test.ts apps/worker/test/worker.test.ts PROJECT_RECORD.md docs/superpowers/plans/2026-07-05-video-editor-local-render-output-phase-21.md
git commit -m "feat: persist local video render outputs"
```
