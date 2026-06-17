# Mobile Image Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a project-scoped image generation workbench that defaults on mobile, works well on desktop, and reuses the existing canvas workflow run, billing, draft, and asset pipeline.

**Architecture:** Add explicit project mode routes for workbench and canvas, then render a new workbench surface from the same `useRemoteFlowProject`, `useRemoteFlowAutosave`, `useFlowCanvasStore`, and `runBackendWorkflow` path used by the canvas. Workbench generation creates normal image nodes with workbench metadata, saves the shared draft, runs the target node, and derives batch cards from node data plus runtime output.

**Tech Stack:** Vite, React, TypeScript, Zustand, existing v2 project/flow/workflow APIs, existing AI model catalog utilities, existing shared menu components, Vitest, React Testing Library.

---

## File Structure

Create:

- `src/flowCanvas/workbench/ImageWorkbenchPage.tsx` - top-level workbench route surface; owns layout composition and project save status.
- `src/flowCanvas/workbench/ImageWorkbenchHeader.tsx` - project title and `Workbench / Canvas` segmented mode switch.
- `src/flowCanvas/workbench/ImageWorkbenchComposer.tsx` - desktop left panel and mobile bottom composer shell.
- `src/flowCanvas/workbench/ImageWorkbenchBatchFeed.tsx` - batch card feed derived from workbench image nodes.
- `src/flowCanvas/workbench/ImageWorkbenchResultSheet.tsx` - mobile result detail bottom sheet.
- `src/flowCanvas/workbench/imageWorkbenchTypes.ts` - local UI types for workbench draft, params, batches, and result items.
- `src/flowCanvas/workbench/imageWorkbenchUtils.ts` - pure helpers for device mode, route paths, node metadata, batch derivation, and default params.
- `src/flowCanvas/workbench/useImageWorkbenchGeneration.ts` - hook that creates image nodes, saves draft, and launches target-node runs.
- `src/flowCanvas/workbench/ImageWorkbenchPage.test.tsx`
- `src/flowCanvas/workbench/imageWorkbenchUtils.test.ts`
- `src/flowCanvas/workbench/useImageWorkbenchGeneration.test.tsx`

Modify:

- `src/app/routes.ts` - recognize explicit project subroutes and expose helpers.
- `src/app/AppRouter.tsx` - route `/projects/:projectId/workbench` and `/projects/:projectId/canvas`.
- `src/flowCanvas/FlowProjectPage.tsx` - route legacy `/projects/:projectId` to device default, route explicit canvas mode to existing canvas.
- `src/flowCanvas/types.ts` - add typed `workbench` metadata to `FlowNodeData`.
- `src/flowCanvas/nodes/NanoBananaParamPanel.tsx` - reuse existing panel in workbench only if responsive enough; otherwise wrap in composer container.
- `src/flowCanvas/nodes/GptImage2ParamPanel.tsx` - reuse existing panel in workbench only if responsive enough; otherwise wrap in composer container.
- `PROJECT_RECORD.md` - record the workbench implementation after meaningful progress.

Do not modify backend APIs for V1.

---

### Task 1: Route Helpers And Mode Detection

**Files:**
- Modify: `src/app/routes.ts`
- Test: create `src/flowCanvas/workbench/imageWorkbenchUtils.test.ts`
- Create: `src/flowCanvas/workbench/imageWorkbenchUtils.ts`

- [ ] **Step 1: Write route helper tests**

Add `src/flowCanvas/workbench/imageWorkbenchUtils.test.ts`:

```ts
import { describe, expect, test } from 'vitest';

import {
  getProjectCanvasPath,
  getProjectWorkbenchPath,
  getPreferredProjectMode,
  isMobileWorkbenchViewport,
  markWorkbenchNodeData,
} from './imageWorkbenchUtils';

describe('imageWorkbenchUtils routing', () => {
  test('builds explicit project mode paths', () => {
    expect(getProjectWorkbenchPath('project 1')).toBe('/projects/project%201/workbench');
    expect(getProjectCanvasPath('project 1')).toBe('/projects/project%201/canvas');
  });

  test('chooses workbench for mobile-like viewports', () => {
    expect(getPreferredProjectMode({ coarsePointer: true, width: 1024 })).toBe('workbench');
    expect(getPreferredProjectMode({ coarsePointer: false, width: 390 })).toBe('workbench');
    expect(getPreferredProjectMode({ coarsePointer: false, width: 1200 })).toBe('canvas');
  });

  test('detects mobile workbench viewport from browser capabilities', () => {
    expect(isMobileWorkbenchViewport({ coarsePointer: true, width: 1200 })).toBe(true);
    expect(isMobileWorkbenchViewport({ coarsePointer: false, width: 767 })).toBe(true);
    expect(isMobileWorkbenchViewport({ coarsePointer: false, width: 768 })).toBe(false);
  });

  test('adds stable workbench metadata to image node data', () => {
    const marked = markWorkbenchNodeData(
      { kind: 'image', title: 'Image' } as any,
      { batchId: 'batch-1', createdAt: 1780000000000 },
    );
    expect(marked.workbench).toEqual({
      batchId: 'batch-1',
      createdAt: 1780000000000,
      source: 'image-workbench',
    });
  });
});
```

- [ ] **Step 2: Run the failing route helper tests**

Run:

```bash
cmd /c npm test -- src/flowCanvas/workbench/imageWorkbenchUtils.test.ts
```

Expected: fail because `imageWorkbenchUtils.ts` does not exist.

- [ ] **Step 3: Implement workbench utility helpers**

Create `src/flowCanvas/workbench/imageWorkbenchUtils.ts`:

```ts
import type { FlowImageResultItem, FlowNodeData, FlowRuntimeNodeOutput } from '../types';

export type ProjectMode = 'canvas' | 'workbench';

export type ViewportProbe = {
  coarsePointer: boolean;
  width: number;
};

export type WorkbenchMetadata = {
  batchId: string;
  createdAt: number;
  source: 'image-workbench';
};

export function getProjectWorkbenchPath(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}/workbench`;
}

