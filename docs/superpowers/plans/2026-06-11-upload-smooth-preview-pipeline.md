# Upload Smooth Preview Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make local image uploads feel TapNow-smooth by showing a canvas preview immediately, moving image decode and upload into background work, and ensuring uploaded assets get the same lightweight preview variants as generated assets.

**Architecture:** Split upload handling into an instant UI pipeline and a persistence pipeline. The UI creates a blob-backed node synchronously, optionally swaps in a lightweight local preview after async downscaling, then uploads the original file and replaces node data with asset-backed preview URLs. The backend creates `thumb` and `preview` WebP variants for uploaded image assets so refreshed canvases and `/assets` never need to render the original image for first paint.

**Tech Stack:** Vite + React, Zustand flow canvas store, `@xyflow/react`, browser `URL.createObjectURL` / `createImageBitmap` / canvas, Fastify API, existing object storage provider, existing `asset_variants` table and worker `createImageVariants` implementation.

---

## Success Criteria

- Clicking upload in an image node shows a visible image node immediately without waiting for upload or natural-size decode.
- Clicking upload in an upload node converts it to an image node immediately.
- Dragging a local image onto the canvas inserts a visible node immediately.
- Pasting a copied image inserts a visible node immediately.
- No upload entry point waits on `getImageNaturalSize`, `createImageBitmap`, `fetch`, or `uploadAssetFile` before first canvas update.
- Upload success stores `assetId` / `assetIds` and switches the node to a signed `preview` variant when available.
- Upload failure keeps the local preview visible and shows an error state instead of leaving a blank node.
- Refreshing after upload restores from asset-backed data and loads quickly through preview variants.
- `/assets` shows uploaded images through `thumb` variants, same as generated images.

## Files To Modify

- Modify: `src/flowCanvas/utils/localImageUpload.ts`
  - Provide synchronous immediate node data, async local preview generation, async measurement, and upload-only asset hydration helpers.
- Modify: `src/flowCanvas/utils/localImageUpload.test.ts`
  - Cover non-blocking immediate helper and upload helper behavior.
- Modify: `src/flowCanvas/nodes/FlowNodes.tsx`
  - Change image-node and upload-node upload handlers to update UI first, then run background preview/measurement/upload.
- Modify: `src/flowCanvas/canvas/AiFlowCanvas.tsx`
  - Remove drag/paste `Promise.all` measurement gate and use the same immediate/background pipeline.
- Modify: `apps/api/src/modules/assets/assets.service.ts`
  - Generate `thumb` / `preview` variants when user-uploaded image assets complete.
- Modify: `apps/api/test/assets.test.ts`
  - Assert `complete-upload` creates variants for uploaded images.
- Modify: `PROJECT_RECORD.md`
  - Record the upload smoothness pipeline work, validation commands, and deployment note.

## Batch 1: Frontend Instant Preview Pipeline

### Task 1: Refactor Local Upload Helpers

**Files:**
- Modify: `src/flowCanvas/utils/localImageUpload.ts`
- Test: `src/flowCanvas/utils/localImageUpload.test.ts`

- [ ] **Step 1: Add tests for synchronous immediate node data**

In `src/flowCanvas/utils/localImageUpload.test.ts`, add a new `describe('createImmediateLocalImageNodeData')` block before the existing upload tests:

