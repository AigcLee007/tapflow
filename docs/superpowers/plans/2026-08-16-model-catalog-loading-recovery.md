# Model Catalog Loading Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure stalled or disabled AI routes cannot leave Flow-node model menus loading indefinitely.

**Architecture:** Add an optional abort-backed deadline to the shared v2 HTTP client, then apply it only to model catalog reads. Video and text catalog hooks collect route lists independently so an unavailable model cannot block valid ones. Image catalog consumers retain only active server-backed models and skip route lookups for persisted model IDs that are no longer available.

**Tech Stack:** React, TypeScript, Vitest, Fetch API, AbortController.

---

### Task 1: Bound model catalog HTTP reads

**Files:**
- Modify: `src/services/v2HttpClient.ts`
- Modify: `src/services/v2AiModelCatalogApi.ts`
- Test: `src/services/v2AiModelCatalogApi.test.ts`

- [ ] **Step 1: Write the failing timeout test**

```ts
test('aborts a stalled model catalog request after the configured deadline', async () => {
  vi.useFakeTimers();
  fetchMock.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal.reason));
  }));

  const pending = listAiModelCatalog('video');
  await vi.advanceTimersByTimeAsync(8_000);

  await expect(pending).rejects.toThrow('Model catalog request timed out');
});
```

- [ ] **Step 2: Run the focused test and verify it fails because the deadline is not implemented**

Run: `npx vitest run src/services/v2AiModelCatalogApi.test.ts`

Expected: FAIL because the pending fetch never aborts.

- [ ] **Step 3: Add the minimum request deadline API and apply it to catalog calls**

```ts
type RequestOptions = {
  auth?: boolean;
  retryOnUnauthorized?: boolean;
  timeoutMs?: number;
};

export function listAiModelCatalog(modality?: string) {
  return apiGet<AiModelCatalogItem[]>(path, { timeoutMs: 8_000 });
}
```

- [ ] **Step 4: Re-run the focused timeout test**

Run: `npx vitest run src/services/v2AiModelCatalogApi.test.ts`

Expected: PASS.

### Task 2: Let video and text catalogs retain independently loaded models

**Files:**
- Modify: `src/flowCanvas/video/useVideoGenerationCatalog.ts`
- Modify: `src/flowCanvas/text/useTextGenerationCatalog.ts`
- Test: `src/flowCanvas/video/useVideoGenerationCatalog.test.tsx`
- Test: `src/flowCanvas/text/useTextGenerationCatalog.test.tsx`

- [ ] **Step 1: Write failing partial-result tests**

```ts
test('keeps video models whose route lookup succeeds when another lookup rejects', async () => {
  listAiModelRoutesMock
    .mockResolvedValueOnce([availableRoute])
    .mockRejectedValueOnce(new Error('Model catalog request timed out'));

  const { result } = renderHook(() => useVideoGenerationCatalog());
  await waitFor(() => expect(result.current.loading).toBe(false));

  expect(result.current.models).toEqual([availableVideoModel]);
});
```

- [ ] **Step 2: Run both focused suites and verify the new tests fail under all-or-nothing `Promise.all`**

Run: `npx vitest run src/flowCanvas/video/useVideoGenerationCatalog.test.tsx src/flowCanvas/text/useTextGenerationCatalog.test.tsx`

Expected: FAIL because a rejected route lookup rejects the whole catalog.

- [ ] **Step 3: Replace route aggregation with fulfilled-only entries**

```ts
const routeResults = await Promise.allSettled(
  applicable.map(async (model) => [model.modelKey, await listAiModelRoutes(model.modelKey)] as const),
);
const routesByModel = Object.fromEntries(
  routeResults.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []),
);
```

- [ ] **Step 4: Re-run the focused video and text suites**

Run: `npx vitest run src/flowCanvas/video/useVideoGenerationCatalog.test.tsx src/flowCanvas/text/useTextGenerationCatalog.test.tsx`

Expected: PASS.

### Task 3: Fail closed for unavailable image models

**Files:**
- Modify: `src/hooks/useImageModelCatalog.ts`
- Modify: `src/flowCanvas/nodes/FlowNodes.tsx`
- Test: `src/hooks/useImageModelCatalog.test.tsx`
- Test: `src/flowCanvas/nodes/FlowNodes.image-model-catalog.test.tsx`

- [ ] **Step 1: Write failing empty-catalog and stale-selection tests**

```ts
test('returns no image model options when the active v2 catalog is empty', async () => {
  listAiModelCatalogMock.mockResolvedValue([]);
  const { result } = renderHook(() => useImageModelCatalog());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.models).toEqual([]);
});

test('does not request routes for an image model removed from the active catalog', async () => {
  renderImageNode({ modelId: 'disabled-model' }, { activeModels: [] });
  await waitFor(() => expect(catalogLoaded()).toBe(true));
  expect(listAiModelRoutesMock).not.toHaveBeenCalledWith('disabled-model');
});
```

- [ ] **Step 2: Run the focused tests and verify that legacy fallback models and stale route requests fail them**

Run: `npx vitest run src/hooks/useImageModelCatalog.test.tsx src/flowCanvas/nodes/FlowNodes.image-model-catalog.test.tsx`

Expected: FAIL because fallback models are injected and stale IDs are requested.

- [ ] **Step 3: Keep only active server catalog models and guard route loading by active model IDs**

```ts
const mapped = mapCatalogModelsToOptions(items, []);
if (items.length === 0) return [];

const requestedModelKey = activeModelKeys.has(modelKey) ? modelKey : '';
```

- [ ] **Step 4: Re-run focused image catalog tests**

Run: `npx vitest run src/hooks/useImageModelCatalog.test.tsx src/flowCanvas/nodes/FlowNodes.image-model-catalog.test.tsx`

Expected: PASS.

### Task 4: Record and verify the recovery behavior

**Files:**
- Modify: `PROJECT_RECORD.md`
- Modify: all tests above if needed to cover explicit timeout/error/retry state

- [ ] **Step 1: Run all affected catalog suites**

Run: `npx vitest run src/services/v2AiModelCatalogApi.test.ts src/hooks/useImageModelCatalog.test.tsx src/flowCanvas/video/useVideoGenerationCatalog.test.tsx src/flowCanvas/text/useTextGenerationCatalog.test.tsx src/flowCanvas/nodes/FlowNodes.image-model-catalog.test.tsx`

Expected: PASS.

- [ ] **Step 2: Run the production frontend build**

Run: `npm run build`

Expected: exit code 0.

- [ ] **Step 3: Update the project record with the exact validation results**

```md
## 2026-08-16 - Model Catalog Loading Recovery

- Catalog reads have a bounded request deadline and settle into a retryable error.
- Video and text catalog assembly retains models with successful route lookups.
- Image nodes do not expose fallback models or request routes for disabled persisted models.
```

- [ ] **Step 4: Commit the implementation**

```bash
git add PROJECT_RECORD.md src/services/v2HttpClient.ts src/services/v2AiModelCatalogApi.ts src/services/v2AiModelCatalogApi.test.ts src/hooks/useImageModelCatalog.ts src/hooks/useImageModelCatalog.test.tsx src/flowCanvas/video/useVideoGenerationCatalog.ts src/flowCanvas/video/useVideoGenerationCatalog.test.tsx src/flowCanvas/text/useTextGenerationCatalog.ts src/flowCanvas/text/useTextGenerationCatalog.test.tsx src/flowCanvas/nodes/FlowNodes.tsx src/flowCanvas/nodes/FlowNodes.image-model-catalog.test.tsx
git commit -m "fix: recover model catalog loading"
```