export function getProjectCanvasPath(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}/canvas`;
}

export function isMobileWorkbenchViewport(input: ViewportProbe): boolean {
  return input.coarsePointer || input.width < 768;
}

export function getPreferredProjectMode(input: ViewportProbe): ProjectMode {
  return isMobileWorkbenchViewport(input) ? 'workbench' : 'canvas';
}

export function markWorkbenchNodeData<T extends Partial<FlowNodeData>>(
  data: T,
  input: { batchId: string; createdAt: number },
): T & { workbench: WorkbenchMetadata } {
  return {
    ...data,
    workbench: {
      batchId: input.batchId,
      createdAt: input.createdAt,
      source: 'image-workbench',
    },
  };
}

export function isWorkbenchNodeData(data: Partial<FlowNodeData> | null | undefined): boolean {
  const metadata = data?.workbench as Partial<WorkbenchMetadata> | undefined;
  return metadata?.source === 'image-workbench' && typeof metadata.batchId === 'string';
}

export function getWorkbenchResultItems(input: {
  data: Partial<FlowNodeData>;
  runtimeOutput?: FlowRuntimeNodeOutput;
}): FlowImageResultItem[] {
  const generatedResults = Array.isArray(input.data.generatedResults)
    ? input.data.generatedResults.filter((item): item is FlowImageResultItem =>
        Boolean(item && typeof item.id === 'string' && typeof item.url === 'string'),
      )
    : [];
  if (generatedResults.length > 0) return generatedResults;

  const assets = Array.isArray(input.runtimeOutput?.assets) ? input.runtimeOutput.assets : [];
  return assets
    .filter((asset) => asset.kind === 'image' && asset.downloadUrl && asset.assetId)
    .map((asset) => ({
      createdAt: Date.now(),
      id: `asset:${asset.assetId}`,
      url: String(asset.downloadUrl),
    }));
}
```

- [ ] **Step 4: Add typed workbench metadata to node data**

Modify `src/flowCanvas/types.ts` by adding:

```ts
export interface FlowWorkbenchNodeMetadata {
  batchId: string;
  createdAt: number;
  source: 'image-workbench';
}
```

Then add to `FlowNodeData`:

```ts
workbench?: FlowWorkbenchNodeMetadata;
```

- [ ] **Step 5: Run utility tests**

Run:

```bash
cmd /c npm test -- src/flowCanvas/workbench/imageWorkbenchUtils.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit route helper foundation**

```bash
git add src/app/routes.ts src/flowCanvas/types.ts src/flowCanvas/workbench/imageWorkbenchUtils.ts src/flowCanvas/workbench/imageWorkbenchUtils.test.ts
git commit -m "feat: add image workbench route helpers"
```

---

### Task 2: Project Mode Routing

**Files:**
- Modify: `src/app/routes.ts`
- Modify: `src/app/AppRouter.tsx`
- Modify: `src/flowCanvas/FlowProjectPage.tsx`
- Test: `src/flowCanvas/workbench/ImageWorkbenchPage.test.tsx`

- [ ] **Step 1: Write routing behavior tests**

Create `src/flowCanvas/workbench/ImageWorkbenchPage.test.tsx`:

```tsx
import React from 'react';
import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { AppRouter } from '../../app/AppRouter';

vi.mock('../../auth/AuthGate', () => ({
  AuthGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../FlowCanvasPage', () => ({
  default: () => <div data-testid="canvas-mode">Canvas Mode</div>,
}));

vi.mock('../hooks/useRemoteFlowProject', () => ({
  useRemoteFlowProject: () => ({
    draft: {
      flowId: 'flow-1',
      graph: { edges: [], nodes: [], viewport: { x: 0, y: 0, zoom: 1 } },
      revision: 1,
      tenantId: 'tenant-1',
      updatedAt: new Date().toISOString(),
    },
    error: null,
    flow: { currentVersionId: null, id: 'flow-1' },
    loading: false,
    project: { id: 'project-1', name: 'Mobile Project' },
    reload: vi.fn(),
  }),
}));

vi.mock('../hooks/useRemoteFlowAutosave', () => ({
  useRemoteFlowAutosave: () => ({
    error: null,
    saveNow: vi.fn(),
    status: 'saved',
    updatedAt: new Date().toISOString(),
  }),
}));

vi.mock('../runtime/remoteDraftSaveBarrier', () => ({
  registerRemoteDraftSaveBarrier: vi.fn(),
}));