```ts
describe('createImmediateLocalImageNodeData', () => {
  beforeEach(() => {
    uploadAssetFileMock.mockReset();
    getAssetVariantUrlMock.mockReset();
    getAssetDownloadUrlMock.mockReset();
    getImageNaturalSizeMock.mockReset();
  });

  it('returns blob-backed node data without decoding or uploading', async () => {
    const { createImmediateLocalImageNodeData } = await import('./localImageUpload');
    const file = new File(['cat'], 'cat.png', { type: 'image/png' });

    const result = createImmediateLocalImageNodeData({
      file,
      objectUrl: 'blob://local-cat',
      source: 'node-upload',
      title: 'Cat',
    });

    expect(result).toMatchObject({
      localObjectUrl: 'blob://local-cat',
      nodeData: {
        generationStatus: 'generating',
        mimeType: 'image/png',
        originalImageUrl: 'blob://local-cat',
        source: 'node-upload',
        status: 'running',
        thumbnailUrl: 'blob://local-cat',
        title: 'Cat',
      },
    });
    expect(result.nodeData.width).toBeGreaterThan(0);
    expect(result.nodeData.height).toBeGreaterThan(0);
    expect(getImageNaturalSizeMock).not.toHaveBeenCalled();
    expect(uploadAssetFileMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Replace the old helper shape**

In `src/flowCanvas/utils/localImageUpload.ts`, replace the current `prepareLocalImageNodeData` and `prepareUploadedImageNodeData` implementation with these helper boundaries:

```ts
import {
  getAssetDownloadUrl,
  getAssetVariantUrl,
  uploadAssetFile,
  type AssetItem,
} from '../../assets/assetApi';
import { buildAssetBackedNodeData } from './assetNodeData';
import { getImageNaturalSize } from './imageUtils';
import { FLOW_NODE_DEFAULT_SIZES, fitMediaNodeToShortSide } from './nodeSizing';
import type { FlowNodeData } from '../types';

type LocalImageUploadInput = {
  file: File;
  projectId?: string | null;
  source: string;
  title?: string;
};

type ImmediateLocalImageInput = Omit<LocalImageUploadInput, 'projectId'> & {
  objectUrl: string;
};

export function createImmediateLocalImageNodeData(input: ImmediateLocalImageInput): {
  localObjectUrl: string;
  nodeData: Partial<FlowNodeData>;
} {
  const fallback = FLOW_NODE_DEFAULT_SIZES.image;
  const title = input.title || input.file.name.replace(/\.[^.]+$/, '') || '图片';

  return {
    localObjectUrl: input.objectUrl,
    nodeData: {
      title,
      thumbnailUrl: input.objectUrl,
      originalImageUrl: input.objectUrl,
      width: fallback.width,
      height: fallback.height,
      editHistory: [],
      imageFolderIds: [],
      status: 'running',
      generationStatus: 'generating',
      generatedResults: undefined,
      activeResultIndex: undefined,
      coverResultId: undefined,
      favoriteResultIds: undefined,
      lastGenerationSnapshot: undefined,
      errorMessage: undefined,
      source: input.source,
      mimeType: input.file.type || 'image/*',
    },
  };
}

export async function measureLocalImageNodeData(objectUrl: string): Promise<Partial<FlowNodeData>> {
  const natural = await getImageNaturalSize(objectUrl);
  const fitted = fitMediaNodeToShortSide(natural.w, natural.h);

  return {
    width: fitted.width,
    height: fitted.height,
    naturalWidth: natural.w,
    naturalHeight: natural.h,
    aspectRatio: natural.w / natural.h,
  };
}

export async function createLocalPreviewObjectUrl(file: File): Promise<string | null> {
  if (!file.type.startsWith('image/')) return null;
  if (typeof createImageBitmap !== 'function') return null;

  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const maxSide = 1024;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/webp', 0.82);
    });
    return blob ? URL.createObjectURL(blob) : null;
  } finally {
    bitmap.close();
  }
}

export async function uploadLocalImageAndBuildAssetNodeData(input: LocalImageUploadInput & {
  natural?: { h: number; w: number } | null;
}): Promise<{
  asset: AssetItem;
  nodeData: ReturnType<typeof buildAssetBackedNodeData>;
}> {
  const asset = await uploadAssetFile({
    file: input.file,
    kind: 'image',
    projectId: input.projectId ?? null,
  });
  const assetPreviewUrl = await resolveUploadedAssetPreviewUrl(asset.id);
  const naturalWidth = input.natural?.w ?? asset.width ?? null;
  const naturalHeight = input.natural?.h ?? asset.height ?? null;

  return {
    asset,
    nodeData: buildAssetBackedNodeData(asset, {
      naturalHeight,
      naturalWidth,
      previewUrl: assetPreviewUrl,
      source: input.source,
      title: input.title || input.file.name.replace(/\.[^.]+$/, '') || asset.title || '图片',
    }),
  };
}

async function resolveUploadedAssetPreviewUrl(assetId: string): Promise<string | undefined> {
  try {
    const preview = await getAssetVariantUrl(assetId, 'preview');
    return preview.url;
  } catch {
    try {
      const fallback = await getAssetDownloadUrl(assetId);
      return fallback.url;
    } catch {
      return undefined;
    }
  }
}
```

- [ ] **Step 3: Update existing upload tests to the new helper name**

Rename the existing test suite from `prepareUploadedImageNodeData` to `uploadLocalImageAndBuildAssetNodeData`. Update imports and calls:

```ts
const { uploadLocalImageAndBuildAssetNodeData } = await import('./localImageUpload');
const result = await uploadLocalImageAndBuildAssetNodeData({
  file,
  natural: { h: 768, w: 1024 },
  projectId: '11111111-1111-1111-1111-111111111111',
  source: 'node-upload',
  title: 'Cat',
});
```

Remove expectations that `getImageNaturalSizeMock` is called for upload hydration. The upload helper must not decode the file.

- [ ] **Step 4: Run the focused helper tests**

Run:

```bash
npm run test -- src/flowCanvas/utils/localImageUpload.test.ts
```

Expected: tests pass.

### Task 2: Update Image Node Upload To Paint First

**Files:**
- Modify: `src/flowCanvas/nodes/FlowNodes.tsx`

- [ ] **Step 1: Change imports**

Replace:

```ts
import { prepareLocalImageNodeData, prepareUploadedImageNodeData } from '../utils/localImageUpload';
```

with:

```ts
import {
  createImmediateLocalImageNodeData,
  createLocalPreviewObjectUrl,
  measureLocalImageNodeData,
  uploadLocalImageAndBuildAssetNodeData,
} from '../utils/localImageUpload';
```

- [ ] **Step 2: Rewrite image-node `handleFileChange`**

Replace the current `handleFileChange` body around the image node upload handler with this behavior:

```ts
const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const input = e.target;
  const title = file.name.replace(/\.[^.]+$/, '') || d.title;
  const localObjectUrl = URL.createObjectURL(file);
  let activePreviewUrl = localObjectUrl;
  let uploadSucceeded = false;
  let measuredNatural: { h: number; w: number } | null = null;

  const immediate = createImmediateLocalImageNodeData({
    file,
    objectUrl: localObjectUrl,
    source: 'node-upload',
    title,
  });
  updateNodeData(id, immediate.nodeData);
  input.value = '';

  void (async () => {
    try {
      const measured = await measureLocalImageNodeData(localObjectUrl);
      measuredNatural =
        typeof measured.naturalWidth === 'number' && typeof measured.naturalHeight === 'number'
          ? { w: measured.naturalWidth, h: measured.naturalHeight }
          : null;
      updateNodeData(id, measured);
    } catch {
      // Keep the immediate preview visible even if measurement fails.
    }
  })();

  void (async () => {
    try {
      const previewUrl = await createLocalPreviewObjectUrl(file);
      if (previewUrl && !uploadSucceeded) {
        activePreviewUrl = previewUrl;
        updateNodeData(id, {
          originalImageUrl: previewUrl,
          thumbnailUrl: previewUrl,
        });
      }
    } catch {
      // The original blob preview is already visible.
    }
  })();

  void (async () => {
    try {
      const uploaded = await uploadLocalImageAndBuildAssetNodeData({
        file,
        natural: measuredNatural,
        projectId: backendProjectId,
        source: 'node-upload',
        title,
      });
      uploadSucceeded = true;
      updateNodeData(id, {
        ...uploaded.nodeData,
        status: 'success',
        generationStatus: 'done',
      });
      URL.revokeObjectURL(localObjectUrl);
      if (activePreviewUrl !== localObjectUrl) URL.revokeObjectURL(activePreviewUrl);
    } catch (error) {
      updateNodeData(id, {
        errorMessage: error instanceof Error ? error.message : '图片上传失败',
        generationStatus: 'error',
        status: 'error',
      });
    }
  })();
};
```

Important: on failure, do not revoke the local blob URL; the visible preview must remain.

- [ ] **Step 3: Run TypeScript build for frontend**

Run:

```bash
npm run build
```

Expected: build passes, or any unrelated pre-existing failure is recorded exactly.

### Task 3: Update Upload Node To Convert Immediately

**Files:**
- Modify: `src/flowCanvas/nodes/FlowNodes.tsx`

- [ ] **Step 1: Rewrite `UploadNodeComponent` `handleUpload`**

Replace the current async upload-node `handleUpload` with a non-blocking handler:

```ts
const handleUpload = useCallback((file: File) => {
  const title = file.name.replace(/\.[^.]+$/, '') || d.title || '图片';
  const localObjectUrl = URL.createObjectURL(file);
  let activePreviewUrl = localObjectUrl;
  let uploadSucceeded = false;
  let measuredNatural: { h: number; w: number } | null = null;

  const immediate = createImmediateLocalImageNodeData({
    file,
    objectUrl: localObjectUrl,
    source: 'node-upload',
    title,
  });

  replaceNode(id, {
    type: 'image',
    data: immediate.nodeData,
  });

  void (async () => {
    try {
      const measured = await measureLocalImageNodeData(localObjectUrl);
      measuredNatural =
        typeof measured.naturalWidth === 'number' && typeof measured.naturalHeight === 'number'
          ? { w: measured.naturalWidth, h: measured.naturalHeight }
          : null;
      useFlowCanvasStore.getState().updateNodeData(id, measured);
    } catch {
      // Keep immediate preview.
    }
  })();

  void (async () => {
    try {
      const previewUrl = await createLocalPreviewObjectUrl(file);
      if (previewUrl && !uploadSucceeded) {
        activePreviewUrl = previewUrl;
        useFlowCanvasStore.getState().updateNodeData(id, {
          originalImageUrl: previewUrl,
          thumbnailUrl: previewUrl,
        });
      }
    } catch {
      // Keep original blob preview.
    }
  })();

  void (async () => {
    try {
      const uploaded = await uploadLocalImageAndBuildAssetNodeData({
        file,
        natural: measuredNatural,
        projectId: backendProjectId,
        source: 'node-upload',
        title,
      });
      uploadSucceeded = true;
      useFlowCanvasStore.getState().updateNodeData(id, {
        ...uploaded.nodeData,
        status: 'success',
        generationStatus: 'done',
      });
      URL.revokeObjectURL(localObjectUrl);
      if (activePreviewUrl !== localObjectUrl) URL.revokeObjectURL(activePreviewUrl);
    } catch (error) {
      useFlowCanvasStore.getState().updateNodeData(id, {
        errorMessage: error instanceof Error ? error.message : '图片上传失败',
        generationStatus: 'error',
        status: 'error',
      });
    }
  })();
}, [backendProjectId, d.title, id, replaceNode]);
```

- [ ] **Step 2: Run frontend build**

Run:

```bash
npm run build
```

Expected: build passes.

### Task 4: Update Drag And Paste To Insert First

**Files:**
- Modify: `src/flowCanvas/canvas/AiFlowCanvas.tsx`

- [ ] **Step 1: Change imports**

Replace:

```ts
import { prepareLocalImageNodeData, prepareUploadedImageNodeData } from '../utils/localImageUpload';
```

with:

```ts
import {
  createImmediateLocalImageNodeData,
  createLocalPreviewObjectUrl,
  measureLocalImageNodeData,
  uploadLocalImageAndBuildAssetNodeData,
} from '../utils/localImageUpload';
```

- [ ] **Step 2: Remove the pre-insertion measurement gate**

In `createUploadedImageNodes`, delete the `await Promise.all(sources.map(...getImportedImageSize...))` block. Use fallback image size for layout:

```ts
const fallbackSize = FLOW_NODE_DEFAULT_SIZES.image;
const cellWidth = fallbackSize.width;
const cellHeight = fallbackSize.height;
```

If `FLOW_NODE_DEFAULT_SIZES` is not imported in this file, import it from `../utils/nodeSizing` alongside existing sizing helpers.

- [ ] **Step 3: Insert local file nodes synchronously**

For local file sources, create immediate data before `addNode`:

```ts
const immediate = source.file
  ? createImmediateLocalImageNodeData({
      file: source.file,
      objectUrl: source.url,
      source: 'canvas-upload',
      title: source.title || '图片',
    }).nodeData
  : null;