describe('project mode routing', () => {
  test('renders workbench for explicit workbench project route', async () => {
    window.history.replaceState(null, '', '/projects/project-1/workbench');

    render(<AppRouter />);

    expect(await screen.findByTestId('image-workbench-page')).toBeTruthy();
  });

  test('renders canvas for explicit canvas project route', async () => {
    window.history.replaceState(null, '', '/projects/project-1/canvas');

    render(<AppRouter />);

    expect(await screen.findByTestId('canvas-mode')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the failing routing tests**

Run:

```bash
cmd /c npm test -- src/flowCanvas/workbench/ImageWorkbenchPage.test.tsx
```

Expected: fail because `ImageWorkbenchPage` and explicit mode routing do not exist.

- [ ] **Step 3: Extend route helpers**

Modify `src/app/routes.ts`:

```ts
export function getProjectRouteParts(pathname: string): {
  mode: 'canvas' | 'workbench' | null;
  projectId: string | null;
} {
  if (!isProjectRoute(pathname)) return { mode: null, projectId: null };
  const parts = pathname.split('/').filter(Boolean);
  const projectId = parts[1] ? decodeURIComponent(parts[1]) : null;
  const rawMode = parts[2] ?? null;
  const mode = rawMode === 'canvas' || rawMode === 'workbench' ? rawMode : null;
  return { mode, projectId };
}

export function getProjectMode(pathname: string): 'canvas' | 'workbench' | null {
  return getProjectRouteParts(pathname).mode;
}
```

- [ ] **Step 4: Create minimal workbench page shell**

Create `src/flowCanvas/workbench/ImageWorkbenchPage.tsx`:

```tsx
import React from 'react';

export function ImageWorkbenchPage() {
  return (
    <main data-testid="image-workbench-page" className="min-h-screen bg-[#09090f] text-slate-100">
      Image Workbench
    </main>
  );
}
```

- [ ] **Step 5: Wire AppRouter explicit modes**

Modify `src/app/AppRouter.tsx` imports:

```ts
import { ImageWorkbenchPage } from "../flowCanvas/workbench/ImageWorkbenchPage";
import { getProjectMode } from "./routes";
```

Modify project route branch:

```tsx
if (isProjectRoute(pathname)) {
  const mode = getProjectMode(pathname);
  return mode === "workbench" ? <ImageWorkbenchPage /> : <FlowProjectPage />;
}
```

Modify final `AuthGate` project branch similarly:

```tsx
{isProjectRoute(pathname) ? (
  getProjectMode(pathname) === "workbench" ? <ImageWorkbenchPage /> : <FlowProjectPage />
) : (
  ...
)}
```

- [ ] **Step 6: Handle legacy `/projects/:projectId` device default**

Modify `src/flowCanvas/FlowProjectPage.tsx`:

```ts
import { getProjectCanvasPath, getProjectWorkbenchPath, getPreferredProjectMode } from "./workbench/imageWorkbenchUtils";
```

Add near the top of `FlowProjectPage`:

```ts
function isExplicitProjectModePath() {
  if (typeof window === "undefined") return true;
  return /\/projects\/[^/]+\/(?:canvas|workbench)$/.test(window.location.pathname);
}

function getViewportProbe() {
  if (typeof window === "undefined") return { coarsePointer: false, width: 1200 };
  return {
    coarsePointer: window.matchMedia?.("(hover: none) and (pointer: coarse)")?.matches ?? false,
    width: window.innerWidth,
  };
}
```

Inside `FlowProjectPage`, before loading states:

```tsx
useEffect(() => {
  if (!projectId || isExplicitProjectModePath()) return;
  const mode = getPreferredProjectMode(getViewportProbe());
  const nextPath = mode === "workbench" ? getProjectWorkbenchPath(projectId) : getProjectCanvasPath(projectId);
  window.history.replaceState(null, "", nextPath);
  window.dispatchEvent(new PopStateEvent("popstate"));
}, [projectId]);
```

- [ ] **Step 7: Run routing tests**

Run:

```bash
cmd /c npm test -- src/flowCanvas/workbench/ImageWorkbenchPage.test.tsx
```

Expected: pass.

- [ ] **Step 8: Commit routing**

```bash
git add src/app/routes.ts src/app/AppRouter.tsx src/flowCanvas/FlowProjectPage.tsx src/flowCanvas/workbench/ImageWorkbenchPage.tsx src/flowCanvas/workbench/ImageWorkbenchPage.test.tsx
git commit -m "feat: add project workbench routing"
```

---

### Task 3: Workbench Data Model And Batch Derivation

**Files:**
- Modify: `src/flowCanvas/workbench/imageWorkbenchTypes.ts`
- Modify: `src/flowCanvas/workbench/imageWorkbenchUtils.ts`
- Test: `src/flowCanvas/workbench/imageWorkbenchUtils.test.ts`

- [ ] **Step 1: Add failing batch derivation tests**

Append to `src/flowCanvas/workbench/imageWorkbenchUtils.test.ts`:

```ts
import { deriveWorkbenchBatches } from './imageWorkbenchUtils';

describe('deriveWorkbenchBatches', () => {
  test('creates batch cards from workbench image nodes newest first', () => {
    const nodes = [
      {
        id: 'node-old',
        type: 'image',
        data: markWorkbenchNodeData(
          {
            batchCount: 1,
            generationPrompt: 'old prompt',
            kind: 'image',
            modelId: 'gpt-image-2',
            params: { aspect_ratio: '1:1', size: '1K' },
            routeKey: 'image.gpt-image-2',
            status: 'success',
            title: 'Old',
          } as any,
          { batchId: 'batch-old', createdAt: 100 },
        ),
      },
      {
        id: 'node-new',
        type: 'image',
        data: markWorkbenchNodeData(
          {
            batchCount: 2,
            generatedResults: [{ createdAt: 200, id: 'r1', url: 'https://cdn.test/r1.png' }],
            generationPrompt: 'new prompt',
            kind: 'image',
            modelId: 'pixellelabs.nano-banana-pro',
            params: { aspect_ratio: '16:9', size: '2K' },
            routeKey: 'image.pixellelabs.nano-banana-pro',
            status: 'success',
            title: 'New',
          } as any,
          { batchId: 'batch-new', createdAt: 200 },
        ),
      },
    ] as any;

    const batches = deriveWorkbenchBatches({
      nodeOutputByNodeId: {},
      nodeRunStatusByNodeId: {},
      nodes,
      workflowRunIdByNodeId: {},
    });

    expect(batches.map((batch) => batch.batchId)).toEqual(['batch-new', 'batch-old']);
    expect(batches[0]).toMatchObject({
      aspectRatio: '16:9',
      batchCount: 2,
      modelId: 'pixellelabs.nano-banana-pro',
      prompt: 'new prompt',
      resultCount: 1,
      routeKey: 'image.pixellelabs.nano-banana-pro',
      size: '2K',
      status: 'success',
    });
  });
});
```

- [ ] **Step 2: Run failing batch derivation tests**

Run:

```bash
cmd /c npm test -- src/flowCanvas/workbench/imageWorkbenchUtils.test.ts
```

Expected: fail because `deriveWorkbenchBatches` is missing.

- [ ] **Step 3: Create workbench types**

Create `src/flowCanvas/workbench/imageWorkbenchTypes.ts`:

```ts
import type { FlowImageResultItem } from '../types';
import type { V2WorkflowRunStatus } from '../../services/v2WorkflowRunsApi';

export type WorkbenchBatchStatus = V2WorkflowRunStatus | 'idle' | 'success' | 'error';

export type ImageWorkbenchBatch = {
  aspectRatio: string;
  batchCount: number;
  batchId: string;
  createdAt: number;
  estimatedCredits: number | null;
  modelId: string;
  nodeId: string;
  prompt: string;
  resultCount: number;
  results: FlowImageResultItem[];
  routeKey: string;
  size: string;
  status: WorkbenchBatchStatus;
  workflowRunId: string | null;
};

export type ImageWorkbenchDraft = {
  aspectRatio: string;
  batchCount: number;
  modelId: string;
  outputFormat: 'jpeg' | 'png' | 'webp';
  prompt: string;
  quality: 'auto' | 'high' | 'low' | 'medium';
  referenceAssetItemIds: string[];
  routeKey: string;
  size: string;
};
```

- [ ] **Step 4: Implement batch derivation**

Append to `src/flowCanvas/workbench/imageWorkbenchUtils.ts`:

```ts
import type { Node } from '@xyflow/react';
import type { V2WorkflowRunStatus } from '../../services/v2WorkflowRunsApi';
import type { ImageWorkbenchBatch } from './imageWorkbenchTypes';

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readPositiveInteger(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

function getNodeWorkbenchMetadata(data: Partial<FlowNodeData>): WorkbenchMetadata | null {
  const metadata = data.workbench as Partial<WorkbenchMetadata> | undefined;
  if (metadata?.source !== 'image-workbench' || !metadata.batchId) return null;
  return {
    batchId: metadata.batchId,
    createdAt: typeof metadata.createdAt === 'number' ? metadata.createdAt : 0,
    source: 'image-workbench',
  };
}

export function deriveWorkbenchBatches(input: {
  nodeOutputByNodeId: Record<string, FlowRuntimeNodeOutput>;
  nodeRunStatusByNodeId: Record<string, V2WorkflowRunStatus>;
  nodes: Array<Node<FlowNodeData>>;
  workflowRunIdByNodeId: Record<string, string>;
}): ImageWorkbenchBatch[] {
  return input.nodes
    .filter((node) => node.type === 'image' || node.data.kind === 'image')
    .map((node) => {
      const metadata = getNodeWorkbenchMetadata(node.data);
      if (!metadata) return null;
      const params = node.data.params && typeof node.data.params === 'object'
        ? node.data.params as Record<string, unknown>
        : {};
      const results = getWorkbenchResultItems({
        data: node.data,
        runtimeOutput: input.nodeOutputByNodeId[node.id],
      });
      return {
        aspectRatio: readString(params.aspect_ratio) || readString(params.aspectRatio) || '1:1',
        batchCount: readPositiveInteger(node.data.batchCount),
        batchId: metadata.batchId,
        createdAt: metadata.createdAt,
        estimatedCredits: null,
        modelId: readString(node.data.modelId),
        nodeId: node.id,
        prompt: readString(node.data.generationPrompt),
        resultCount: results.length,
        results,
        routeKey: readString(node.data.routeKey),
        size: readString(params.size) || readString(params.imageSize) || '1K',
        status: input.nodeRunStatusByNodeId[node.id] || node.data.status || node.data.generationStatus || 'idle',
        workflowRunId: input.workflowRunIdByNodeId[node.id] || null,
      } satisfies ImageWorkbenchBatch;
    })
    .filter((batch): batch is ImageWorkbenchBatch => Boolean(batch))
    .sort((left, right) => right.createdAt - left.createdAt);
}
```

- [ ] **Step 5: Run utility tests**

Run:

```bash
cmd /c npm test -- src/flowCanvas/workbench/imageWorkbenchUtils.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit batch model**

```bash
git add src/flowCanvas/workbench/imageWorkbenchTypes.ts src/flowCanvas/workbench/imageWorkbenchUtils.ts src/flowCanvas/workbench/imageWorkbenchUtils.test.ts
git commit -m "feat: derive image workbench batches"
```

---

### Task 4: Workbench Header And Mode Switch

**Files:**
- Create: `src/flowCanvas/workbench/ImageWorkbenchHeader.tsx`
- Modify: `src/flowCanvas/workbench/ImageWorkbenchPage.tsx`
- Test: `src/flowCanvas/workbench/ImageWorkbenchPage.test.tsx`

- [ ] **Step 1: Add header test**

Append to `src/flowCanvas/workbench/ImageWorkbenchPage.test.tsx`:

```tsx
import userEvent from '@testing-library/user-event';

test('workbench header shows project title and mode switch', async () => {
  window.history.replaceState(null, '', '/projects/project-1/workbench');

  render(<AppRouter />);

  expect(await screen.findByText('Mobile Project')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Workbench' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Canvas' })).toBeTruthy();
});

test('mode switch navigates from workbench to canvas', async () => {
  window.history.replaceState(null, '', '/projects/project-1/workbench');
  const user = userEvent.setup();

  render(<AppRouter />);
  await user.click(await screen.findByRole('button', { name: 'Canvas' }));

  expect(window.location.pathname).toBe('/projects/project-1/canvas');
});
```

- [ ] **Step 2: Run failing header tests**

Run:

```bash
cmd /c npm test -- src/flowCanvas/workbench/ImageWorkbenchPage.test.tsx
```

Expected: fail because header does not exist.

- [ ] **Step 3: Implement header**

Create `src/flowCanvas/workbench/ImageWorkbenchHeader.tsx`:

```tsx
import React from 'react';

import { getProjectCanvasPath, getProjectWorkbenchPath, type ProjectMode } from './imageWorkbenchUtils';

type ImageWorkbenchHeaderProps = {
  mode: ProjectMode;
  projectId: string;
  projectName: string;
};

function navigate(path: string) {
  window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function ImageWorkbenchHeader({ mode, projectId, projectName }: ImageWorkbenchHeaderProps) {
  return (
    <header
      style={{
        alignItems: 'center',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        gap: 16,
        height: 58,
        justifyContent: 'space-between',
        padding: '0 18px',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ color: '#f8fafc', fontSize: 15, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {projectName}
        </div>
      </div>
      <div
        aria-label="Project mode"
        role="group"
        style={{
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 999,
          display: 'flex',
          padding: 3,
        }}
      >
        {([
          ['workbench', 'Workbench', getProjectWorkbenchPath(projectId)],
          ['canvas', 'Canvas', getProjectCanvasPath(projectId)],
        ] as const).map(([value, label, path]) => {
          const active = mode === value;
          return (
            <button
              key={value}
              aria-pressed={active}
              onClick={() => navigate(path)}
              style={{
                background: active ? '#f8fafc' : 'transparent',
                border: 'none',
                borderRadius: 999,
                color: active ? '#09090f' : '#cbd5e1',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 800,
                height: 32,
                padding: '0 13px',
              }}
              type="button"
            >
              {label}
            </button>
          );
        })}
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Use header in page**

Modify `src/flowCanvas/workbench/ImageWorkbenchPage.tsx`:

```tsx
import React from 'react';

import { ImageWorkbenchHeader } from './ImageWorkbenchHeader';

type ImageWorkbenchPageProps = {
  projectId?: string;
  projectName?: string;
};

export function ImageWorkbenchPage({ projectId = 'project-1', projectName = 'Project' }: ImageWorkbenchPageProps) {
  return (
    <main data-testid="image-workbench-page" className="min-h-screen bg-[#09090f] text-slate-100">
      <ImageWorkbenchHeader mode="workbench" projectId={projectId} projectName={projectName} />
    </main>
  );
}
```

Update `AppRouter.tsx` to pass `projectId` from `getProjectRouteParts(pathname)`. If project data is not loaded yet, pass decoded project id as fallback.

- [ ] **Step 5: Run header tests**

Run:

```bash
cmd /c npm test -- src/flowCanvas/workbench/ImageWorkbenchPage.test.tsx
```

Expected: pass.

- [ ] **Step 6: Commit header**

```bash
git add src/flowCanvas/workbench/ImageWorkbenchHeader.tsx src/flowCanvas/workbench/ImageWorkbenchPage.tsx src/flowCanvas/workbench/ImageWorkbenchPage.test.tsx src/app/AppRouter.tsx
git commit -m "feat: add workbench mode header"
```

---

### Task 5: Desktop And Mobile Workbench Layout Shell

**Files:**
- Modify: `src/flowCanvas/workbench/ImageWorkbenchPage.tsx`
- Create: `src/flowCanvas/workbench/ImageWorkbenchComposer.tsx`
- Create: `src/flowCanvas/workbench/ImageWorkbenchBatchFeed.tsx`
- Test: `src/flowCanvas/workbench/ImageWorkbenchPage.test.tsx`

- [ ] **Step 1: Add layout tests**

Append:

```tsx
test('workbench renders composer and batch feed regions', async () => {
  window.history.replaceState(null, '', '/projects/project-1/workbench');

  render(<AppRouter />);

  expect(await screen.findByTestId('image-workbench-composer')).toBeTruthy();
  expect(screen.getByTestId('image-workbench-batch-feed')).toBeTruthy();
});
```

- [ ] **Step 2: Run failing layout tests**

Run:

```bash
cmd /c npm test -- src/flowCanvas/workbench/ImageWorkbenchPage.test.tsx
```

Expected: fail because composer and feed are missing.

- [ ] **Step 3: Implement composer shell**

Create `src/flowCanvas/workbench/ImageWorkbenchComposer.tsx`:

```tsx
import React from 'react';

import type { ImageWorkbenchDraft } from './imageWorkbenchTypes';

type ImageWorkbenchComposerProps = {
  draft: ImageWorkbenchDraft;
  isGenerating: boolean;
  onChangeDraft: (patch: Partial<ImageWorkbenchDraft>) => void;
  onGenerate: () => void;
};

export function ImageWorkbenchComposer({
  draft,
  isGenerating,
  onChangeDraft,
  onGenerate,
}: ImageWorkbenchComposerProps) {
  return (
    <section
      data-testid="image-workbench-composer"
      style={{
        background: 'rgba(18,18,24,0.96)',
        borderRight: '1px solid rgba(255,255,255,0.08)',
        display: 'grid',
        gap: 14,
        gridTemplateRows: 'auto auto 1fr auto',
        padding: 18,
      }}
    >
      <div style={{ color: '#94a3b8', fontSize: 12, fontWeight: 800, textTransform: 'uppercase' }}>Reference</div>
      <div style={{ minHeight: 58, border: '1px dashed rgba(255,255,255,0.16)', borderRadius: 14 }} />
      <textarea
        aria-label="Prompt"
        onChange={(event) => onChangeDraft({ prompt: event.target.value })}
        placeholder="Describe the image you want to create"
        style={{
          background: 'rgba(255,255,255,0.045)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 16,
          color: '#f8fafc',
          minHeight: 150,
          outline: 'none',
          padding: 14,
          resize: 'vertical',
        }}
        value={draft.prompt}
      />
      <button
        disabled={isGenerating || !draft.prompt.trim()}
        onClick={onGenerate}
        style={{
          background: isGenerating ? 'rgba(255,255,255,0.12)' : '#6366f1',
          border: 'none',
          borderRadius: 999,
          color: '#fff',
          cursor: isGenerating ? 'not-allowed' : 'pointer',
          fontSize: 14,
          fontWeight: 900,
          height: 46,
        }}
        type="button"
      >
        {isGenerating ? 'Generating...' : 'Generate'}
      </button>
    </section>
  );
}
```

- [ ] **Step 4: Implement batch feed shell**

Create `src/flowCanvas/workbench/ImageWorkbenchBatchFeed.tsx`:

```tsx
import React from 'react';

import type { ImageWorkbenchBatch } from './imageWorkbenchTypes';

type ImageWorkbenchBatchFeedProps = {
  batches: ImageWorkbenchBatch[];
};

export function ImageWorkbenchBatchFeed({ batches }: ImageWorkbenchBatchFeedProps) {
  return (
    <section
      data-testid="image-workbench-batch-feed"
      style={{
        minHeight: 0,
        overflowY: 'auto',
        padding: 22,
      }}
    >
      {batches.length === 0 ? (
        <div style={{ color: '#94a3b8', display: 'grid', minHeight: 360, placeItems: 'center' }}>
          Start by describing an image.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {batches.map((batch) => (
            <article
              key={batch.batchId}
              style={{
                background: 'rgba(255,255,255,0.045)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 18,
                padding: 14,
              }}
            >
              <div style={{ color: '#f8fafc', fontSize: 14, fontWeight: 800 }}>{batch.prompt || 'Untitled prompt'}</div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Compose layout in page**

Modify `ImageWorkbenchPage.tsx` so the page body uses desktop grid and mobile CSS:

```tsx
const [draft, setDraft] = React.useState<ImageWorkbenchDraft>({
  aspectRatio: '1:1',
  batchCount: 1,
  modelId: 'pixellelabs.nano-banana-pro',
  outputFormat: 'png',
  prompt: '',
  quality: 'auto',
  referenceAssetItemIds: [],
  routeKey: 'image.pixellelabs.nano-banana-pro',
  size: '1K',
});
```

Render:

```tsx
<div
  style={{
    display: 'grid',
    gridTemplateColumns: 'minmax(360px, 400px) minmax(0, 1fr)',
    height: 'calc(100vh - 58px)',
    minHeight: 0,
  }}
>
  <ImageWorkbenchComposer ... />
  <ImageWorkbenchBatchFeed batches={[]} />
</div>
```

Add CSS media query in a local `<style>` tag or CSS module-equivalent class:

```css
@media (max-width: 767px) {
  .image-workbench-layout {
    display: block;
    height: calc(100vh - 58px);
    overflow: hidden;
  }
  .image-workbench-layout [data-testid="image-workbench-composer"] {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 40;
    border-radius: 22px 22px 0 0;
    border-right: none;
    border-top: 1px solid rgba(255,255,255,0.1);
  }
  .image-workbench-layout [data-testid="image-workbench-batch-feed"] {
    height: 100%;
    padding-bottom: 260px;
  }
}
```

- [ ] **Step 6: Run layout tests**

Run:

```bash
cmd /c npm test -- src/flowCanvas/workbench/ImageWorkbenchPage.test.tsx
```

Expected: pass.

- [ ] **Step 7: Commit layout shell**

```bash
git add src/flowCanvas/workbench/ImageWorkbenchPage.tsx src/flowCanvas/workbench/ImageWorkbenchComposer.tsx src/flowCanvas/workbench/ImageWorkbenchBatchFeed.tsx src/flowCanvas/workbench/ImageWorkbenchPage.test.tsx
git commit -m "feat: add image workbench layout shell"
```

---

### Task 6: Model, Route, Parameter, And Quantity Controls

**Files:**
- Modify: `src/flowCanvas/workbench/ImageWorkbenchComposer.tsx`
- Modify: `src/flowCanvas/workbench/imageWorkbenchUtils.ts`
- Test: `src/flowCanvas/workbench/ImageWorkbenchPage.test.tsx`

- [ ] **Step 1: Add composer control tests**

Append:

```tsx
test('composer exposes core generation controls', async () => {
  window.history.replaceState(null, '', '/projects/project-1/workbench');

  render(<AppRouter />);

  expect(await screen.findByLabelText('Prompt')).toBeTruthy();
  expect(screen.getByLabelText('Model')).toBeTruthy();
  expect(screen.getByLabelText('Route')).toBeTruthy();
  expect(screen.getByLabelText('Aspect ratio')).toBeTruthy();
  expect(screen.getByLabelText('Size')).toBeTruthy();
  expect(screen.getByLabelText('Quantity')).toBeTruthy();
  expect(screen.getByText('Advanced')).toBeTruthy();
});
```

- [ ] **Step 2: Run failing controls test**

Run:

```bash
cmd /c npm test -- src/flowCanvas/workbench/ImageWorkbenchPage.test.tsx
```

Expected: fail because controls are missing.

- [ ] **Step 3: Add default model option helpers**

Append to `imageWorkbenchUtils.ts`:

```ts
export const WORKBENCH_DEFAULT_MODEL_OPTIONS = [
  { id: 'pixellelabs.nano-banana-pro', label: 'Nano Banana Pro', routeKey: 'image.pixellelabs.nano-banana-pro' },
  { id: 'pixellelabs.nano-banana-2', label: 'Nano Banana 2', routeKey: 'image.pixellelabs.nano-banana-2' },
  { id: 'gpt-image-2', label: 'GPT-Image-2', routeKey: 'image.gpt-image-2' },
] as const;

export const WORKBENCH_ASPECT_RATIOS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];
export const WORKBENCH_SIZE_OPTIONS = ['1K', '2K', '4K'];
```

- [ ] **Step 4: Implement core controls**

Add imports in `ImageWorkbenchComposer.tsx`:

```ts
import { WORKBENCH_ASPECT_RATIOS, WORKBENCH_DEFAULT_MODEL_OPTIONS, WORKBENCH_SIZE_OPTIONS } from './imageWorkbenchUtils';
```

Add labelled controls below prompt:

```tsx
<label>
  <span>Model</span>
  <select
    aria-label="Model"
    value={draft.modelId}
    onChange={(event) => {
      const model = WORKBENCH_DEFAULT_MODEL_OPTIONS.find((item) => item.id === event.target.value);
      onChangeDraft({
        modelId: event.target.value,
        routeKey: model?.routeKey ?? draft.routeKey,
      });
    }}
  >
    {WORKBENCH_DEFAULT_MODEL_OPTIONS.map((model) => (
      <option key={model.id} value={model.id}>{model.label}</option>
    ))}
  </select>
</label>
<label>
  <span>Route</span>
  <select aria-label="Route" value={draft.routeKey} onChange={(event) => onChangeDraft({ routeKey: event.target.value })}>
    {WORKBENCH_DEFAULT_MODEL_OPTIONS.map((model) => (
      <option key={model.routeKey} value={model.routeKey}>{model.label} Line 1</option>
    ))}
  </select>
</label>
<label>
  <span>Aspect ratio</span>
  <select aria-label="Aspect ratio" value={draft.aspectRatio} onChange={(event) => onChangeDraft({ aspectRatio: event.target.value })}>
    {WORKBENCH_ASPECT_RATIOS.map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}
  </select>
</label>
<label>
  <span>Size</span>
  <select aria-label="Size" value={draft.size} onChange={(event) => onChangeDraft({ size: event.target.value })}>
    {WORKBENCH_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}
  </select>
</label>
<label>
  <span>Quantity</span>
  <select aria-label="Quantity" value={draft.batchCount} onChange={(event) => onChangeDraft({ batchCount: Number(event.target.value) })}>
    {[1, 2, 3, 4].map((count) => <option key={count} value={count}>{count}</option>)}
  </select>
</label>
<details>
  <summary>Advanced</summary>
  <div>Output format: {draft.outputFormat.toUpperCase()}</div>
</details>
```

Style native selects temporarily to match dark surfaces. In a later polish task, replace native selects with shared `MenuSelect`.

- [ ] **Step 5: Run controls test**

Run:

```bash
cmd /c npm test -- src/flowCanvas/workbench/ImageWorkbenchPage.test.tsx
```

Expected: pass.

- [ ] **Step 6: Commit controls**

```bash
git add src/flowCanvas/workbench/ImageWorkbenchComposer.tsx src/flowCanvas/workbench/imageWorkbenchUtils.ts src/flowCanvas/workbench/ImageWorkbenchPage.test.tsx
git commit -m "feat: add workbench generation controls"
```

---

### Task 7: Workbench Generation Hook

**Files:**
- Create: `src/flowCanvas/workbench/useImageWorkbenchGeneration.ts`
- Test: `src/flowCanvas/workbench/useImageWorkbenchGeneration.test.tsx`
- Modify: `src/flowCanvas/workbench/ImageWorkbenchPage.tsx`

- [ ] **Step 1: Write generation hook test**

Create `src/flowCanvas/workbench/useImageWorkbenchGeneration.test.tsx`:

```tsx
import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { useFlowCanvasStore } from '../store/flowCanvasStore';
import { useImageWorkbenchGeneration } from './useImageWorkbenchGeneration';

const runBackendWorkflowMock = vi.fn();

vi.mock('../runtime/v2WorkflowRunner', () => ({
  runBackendWorkflow: (...args: unknown[]) => runBackendWorkflowMock(...args),
}));

describe('useImageWorkbenchGeneration', () => {
  beforeEach(() => {
    runBackendWorkflowMock.mockReset();
    useFlowCanvasStore.getState().newProject();
    useFlowCanvasStore.getState().setBackendFlowBinding({
      backendFlowId: 'flow-1',
      backendProjectId: 'project-1',
    });
  });

  test('creates a workbench image node and runs it as target node', async () => {
    const saveNow = vi.fn(async () => undefined);
    const { result } = renderHook(() => useImageWorkbenchGeneration({ saveNow }));

    await act(async () => {
      await result.current.generate({
        aspectRatio: '16:9',
        batchCount: 2,
        modelId: 'pixellelabs.nano-banana-pro',
        outputFormat: 'png',
        prompt: 'A neon product photo',
        quality: 'auto',
        referenceAssetItemIds: [],
        routeKey: 'image.pixellelabs.nano-banana-pro',
        size: '2K',
      });
    });

    const node = useFlowCanvasStore.getState().nodes.find((item) => item.type === 'image');
    expect(node?.data).toMatchObject({
      batchCount: 2,
      generationPrompt: 'A neon product photo',
      modelId: 'pixellelabs.nano-banana-pro',
      routeKey: 'image.pixellelabs.nano-banana-pro',
      workbench: { source: 'image-workbench' },
    });
    expect(saveNow).toHaveBeenCalledTimes(1);
    expect(runBackendWorkflowMock).toHaveBeenCalledWith({ runMode: 'target_node', targetNodeId: node?.id });
  });
});
```

- [ ] **Step 2: Run failing hook test**

Run:

```bash
cmd /c npm test -- src/flowCanvas/workbench/useImageWorkbenchGeneration.test.tsx
```

Expected: fail because hook does not exist.

- [ ] **Step 3: Implement generation hook**

Create `src/flowCanvas/workbench/useImageWorkbenchGeneration.ts`:

```ts
import { useCallback, useState } from 'react';
import { nanoid } from 'nanoid';

import { runBackendWorkflow } from '../runtime/v2WorkflowRunner';
import { useFlowCanvasStore } from '../store/flowCanvasStore';
import type { ImageWorkbenchDraft } from './imageWorkbenchTypes';
import { markWorkbenchNodeData } from './imageWorkbenchUtils';

type UseImageWorkbenchGenerationInput = {
  saveNow: () => Promise<void>;
};

export function useImageWorkbenchGeneration({ saveNow }: UseImageWorkbenchGenerationInput) {
  const addNode = useFlowCanvasStore((state) => state.addNode);
  const nodes = useFlowCanvasStore((state) => state.nodes);
  const [isGenerating, setIsGenerating] = useState(false);

  const generate = useCallback(async (draft: ImageWorkbenchDraft) => {
    const prompt = draft.prompt.trim();
    if (!prompt || isGenerating) return null;

    setIsGenerating(true);
    try {
      const createdAt = Date.now();
      const batchId = nanoid(12);
      const node = addNode(
        'image',
        { x: nodes.length * 36, y: nodes.length * 36 },
        markWorkbenchNodeData(
          {
            batchCount: draft.batchCount,
            generationPrompt: prompt,
            modelId: draft.modelId,
            multiImageDisplayMode: draft.batchCount > 1 ? 'combined' : undefined,
            params: {
              aspect_ratio: draft.aspectRatio,
              image_size: draft.size,
              moderation: 'auto',
              output_format: draft.outputFormat,
              quality: draft.quality,
              size: draft.size,
            },
            referenceAssetItemIds: draft.referenceAssetItemIds,
            routeKey: draft.routeKey,
            status: 'pending',
            title: prompt.slice(0, 36) || 'Workbench image',
          },
          { batchId, createdAt },
        ),
        { selected: false },
      );

      await saveNow();
      await runBackendWorkflow({ runMode: 'target_node', targetNodeId: node.id });
      return node.id;
    } finally {
      setIsGenerating(false);
    }
  }, [addNode, isGenerating, nodes.length, saveNow]);

  return { generate, isGenerating };
}
```

- [ ] **Step 4: Wire hook into page**

In `ImageWorkbenchPage.tsx`, import and call:

```ts
const generation = useImageWorkbenchGeneration({ saveNow: autosave.saveNow });
```

Pass to composer:

```tsx
isGenerating={generation.isGenerating}
onGenerate={() => void generation.generate(draft)}
```

- [ ] **Step 5: Run hook test**

Run:

```bash
cmd /c npm test -- src/flowCanvas/workbench/useImageWorkbenchGeneration.test.tsx
```

Expected: pass.

- [ ] **Step 6: Commit generation hook**

```bash
git add src/flowCanvas/workbench/useImageWorkbenchGeneration.ts src/flowCanvas/workbench/useImageWorkbenchGeneration.test.tsx src/flowCanvas/workbench/ImageWorkbenchPage.tsx
git commit -m "feat: run image generation from workbench"
```

---

### Task 8: Batch Feed Rendering And Result Sheet

**Files:**
- Modify: `src/flowCanvas/workbench/ImageWorkbenchBatchFeed.tsx`
- Create: `src/flowCanvas/workbench/ImageWorkbenchResultSheet.tsx`
- Modify: `src/flowCanvas/workbench/ImageWorkbenchPage.tsx`
- Test: `src/flowCanvas/workbench/ImageWorkbenchPage.test.tsx`

- [ ] **Step 1: Add result rendering test**

Append:

```tsx
test('batch feed renders generated result images', async () => {
  window.history.replaceState(null, '', '/projects/project-1/workbench');

  render(<AppRouter />);

  expect(await screen.findByTestId('image-workbench-batch-feed')).toBeTruthy();
});
```

This is initially a smoke test. Add richer feed tests in `imageWorkbenchUtils.test.ts` where derived batches are deterministic.

- [ ] **Step 2: Implement result sheet**

Create `src/flowCanvas/workbench/ImageWorkbenchResultSheet.tsx`:

```tsx
import React from 'react';

import type { FlowImageResultItem } from '../types';

type ImageWorkbenchResultSheetProps = {
  item: FlowImageResultItem | null;
  onClose: () => void;
  onUseAsReference: (item: FlowImageResultItem) => void;
};

export function ImageWorkbenchResultSheet({ item, onClose, onUseAsReference }: ImageWorkbenchResultSheetProps) {
  if (!item) return null;
  return (
    <div
      data-testid="image-workbench-result-sheet"
      style={{
        background: 'rgba(9,9,15,0.96)',
        borderTop: '1px solid rgba(255,255,255,0.12)',
        borderRadius: '22px 22px 0 0',
        bottom: 0,
        boxShadow: '0 -18px 60px rgba(0,0,0,0.45)',
        left: 0,
        padding: 16,
        position: 'fixed',
        right: 0,
        zIndex: 80,
      }}
    >
      <img alt="" src={item.url} style={{ borderRadius: 14, maxHeight: 320, objectFit: 'contain', width: '100%' }} />
      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <button type="button" onClick={() => onUseAsReference(item)}>Use as reference</button>
        <a href={item.url} download>Download</a>
        <button type="button" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Upgrade batch feed cards**

Modify `ImageWorkbenchBatchFeed.tsx` result card rendering:

```tsx
{batch.results.length > 0 ? (
  <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', marginTop: 12 }}>
    {batch.results.map((result) => (
      <button key={result.id} onClick={() => onSelectResult?.(result)} style={{ border: 'none', padding: 0, background: 'transparent' }} type="button">
        <img alt="" src={result.url} style={{ borderRadius: 14, display: 'block', width: '100%' }} />
      </button>
    ))}
  </div>
) : (
  <div style={{ color: '#94a3b8', marginTop: 12 }}>{batch.status}</div>
)}
```

Update props with:

```ts
onSelectResult?: (item: FlowImageResultItem) => void;
```

- [ ] **Step 4: Wire selected result state**

In `ImageWorkbenchPage.tsx`, add:

```ts
const [selectedResult, setSelectedResult] = React.useState<FlowImageResultItem | null>(null);
```

Render sheet:

```tsx
<ImageWorkbenchResultSheet
  item={selectedResult}
  onClose={() => setSelectedResult(null)}
  onUseAsReference={() => setSelectedResult(null)}
/>
```

- [ ] **Step 5: Run page tests**

Run:

```bash
cmd /c npm test -- src/flowCanvas/workbench/ImageWorkbenchPage.test.tsx
```

Expected: pass.

- [ ] **Step 6: Commit feed and sheet**

```bash
git add src/flowCanvas/workbench/ImageWorkbenchBatchFeed.tsx src/flowCanvas/workbench/ImageWorkbenchResultSheet.tsx src/flowCanvas/workbench/ImageWorkbenchPage.tsx src/flowCanvas/workbench/ImageWorkbenchPage.test.tsx
git commit -m "feat: render workbench image results"
```

---

### Task 9: Final Integration, Polish, And Verification

**Files:**
- Modify: `PROJECT_RECORD.md`
- Modify: workbench files from previous tasks as needed

- [ ] **Step 1: Replace temporary native selects with shared menu controls where practical**

Inspect:

```txt
src/components/menu/MenuSelect.tsx
src/components/menu/MenuSurface.tsx
src/components/menu/menuStyles.ts
```

Replace workbench native `<select>` controls with shared `MenuSelect` when it can be done without adding new menu behavior. Keep labels accessible.

- [ ] **Step 2: Check mobile layout manually with browser devtools or Playwright**

Run local frontend:

```bash
cmd /c npm run dev -- --host 127.0.0.1 --port 5188 --strictPort
```

Open:

```txt
http://127.0.0.1:5188/projects/<existing-project-id>/workbench
```

Check:

- Desktop width `1440px`: left composer fixed, feed scrolls.
- Mobile width `390px`: bottom composer sits in thumb zone and feed has bottom padding.
- No menu overlaps.
- Text fits inside buttons.

- [ ] **Step 3: Run focused tests**

```bash
cmd /c npm test -- src/flowCanvas/workbench/imageWorkbenchUtils.test.ts src/flowCanvas/workbench/ImageWorkbenchPage.test.tsx src/flowCanvas/workbench/useImageWorkbenchGeneration.test.tsx
```

Expected: all focused tests pass.

- [ ] **Step 4: Run full frontend build**

```bash
cmd /c npm run build
```

Expected: build passes. Existing chunk-size warnings are acceptable.

- [ ] **Step 5: Update project record**

Add an entry to `PROJECT_RECORD.md` current status snapshot:

```md
- Project image workbench V1 is implemented as a project-scoped dual mode with desktop left-panel workflow, mobile bottom composer, shared flow draft persistence, target-node workflow execution, and asset-backed generated results.
```

- [ ] **Step 6: Commit final polish**

```bash
git add PROJECT_RECORD.md src/app/routes.ts src/app/AppRouter.tsx src/flowCanvas/FlowProjectPage.tsx src/flowCanvas/types.ts src/flowCanvas/workbench
git commit -m "feat: add mobile image workbench"
```

---

## Self-Review

Spec coverage:

- Project workbench route and mode switch: Tasks 1, 2, 4.
- Mobile default to workbench: Task 2.
- Desktop two-column layout: Task 5.
- Mobile bottom composer: Task 5.
- Text-to-image generation: Task 7.
- Model/route/core params/advanced section: Task 6.
- Reference image strip UI: Task 5 shell, Task 8 use-as-reference entry, future enhancement for asset picker.
- Batch feed: Tasks 3, 5, 8.
- Result image detail bottom sheet on mobile: Task 8.
- Same backend generation and asset persistence path as canvas: Task 7.
- Shared menu styling: Task 9.

Known V1 limitation:

- The first implementation plan includes reference cards and "use as reference" plumbing but does not implement a full cloud asset picker drawer. This is consistent with V1 excluding heavier asset management workflows; it should be added as a follow-up task after the main generation loop works.

Placeholder scan:

- No `TODO`, `TBD`, or vague implementation gaps are required for V1.

Type consistency:

- `ImageWorkbenchDraft`, `ImageWorkbenchBatch`, and `FlowWorkbenchNodeMetadata` names are used consistently across tasks.