```

Then pass `immediate` to `addNode` for file sources. Non-file sources may still use fallback dimensions and success state.

- [ ] **Step 4: Start per-node background measurement, local preview, and upload**

For each created file node, replace the current async block with the same three independent tasks:

```ts
let activePreviewUrl = source.url;
let uploadSucceeded = false;
let measuredNatural: { h: number; w: number } | null = null;

void (async () => {
  try {
    const measured = await measureLocalImageNodeData(source.url);
    measuredNatural =
      typeof measured.naturalWidth === 'number' && typeof measured.naturalHeight === 'number'
        ? { w: measured.naturalWidth, h: measured.naturalHeight }
        : null;
    useFlowCanvasStore.getState().updateNodeData(createdNode.id, measured);
  } catch {
    // Keep immediate preview.
  }
})();

void (async () => {
  try {
    const previewUrl = await createLocalPreviewObjectUrl(source.file!);
    if (previewUrl && !uploadSucceeded) {
      activePreviewUrl = previewUrl;
      useFlowCanvasStore.getState().updateNodeData(createdNode.id, {
        originalImageUrl: previewUrl,
        thumbnailUrl: previewUrl,
      });
    }
  } catch {
    // Keep source blob preview.
  }
})();

void (async () => {
  try {
    const uploaded = await uploadLocalImageAndBuildAssetNodeData({
      file: source.file!,
      natural: measuredNatural,
      projectId: backendProjectId,
      source: 'canvas-upload',
      title: source.title || '图片',
    });
    uploadSucceeded = true;
    useFlowCanvasStore.getState().updateNodeData(createdNode.id, {
      ...uploaded.nodeData,
      status: 'success',
      generationStatus: 'done',
    });
    if (source.url.startsWith('blob:')) URL.revokeObjectURL(source.url);
    if (activePreviewUrl !== source.url) URL.revokeObjectURL(activePreviewUrl);
  } catch (error) {
    useFlowCanvasStore.getState().updateNodeData(createdNode.id, {
      errorMessage: error instanceof Error ? error.message : '图片上传失败',
      generationStatus: 'error',
      status: 'error',
    });
  }
})();
```

- [ ] **Step 5: Run focused frontend validation**

Run:

```bash
npm run test -- src/flowCanvas/utils/localImageUpload.test.ts src/flowCanvas/store/flowCanvasStore.test.ts src/assets/assetApi.test.ts
npm run build
```

Expected: tests and build pass.

## Batch 2: Uploaded Asset Preview Variants

### Task 5: Move Variant Generation Into A Shared API Utility

**Files:**
- Modify: `apps/api/src/modules/assets/assets.service.ts`
- Test: `apps/api/test/assets.test.ts`

- [ ] **Step 1: Add image variant generation dependency to API package if needed**

The API currently does not depend on `sharp`. Prefer reusing the existing worker implementation only if package boundaries allow it cleanly. If TypeScript package boundaries make that awkward, add `sharp` to `apps/api/package.json` dependencies and commit the lockfile change generated by `npm install`.

Expected final dependency state:

```json
"sharp": "^0.34.3"
```

Use the version already present in the root lockfile if different.

- [ ] **Step 2: Add API-local variant generation helper**

At the top of `apps/api/src/modules/assets/assets.service.ts`, import `sharp`:

```ts
import sharp from 'sharp';
```

Add helper types/functions near the existing asset helpers:

```ts
type GeneratedUploadVariant = {
  body: Buffer;
  height: number | null;
  mimeType: 'image/webp';
  variantKey: 'thumb' | 'preview';
  width: number | null;
};

const UPLOAD_IMAGE_MIME_RE = /^image\/(png|jpe?g|webp)$/i;

async function buildUploadWebpVariant(
  body: Buffer,
  variantKey: 'thumb' | 'preview',
  size: number,
  quality: number,
): Promise<GeneratedUploadVariant> {
  const output = await sharp(body, { failOn: 'none' })
    .rotate()
    .resize({
      fit: 'inside',
      height: size,
      width: size,
      withoutEnlargement: true,
    })
    .webp({ effort: 4, quality })
    .toBuffer({ resolveWithObject: true });

  return {
    body: output.data,
    height: output.info.height ?? null,
    mimeType: 'image/webp',
    variantKey,
    width: output.info.width ?? null,
  };
}

async function createUploadImageVariants(input: {
  body: Buffer;
  mimeType: string;
}): Promise<GeneratedUploadVariant[]> {
  if (!UPLOAD_IMAGE_MIME_RE.test(input.mimeType)) return [];

  const [thumb, preview] = await Promise.all([
    buildUploadWebpVariant(input.body, 'thumb', 320, 72),
    buildUploadWebpVariant(input.body, 'preview', 1024, 78),
  ]);

  return [thumb, preview];
}
```

- [ ] **Step 3: Persist variants during API fallback upload**

In `uploadAssetBytes`, after `this.storageProvider.putObject(...)`, if the upload body is a `Buffer`, call a new private helper to create/store variants:

```ts
if (Buffer.isBuffer(input.body)) {
  await this.persistUploadedImageVariants(client, asset, input.body, input.contentType?.trim() || asset.mime_type);
}
```

Add a private method on `AssetsService`:

```ts
private async persistUploadedImageVariants(
  client: PoolClient,
  asset: AssetRecord,
  body: Buffer,
  mimeType: string,
): Promise<void> {
  const variants = await createUploadImageVariants({ body, mimeType });
  for (const variant of variants) {
    const variantObjectKey = buildAssetObjectKey({
      assetId: asset.id,
      filename: `${variant.variantKey}.webp`,
      tenantId: asset.tenant_id,
    });

    await this.storageProvider.putObject({
      body: variant.body,
      bucket: asset.bucket,
      contentType: variant.mimeType,
      key: variantObjectKey,
      metadata: {
        assetId: asset.id,
        source: 'user-upload',
        variantKey: variant.variantKey,
      },
    });

    await client.query(
      `
        INSERT INTO asset_variants (
          tenant_id,
          asset_id,
          variant_key,
          bucket,
          object_key,
          mime_type,
          width,
          height,
          size_bytes,
          metadata
        )
        VALUES (
          $1::uuid,
          $2::uuid,
          $3,
          $4,
          $5,
          $6,
          $7::int,
          $8::int,
          $9::bigint,
          $10::jsonb
        )
        ON CONFLICT (asset_id, variant_key) DO UPDATE SET
          bucket = EXCLUDED.bucket,
          object_key = EXCLUDED.object_key,
          mime_type = EXCLUDED.mime_type,
          width = EXCLUDED.width,
          height = EXCLUDED.height,
          size_bytes = EXCLUDED.size_bytes,
          metadata = EXCLUDED.metadata
      `,
      [
        asset.tenant_id,
        asset.id,
        variant.variantKey,
        asset.bucket,
        variantObjectKey,
        variant.mimeType,
        variant.width,
        variant.height,
        variant.body.byteLength,
        JSON.stringify({ source: 'user-upload' }),
      ],
    );
  }
}
```

Note: this covers the API fallback upload path. If direct-to-storage uploads are used successfully in production, add a follow-up worker job that creates variants after `complete-upload` because the API does not hold the original bytes in memory on that path.

- [ ] **Step 4: Add API test for fallback upload variants**

In `apps/api/test/assets.test.ts`, add a test near the existing upload-bytes tests. Use a small valid PNG or JPEG buffer. Assert that after `upload-bytes` and `complete-upload`, `download-url?variantKey=preview` succeeds.

Expected assertion shape:

```ts
expect(previewResponse.statusCode).toBe(200);
expect(previewResponse.json().variantKey).toBe('preview');
expect(previewResponse.json().url).toContain('preview.webp');
```

- [ ] **Step 5: Run API validation**

Run:

```bash
npm run test --workspace @aigc-flow/api -- apps/api/test/assets.test.ts
npm run build --workspace @aigc-flow/api
```

Expected: tests and API build pass.

## Batch 3: Full Verification, Record, Commit, Push

### Task 6: Browser-Level Manual Verification

**Files:**
- No code files unless defects are found.

- [ ] **Step 1: Start local services if available**

Run the normal local stack if local infra is available:

```bash
npm run dev:infra
npm run db:migrate
npm run dev:api
npm run dev:worker
npm run dev
```

Expected local URLs:

```txt
API: http://localhost:3366
Frontend: http://localhost:5188
```

- [ ] **Step 2: Verify UI behavior**

Manual acceptance checks:

- image node upload shows a preview immediately
- upload node converts to image immediately
- local drag onto canvas creates node immediately
- copied image paste creates node immediately
- upload failure keeps local preview visible and shows error state
- after upload success, refreshing project restores asset-backed image
- `/assets` shows uploaded image thumbnail quickly

### Task 7: Update Project Record

**Files:**
- Modify: `PROJECT_RECORD.md`

- [ ] **Step 1: Add dated progress record**

Add a 2026-06-11 entry containing:

```md
### 2026-06-11 - Upload Smooth Preview Pipeline Plan

- Root cause identified: upload entry points were waiting for image decode/measurement and sometimes duplicate local prep before first canvas paint.
- Execution plan added: `docs/superpowers/plans/2026-06-11-upload-smooth-preview-pipeline.md`.
- Target behavior: immediate local canvas preview, async local lightweight preview, background original upload, uploaded asset `thumb`/`preview` variants for fast refresh and `/assets` thumbnails.
```

After implementation, append exact commit hash and validation commands.

### Task 8: Final Validation And Git Push

**Files:**
- Stage only files changed for this task.

- [ ] **Step 1: Run required validation**

Run:

```bash
npm run test -- src/flowCanvas/utils/localImageUpload.test.ts src/flowCanvas/store/flowCanvasStore.test.ts src/assets/assetApi.test.ts
npm run test --workspace @aigc-flow/api -- apps/api/test/assets.test.ts
npm run build --workspace @aigc-flow/api
npm run build
```

Expected: all pass. If any fail due to unrelated existing dirty backend changes or missing local infra, record the exact failure.

- [ ] **Step 2: Inspect git status**

Run:

```bash
git status --short
```

Stage only:

```bash
git add src/flowCanvas/utils/localImageUpload.ts \
  src/flowCanvas/utils/localImageUpload.test.ts \
  src/flowCanvas/nodes/FlowNodes.tsx \
  src/flowCanvas/canvas/AiFlowCanvas.tsx \
  apps/api/src/modules/assets/assets.service.ts \
  apps/api/test/assets.test.ts \
  apps/api/package.json \
  package-lock.json \
  PROJECT_RECORD.md \
  docs/superpowers/plans/2026-06-11-upload-smooth-preview-pipeline.md
```

Only include `apps/api/package.json` and `package-lock.json` if Task 5 added or changed API dependencies.

- [ ] **Step 3: Commit**

Run:

```bash
git commit -m "feat: make image uploads preview immediately"
```

- [ ] **Step 4: Push**

Run:

```bash
git push origin main
```

Final response must include:

- commit hash
- branch
- changed files
- validation commands and results
- server update command block using `docker-compose.staging.yml`

## Server Deployment Commands After Merge

```bash
cd /opt/aittco/tapflow

git fetch --all --prune
git pull --ff-only origin main

docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml build

docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml stop tapflow-worker

docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml run --rm tapflow-api node packages/db/dist/cli.js

docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml up -d tapflow-redis tapflow-api tapflow-worker tapflow-frontend

docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml ps
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml logs --tail=100 tapflow-api tapflow-worker
```

## Production Notes

- The API fallback upload path can create variants immediately because the API receives bytes.
- If production direct S3 presigned uploads are successful and bypass `/upload-bytes`, the API does not have original bytes at `complete-upload`; add a small worker queue job to read the object from storage and generate variants after `complete-upload`.
- The frontend instant-preview changes still solve perceived click latency even before backend variants finish.
- Keep blob URLs out of authoritative persisted graph JSON; existing canonical graph sanitization should continue stripping `blob:`/`data:` URLs until asset upload succeeds.
