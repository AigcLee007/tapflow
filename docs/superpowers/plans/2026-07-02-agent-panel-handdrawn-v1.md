# Agent Panel Handdrawn V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the TapFlow Agent panel into the hand-drawn right-side workspace, with prompt-first chat, uploaded reference images, inline result cards, and a safe `refId` to `assetId` execution path.

**Architecture:** Keep the v2 Agent session, event replay, asset library, workflow, billing, and AI Gateway paths as the source of truth. Add a structured reference context that flows from the frontend composer to backend executor and tool runner, then redesign the existing React Agent panel around the sketch without introducing browser-local authoritative storage.

**Tech Stack:** React 19, Vite, Vitest, lucide-react, existing TapFlow v2 HTTP clients, Fastify API, Postgres via `@aigc-flow/db`, existing Agent executor/tool-runner/workflow launcher modules.

---

## Scope Check

This plan implements the approved Phase 1 scope from `D:\tapnow-flow\docs\superpowers\specs\2026-07-02-agent-panel-handdrawn-v1-design.md`.

Phase 1 includes the docked right Agent panel, top icon toolbar, central chat stream, bottom prompt-first composer, upload-reference-image flow, structured reference context, deterministic backend reference resolution, inline result cards, focused tests, and documentation updates.

Phase 1 does not include branch editing, edit-prior-round regeneration, web search, MCP/local Agent as the primary path, a new model provider admin system, or local browser storage as authoritative data.

## File Map

### Frontend Reference Context And API

- Create: `D:\tapnow-flow\src\flowCanvas\agent\agentReferenceContext.ts`
  - Owns frontend reference-context types and builders.
  - Converts selected canvas nodes, continuation assets, and uploaded references into turn-safe context items.
- Modify: `D:\tapnow-flow\src\flowCanvas\agent\CanvasAgentWorkspaceTypes.ts`
  - Keeps `AgentReferenceChip` for UI, but makes `assetId` and `refId` required when a chip is sent.
- Modify: `D:\tapnow-flow\src\flowCanvas\agent\canvasAgentApi.ts`
  - Adds `referenceContext` to `createAgentTurn`, `openAgentTurnStream`, and `executeAgentTurnStream` inputs.
- Test: `D:\tapnow-flow\src\flowCanvas\agent\canvasAgentApi.test.ts`
  - Verifies reference context is serialized in stream and non-stream turn payloads.

### Frontend Upload And Composer

- Create: `D:\tapnow-flow\src\flowCanvas\agent\CanvasAgentReferenceUploadButton.tsx`
  - Owns image-only file selection, v2 asset upload, upload state, and upload chip creation.
- Create: `D:\tapnow-flow\src\flowCanvas\agent\CanvasAgentReferenceUploadButton.test.tsx`
  - Verifies image filtering, upload success, upload failure, and disabled state.
- Modify: `D:\tapnow-flow\src\flowCanvas\agent\CanvasAgentComposer.tsx`
  - Rebuilds bottom composer as prompt-first UI with reference strip, plus upload button, compact settings row, and send button.
- Modify: `D:\tapnow-flow\src\flowCanvas\agent\CanvasAgentReferenceChips.tsx`
  - Adds thumbnail support and remove action for uploaded current-turn references.
- Test: `D:\tapnow-flow\src\flowCanvas\agent\CanvasAgentComposer.test.tsx`
  - Verifies composer layout, upload button presence, reference strip position, and disabled states.

### Frontend Panel And Visual Shell

- Modify: `D:\tapnow-flow\src\flowCanvas\agent\CanvasAgentWorkspaceShell.tsx`
  - Reorders top toolbar to logs, chat, history, new chat, collapse.
  - Removes `connections` from the primary Phase 1 toolbar.
- Modify: `D:\tapnow-flow\src\flowCanvas\agent\CanvasAgentPanel.tsx`
  - Owns current-turn uploaded references and builds `referenceContext` before sending.
  - Clears uploaded references on new chat and successful turn submission.
- Modify: `D:\tapnow-flow\src\flowCanvas\agent\CanvasAgentConversationView.tsx`
  - Keeps central chat stream as the default surface.
- Modify: `D:\tapnow-flow\src\flowCanvas\agent\CanvasAgentTimelineItem.tsx`
  - Renders clean Chinese user/Agent/status rows and inline result/task cards.
- Modify: `D:\tapnow-flow\src\flowCanvas\agent\CanvasAgentResultCard.tsx`
  - Adds thumbnail frame, dimensions, status, place-on-canvas, continue-edit, variant, poster, and compare actions.
- Modify: `D:\tapnow-flow\src\flowCanvas\agent\agentWorkspaceTimeline.ts`
  - Ensures replayed events produce normal chat/result rows without raw debug event blocks.
- Test: `D:\tapnow-flow\src\flowCanvas\agent\CanvasAgentWorkspaceShell.test.tsx`
- Test: `D:\tapnow-flow\src\flowCanvas\agent\CanvasAgentPanel.test.tsx`
- Test: `D:\tapnow-flow\src\flowCanvas\agent\CanvasAgentConversationView.test.tsx`
- Test: `D:\tapnow-flow\src\flowCanvas\agent\CanvasAgentResultCard.test.tsx`
- Test: `D:\tapnow-flow\src\flowCanvas\agent\agentWorkspaceTimeline.test.ts`

### Backend Reference Context And Resolution

- Modify: `D:\tapnow-flow\apps\api\src\modules\agent\agent.schemas.ts`
  - Adds `agentReferenceContextSchema` and attaches it to turn schemas.
- Create: `D:\tapnow-flow\apps\api\src\modules\agent\agent-reference-context.ts`
  - Owns backend reference-context types, validation helpers, asset ownership lookup, and resolver.
- Modify: `D:\tapnow-flow\apps\api\src\modules\agent\agent-executor.service.ts`
  - Stores safe reference context on user message metadata, adds it to executor context, and passes it to tool runner.
- Modify: `D:\tapnow-flow\apps\api\src\modules\agent\agent-executor-prompt.ts`
  - Instructs the model to use `referenceRefs` with known `refId` values only.
- Modify: `D:\tapnow-flow\apps\api\src\modules\agent\agent-tool-runner.ts`
  - Resolves `referenceRefs` to validated `referenceAssetIds` before workflow launch.
- Test: `D:\tapnow-flow\apps\api\test\agent-schemas.test.ts`
- Test: `D:\tapnow-flow\apps\api\test\agent-reference-context.test.ts`
- Test: `D:\tapnow-flow\apps\api\test\agent-executor.test.ts`
- Test: `D:\tapnow-flow\apps\api\test\agent-tool-runner.test.ts`
- Test: `D:\tapnow-flow\apps\api\test\agent-tool-schemas.test.ts`

### Documentation

- Modify: `D:\tapnow-flow\PROJECT_RECORD.md`
  - Record meaningful product progress after implementation.
- Modify: `D:\tapnow-flow\docs\CODEX_HANDOFF.md`
  - Update only if implementation materially changes current Agent status.

## Implementation Guardrails

- Do not persist `previewUrl`, signed URLs, `blob:` URLs, `data:` URLs, base64 media, `File`, or `Blob` values in Agent messages, tool arguments, canvas graph JSON, or node data.
- Do not expose provider names, base URLs, upstream model names, encrypted secrets, raw API keys, Authorization headers, or full route internals in creator-facing UI.
- Uploaded references must go through `uploadAssetFile({ file, kind: "image", projectId })`.
- Backend must validate references by tenant and image type before workflow execution.
- Unknown `referenceRefs` fail closed before `launchImageGeneration`.
- Keep all normal user-facing changes under existing `/api/v2/agent/*` and `/api/v2/assets/*` flows.

---

## Task 1: Add Shared Frontend Reference Context And API Plumbing

**Files:**
- Create: `D:\tapnow-flow\src\flowCanvas\agent\agentReferenceContext.ts`
- Modify: `D:\tapnow-flow\src\flowCanvas\agent\CanvasAgentWorkspaceTypes.ts`
- Modify: `D:\tapnow-flow\src\flowCanvas\agent\canvasAgentApi.ts`
- Modify: `D:\tapnow-flow\src\flowCanvas\agent\canvasAgentApi.test.ts`

- [ ] **Step 1: Write failing frontend API tests**

Append tests to `D:\tapnow-flow\src\flowCanvas\agent\canvasAgentApi.test.ts` that prove turn payloads carry `referenceContext` and do not include preview URLs:

```ts
it("sends referenceContext when creating an Agent turn", async () => {
  const post = vi.fn().mockResolvedValue({ sessionId: "session-1", turnId: "turn-1" });
  vi.mocked(apiPost).mockImplementation(post);

  await createAgentTurn("session-1", {
    prompt: "Use this reference",
    referenceContext: {
      items: [
        {
          assetId: "asset-upload-1",
          kind: "upload",
          label: "参考图 1",
          refId: "upload-1",
        },
      ],
    },
    snapshot: buildEmptySnapshot(),
  });

  expect(post).toHaveBeenCalledWith("/agent/sessions/session-1/turns", expect.objectContaining({
    referenceContext: {
      items: [
        expect.objectContaining({
          assetId: "asset-upload-1",
          kind: "upload",
          label: "参考图 1",
          refId: "upload-1",
        }),
      ],
    },
  }));
  expect(JSON.stringify(post.mock.calls[0]?.[1])).not.toMatch(/previewUrl|blob:|data:/i);
});
```

Add the same assertion for `executeAgentTurnStream` by stubbing `global.fetch` and checking `JSON.parse(String(fetch.mock.calls[0][1].body))`.

- [ ] **Step 2: Run the failing frontend API test**

Run:

```bash
npm test -- src/flowCanvas/agent/canvasAgentApi.test.ts
```

Expected: FAIL because `referenceContext` is not accepted by the current API input types.

- [ ] **Step 3: Create the frontend reference context helper**

Create `D:\tapnow-flow\src\flowCanvas\agent\agentReferenceContext.ts`:

```ts
import type { AgentContinuationContext } from "./canvasAgentApi";
import type { AgentReferenceChip } from "./CanvasAgentWorkspaceTypes";

export type AgentReferenceContextItem = {
  assetId: string;
  kind: "artifact" | "canvas_node" | "upload";
  label: string;
  nodeId?: string;
  refId: string;
};

export type AgentReferenceContext = {
  items: AgentReferenceContextItem[];
};

export const AGENT_REFERENCE_LIMIT = 8;

export function buildAgentReferenceContext(input: {
  chips: AgentReferenceChip[];
  continuationContext?: AgentContinuationContext | null;
}): AgentReferenceContext {
  const items: AgentReferenceContextItem[] = [];
  const seen = new Set<string>();

  for (const chip of input.chips) {
    if (!chip.assetId || !chip.refId) continue;
    if (seen.has(chip.refId)) continue;
    seen.add(chip.refId);
    items.push({
      assetId: chip.assetId,
      kind: chip.kind,
      label: chip.label,
      ...(chip.nodeId ? { nodeId: chip.nodeId } : {}),
      refId: chip.refId,
    });
  }

  const continuation = input.continuationContext;
  if (continuation) {
    const assetIds = continuation.assetIds?.length ? continuation.assetIds : [continuation.assetId];
    const refIds = continuation.assetRefIds?.length ? continuation.assetRefIds : [continuation.assetRefId];
    const labels = continuation.assetLabels?.length ? continuation.assetLabels : [continuation.assetLabel];

    for (let index = 0; index < assetIds.length; index += 1) {
      const assetId = assetIds[index];
      const refId = refIds[index];
      if (!assetId || !refId || seen.has(refId)) continue;
      seen.add(refId);
      items.push({
        assetId,
        kind: "artifact",
        label: labels[index] ?? `结果 ${index + 1}`,
        refId,
      });
    }
  }

  return { items: items.slice(0, AGENT_REFERENCE_LIMIT) };
}
```

- [ ] **Step 4: Update workspace chip type**

In `D:\tapnow-flow\src\flowCanvas\agent\CanvasAgentWorkspaceTypes.ts`, keep UI chips flexible but document which fields are required for sendable references:

```ts
export type AgentReferenceChip = {
  assetId?: string;
  id: string;
  kind: "artifact" | "canvas_node" | "upload";
  label: string;
  nodeId?: string;
  previewUrl?: string;
  refId?: string;
};

export type SendableAgentReferenceChip = AgentReferenceChip & {
  assetId: string;
  refId: string;
};
```

- [ ] **Step 5: Add API input type and payload fields**

In `D:\tapnow-flow\src\flowCanvas\agent\canvasAgentApi.ts`, import the type and update all turn input signatures:

```ts
import type { AgentReferenceContext } from "./agentReferenceContext";

type AgentTurnRequestInput = {
  continuationContext?: AgentContinuationContext | null;
  prompt: string;
  referenceContext?: AgentReferenceContext;
  snapshot: CanvasAgentSnapshot;
};
```

Then use `AgentTurnRequestInput` for `createAgentTurn`, `openAgentTurnStream`, and `executeAgentTurnStream`.

- [ ] **Step 6: Run frontend API tests again**

Run:

```bash
npm test -- src/flowCanvas/agent/canvasAgentApi.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/flowCanvas/agent/agentReferenceContext.ts src/flowCanvas/agent/CanvasAgentWorkspaceTypes.ts src/flowCanvas/agent/canvasAgentApi.ts src/flowCanvas/agent/canvasAgentApi.test.ts
git commit -m "feat: add agent reference context client payload"
```

---

## Task 2: Add Backend Reference Schema And Safe Executor Context

**Files:**
- Modify: `D:\tapnow-flow\apps\api\src\modules\agent\agent.schemas.ts`
- Create: `D:\tapnow-flow\apps\api\test\agent-schemas.test.ts` if missing, otherwise modify it.
- Modify: `D:\tapnow-flow\apps\api\src\modules\agent\agent-executor.service.ts`
- Modify: `D:\tapnow-flow\apps\api\src\modules\agent\agent-executor-prompt.ts`
- Modify: `D:\tapnow-flow\apps\api\test\agent-executor.test.ts`

- [ ] **Step 1: Write failing schema tests**

Add tests to `D:\tapnow-flow\apps\api\test\agent-schemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { createAgentTurnSchema } from "../src/modules/agent/agent.schemas.js";

const snapshot = {
  edges: [],
  flowId: null,
  nodeOutputs: {},
  nodes: [],
  projectId: null,
  selectedNodeIds: [],
  viewport: { x: 0, y: 0, zoom: 1 },
};

describe("Agent turn schemas", () => {
  it("accepts a valid referenceContext", () => {
    const parsed = createAgentTurnSchema.parse({
      prompt: "use the uploaded image",
      referenceContext: {
        items: [
          {
            assetId: "00000000-0000-0000-0000-000000000001",
            kind: "upload",
            label: "参考图 1",
            refId: "upload-1",
          },
        ],
      },
      snapshot,
    });

    expect(parsed.referenceContext?.items[0]).toMatchObject({
      assetId: "00000000-0000-0000-0000-000000000001",
      refId: "upload-1",
    });
  });

  it("rejects more than eight references", () => {
    expect(() => createAgentTurnSchema.parse({
      prompt: "too many refs",
      referenceContext: {
        items: Array.from({ length: 9 }, (_, index) => ({
          assetId: `asset-${index}`,
          kind: "upload",
          label: `参考图 ${index + 1}`,
          refId: `upload-${index + 1}`,
        })),
      },
      snapshot,
    })).toThrow();
  });

  it("rejects duplicate refId values", () => {
    expect(() => createAgentTurnSchema.parse({
      prompt: "duplicate refs",
      referenceContext: {
        items: [
          { assetId: "asset-1", kind: "upload", label: "A", refId: "same" },
          { assetId: "asset-2", kind: "upload", label: "B", refId: "same" },
        ],
      },
      snapshot,
    })).toThrow();
  });
});
```

- [ ] **Step 2: Run the failing backend schema test**

Run:

```bash
npm run test --workspace @aigc-flow/api -- agent-schemas.test.ts
```

Expected: FAIL because `referenceContext` is currently stripped/rejected and duplicate refs are not checked.

- [ ] **Step 3: Add backend schema**

In `D:\tapnow-flow\apps\api\src\modules\agent\agent.schemas.ts`, add:

```ts
const agentReferenceContextItemSchema = z.object({
  assetId: z.string().trim().min(1).max(200),
  kind: z.enum(["artifact", "canvas_node", "upload"]),
  label: z.string().trim().min(1).max(120),
  nodeId: z.string().trim().min(1).max(200).optional(),
  refId: z.string().trim().min(1).max(120),
}).strict();

export const agentReferenceContextSchema = z.object({
  items: z.array(agentReferenceContextItemSchema).max(8).default([]),
}).strict().superRefine((value, ctx) => {
  const seen = new Set<string>();
  value.items.forEach((item, index) => {
    if (seen.has(item.refId)) {
      ctx.addIssue({
        code: "custom",
        message: "referenceContext.items must use unique refId values",
        path: ["items", index, "refId"],
      });
    }
    seen.add(item.refId);
  });
});
```

Then attach it to `createAgentTurnSchema`:

```ts
referenceContext: agentReferenceContextSchema.optional(),
```

Export inferred type:

```ts
export type AgentReferenceContextInput = z.infer<typeof agentReferenceContextSchema>;
```

- [ ] **Step 4: Write failing executor context test**

Append to `D:\tapnow-flow\apps\api\test\agent-executor.test.ts`:

```ts
it("injects current reference context into the executor prompt without preview URLs", async () => {
  const generateText = vi.fn().mockResolvedValue({ outputText: "I can use the uploaded reference." });
  const repository = createExecutorRepository();
  const executor = new AgentExecutorService({
    costEstimator: {
      estimateGenerateImage: vi.fn(),
      estimateGenerateImageBatch: vi.fn(),
    },
    repository,
    textRuntime: { generateText },
    toolRunner: { runToolCall: vi.fn() },
  });

  await executor.executeTurn(context, {
    prompt: "Use uploaded ref",
    referenceContext: {
      items: [
        {
          assetId: "asset-upload-1",
          kind: "upload",
          label: "参考图 1",
          refId: "upload-1",
        },
      ],
    },
    sessionId: "session-1",
    snapshot,
  });

  const contextPayload = JSON.parse(generateText.mock.calls[0]?.[1]?.messages?.[1]?.content ?? "{}");
  expect(contextPayload.references).toEqual([
    {
      assetId: "asset-upload-1",
      kind: "upload",
      label: "参考图 1",
      refId: "upload-1",
    },
  ]);
  expect(JSON.stringify(contextPayload)).not.toMatch(/previewUrl|signed|baseUrl|apiKey|Authorization/i);
  expect(repository.createUserMessage).toHaveBeenCalledWith(expect.objectContaining({
    metadata: expect.objectContaining({
      referenceContext: expect.objectContaining({
        items: [expect.objectContaining({ refId: "upload-1" })],
      }),
    }),
  }));
});
```

- [ ] **Step 5: Add executor input type and prompt context**

In `D:\tapnow-flow\apps\api\src\modules\agent\agent-executor.service.ts`, import the type and extend `AgentExecutorTurnInput`:

```ts
import type { AgentReferenceContextInput } from "./agent.schemas.js";

export type AgentExecutorTurnInput = {
  continuationContext?: { /* keep existing fields */ } | null;
  onEvent?: (event: AgentToolEvent) => void | Promise<void>;
  prompt: string;
  referenceContext?: AgentReferenceContextInput;
  sessionId: string;
  snapshot: CanvasAgentSnapshotInput;
};
```

When creating the user message, store safe metadata:

```ts
metadata: compactObject({
  continuationContext: input.continuationContext ?? undefined,
  referenceContext: input.referenceContext ?? undefined,
}),
```

Change `buildUserExecutorContext(...)` signature to include reference context:

```ts
function buildUserExecutorContext(
  prompt: string,
  snapshot: CanvasAgentSnapshotInput,
  previousResults: AgentAssetReference[] = [],
  continuationContext?: AgentExecutorTurnInput["continuationContext"],
  referenceContext?: AgentReferenceContextInput,
): string {
  const references = (referenceContext?.items ?? []).map((item) => ({
    assetId: item.assetId,
    kind: item.kind,
    label: item.label,
    refId: item.refId,
  }));

  return JSON.stringify({
    activeContinuation: safeContinuation,
    canvas: { /* keep existing canvas summary */ },
    previousResults: previousResultRefs,
    prompt,
    references,
  });
}
```

Update both calls to `buildUserExecutorContext` to pass `input.referenceContext`.

- [ ] **Step 6: Update executor prompt rules**

In `D:\tapnow-flow\apps\api\src\modules\agent\agent-executor-prompt.ts`, add concise rules:

```ts
"When current references are provided, refer to them only by the listed refId values.",
"For image generation or image edit that uses references, put those refId values in referenceRefs.",
"Never invent referenceRefs. Never put asset URLs, signed URLs, base64, blob URLs, data URLs, provider names, base URLs, API keys, or Authorization headers in tool calls.",
```

- [ ] **Step 7: Run backend schema and executor tests**

Run:

```bash
npm run test --workspace @aigc-flow/api -- agent-schemas.test.ts agent-executor.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/agent/agent.schemas.ts apps/api/src/modules/agent/agent-executor.service.ts apps/api/src/modules/agent/agent-executor-prompt.ts apps/api/test/agent-schemas.test.ts apps/api/test/agent-executor.test.ts
git commit -m "feat: add safe agent reference context"
```

---

## Task 3: Resolve `referenceRefs` To Validated Asset IDs Before Workflow Launch

**Files:**
- Create: `D:\tapnow-flow\apps\api\src\modules\agent\agent-reference-context.ts`
- Create: `D:\tapnow-flow\apps\api\test\agent-reference-context.test.ts`
- Modify: `D:\tapnow-flow\apps\api\src\modules\agent\agent-tool-runner.ts`
- Modify: `D:\tapnow-flow\apps\api\test\agent-tool-runner.test.ts`

- [ ] **Step 1: Write resolver unit tests**

Create `D:\tapnow-flow\apps\api\test\agent-reference-context.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { AgentReferenceResolutionError, resolveAgentReferenceAssetIds } from "../src/modules/agent/agent-reference-context.js";

const referenceContext = {
  items: [
    { assetId: "asset-upload-1", kind: "upload" as const, label: "参考图 1", refId: "upload-1" },
    { assetId: "asset-node-1", kind: "canvas_node" as const, label: "画布图片 1", refId: "canvas-1" },
  ],
};

describe("resolveAgentReferenceAssetIds", () => {
  it("resolves user-facing refIds to assetIds", () => {
    expect(resolveAgentReferenceAssetIds({
      referenceContext,
      requestedRefs: ["upload-1", "canvas-1"],
    })).toEqual(["asset-upload-1", "asset-node-1"]);
  });

  it("accepts an assetId only when it is already in the allowed set", () => {
    expect(resolveAgentReferenceAssetIds({
      referenceContext,
      requestedRefs: ["asset-upload-1"],
    })).toEqual(["asset-upload-1"]);
  });

  it("falls back to continuation asset ids when no refs are requested", () => {
    expect(resolveAgentReferenceAssetIds({
      continuationContext: {
        action: "continue-edit",
        assetId: "asset-previous",
        assetIds: ["asset-previous", "asset-previous-2"],
        assetLabel: "上一轮结果",
        assetLabels: ["上一轮结果", "上一轮结果 2"],
        assetRefId: "round-1-image-1",
        assetRefIds: ["round-1-image-1", "round-1-image-2"],
      },
      requestedRefs: undefined,
    })).toEqual(["asset-previous", "asset-previous-2"]);
  });

  it("fails closed for unknown refs", () => {
    expect(() => resolveAgentReferenceAssetIds({
      referenceContext,
      requestedRefs: ["not-known"],
    })).toThrow(AgentReferenceResolutionError);
  });
});
```

- [ ] **Step 2: Run the failing resolver test**

Run:

```bash
npm run test --workspace @aigc-flow/api -- agent-reference-context.test.ts
```

Expected: FAIL because the resolver does not exist.

- [ ] **Step 3: Implement resolver and error class**

Create `D:\tapnow-flow\apps\api\src\modules\agent\agent-reference-context.ts`:

```ts
import { createPgPool, withTenantTransaction } from "@aigc-flow/db";
import type { Pool } from "pg";

import type { AgentReferenceContextInput } from "./agent.schemas.js";

export class AgentReferenceResolutionError extends Error {
  readonly code = "AGENT_REFERENCE_NOT_FOUND";
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = "AgentReferenceResolutionError";
  }
}

export type AgentContinuationReferenceContext = {
  assetId: string;
  assetIds?: string[];
  assetLabel: string;
  assetLabels?: string[];
  assetRefId: string;
  assetRefIds?: string[];
};

export function resolveAgentReferenceAssetIds(input: {
  continuationContext?: AgentContinuationReferenceContext | null;
  previousResults?: Array<{ assetId: string; refId: string }>;
  referenceContext?: AgentReferenceContextInput;
  requestedRefs?: string[];
}): string[] {
  const allowedByRef = new Map<string, string>();
  const allowedAssetIds = new Set<string>();

  for (const item of input.referenceContext?.items ?? []) {
    allowedByRef.set(item.refId, item.assetId);
    allowedAssetIds.add(item.assetId);
  }

  for (const item of input.previousResults ?? []) {
    allowedByRef.set(item.refId, item.assetId);
    allowedAssetIds.add(item.assetId);
  }

  const continuationAssetIds = Array.from(new Set(
    input.continuationContext?.assetIds?.filter(Boolean)
      ?? (input.continuationContext?.assetId ? [input.continuationContext.assetId] : []),
  ));

  const continuationRefIds = input.continuationContext?.assetRefIds?.length
    ? input.continuationContext.assetRefIds
    : input.continuationContext?.assetRefId
      ? [input.continuationContext.assetRefId]
      : [];

  continuationAssetIds.forEach((assetId, index) => {
    allowedAssetIds.add(assetId);
    const refId = continuationRefIds[index];
    if (refId) allowedByRef.set(refId, assetId);
  });

  if (!input.requestedRefs || input.requestedRefs.length === 0) {
    return continuationAssetIds;
  }

  const resolved: string[] = [];
  for (const requested of input.requestedRefs) {
    const byRef = allowedByRef.get(requested);
    if (byRef) {
      resolved.push(byRef);
      continue;
    }
    if (allowedAssetIds.has(requested)) {
      resolved.push(requested);
      continue;
    }
    throw new AgentReferenceResolutionError(`Unknown Agent reference: ${requested}`);
  }

  return Array.from(new Set(resolved));
}
```

- [ ] **Step 4: Add asset ownership validator**

In the same file, add a repository helper that execution code can call before the model loop:

```ts
export class AgentReferenceAssetRepository {
  readonly pool: Pool;

  constructor(options?: { pool?: Pool }) {
    this.pool = options?.pool ?? createPgPool();
  }

  async validateImageReferences(input: {
    projectId?: string | null;
    referenceContext?: AgentReferenceContextInput;
    tenantId: string;
  }): Promise<void> {
    const items = input.referenceContext?.items ?? [];
    if (items.length === 0) return;
    const assetIds = Array.from(new Set(items.map((item) => item.assetId)));

    await withTenantTransaction({ tenantId: input.tenantId, userId: null }, async (client) => {
      const result = await client.query<{ id: string; kind: string; project_id: string | null; status: string }>(
        `
          SELECT id::text AS id, kind, project_id::text AS project_id, status
          FROM assets
          WHERE tenant_id = $1::uuid
            AND id = ANY($2::uuid[])
            AND deleted_at IS NULL
        `,
        [input.tenantId, assetIds],
      );

      const byId = new Map(result.rows.map((row) => [row.id, row]));
      for (const assetId of assetIds) {
        const row = byId.get(assetId);
        if (!row) throw new AgentReferenceResolutionError(`Reference asset was not found: ${assetId}`);
        if (row.status !== "available") throw new AgentReferenceResolutionError(`Reference asset is not available: ${assetId}`);
        if (row.kind !== "image") throw new AgentReferenceResolutionError(`Reference asset must be an image: ${assetId}`);
        if (input.projectId && row.project_id && row.project_id !== input.projectId) {
          throw new AgentReferenceResolutionError(`Reference asset is not part of this project: ${assetId}`);
        }
      }
    }, this.pool);
  }
}
```

Use direct SQL here because `AssetsService` ownership checks are private and also return preview/signing-oriented views that the executor does not need.

- [ ] **Step 5: Add tool-runner failing tests**

Append to `D:\tapnow-flow\apps\api\test\agent-tool-runner.test.ts`:

```ts
it("resolves referenceRefs to asset ids before launching image workflow", async () => {
  const repository = createRunnerRepositoryMock("tool-db-ref", "task-db-ref");
  const launcher = {
    launchImageGeneration: vi.fn().mockResolvedValue({
      assetRefs: [{ assetId: "asset-out", kind: "image", label: "Round 1 image 1", promptSummary: "", refId: "round-1-image-1" }],
      nodeRunId: "node-ref",
      status: "succeeded",
      workflowRunId: "run-ref",
    }),
  };
  const runner = new AgentToolRunner({ launcher, repository });

  await runner.runToolCall(context, {
    call: {
      arguments: { prompt: "make a poster", referenceRefs: ["upload-1"], size: "1K" },
      toolCallKey: "call-ref",
      toolName: "generate_image",
    },
    executionTarget: { flowId: "flow-1", targetNodeId: "image-node-1" },
    referenceContext: {
      items: [
        { assetId: "asset-upload-1", kind: "upload", label: "参考图 1", refId: "upload-1" },
      ],
    },
    roundIndex: 1,
    sessionId: "session-1",
    turnId: "turn-1",
  });

  expect(launcher.launchImageGeneration).toHaveBeenCalledWith(context, expect.objectContaining({
    referenceAssetIds: ["asset-upload-1"],
  }));
  expect(repository.createTask).toHaveBeenCalledWith(expect.objectContaining({
    inputJson: expect.objectContaining({
      referenceAssetIds: ["asset-upload-1"],
      referenceRefs: ["upload-1"],
    }),
  }));
});

it("fails closed when image tool references an unknown ref", async () => {
  const repository = createRunnerRepositoryMock("tool-db-ref-fail", "task-db-ref-fail");
  const launcher = { launchImageGeneration: vi.fn() };
  const runner = new AgentToolRunner({ launcher, repository });

  const result = await runner.runToolCall(context, {
    call: {
      arguments: { prompt: "make a poster", referenceRefs: ["missing"], size: "1K" },
      toolCallKey: "call-ref-fail",
      toolName: "generate_image",
    },
    executionTarget: { flowId: "flow-1", targetNodeId: "image-node-1" },
    referenceContext: {
      items: [
        { assetId: "asset-upload-1", kind: "upload", label: "参考图 1", refId: "upload-1" },
      ],
    },
    roundIndex: 1,
    sessionId: "session-1",
    turnId: "turn-1",
  });

  expect(result.status).toBe("failed");
  expect(result.failures[0]).toEqual(expect.objectContaining({ code: "AGENT_REFERENCE_NOT_FOUND" }));
  expect(launcher.launchImageGeneration).not.toHaveBeenCalled();
});
```

- [ ] **Step 6: Extend tool-runner input and launch path**

In `D:\tapnow-flow\apps\api\src\modules\agent\agent-tool-runner.ts`, import the resolver and schema type:

```ts
import { resolveAgentReferenceAssetIds } from "./agent-reference-context.js";
import type { AgentReferenceContextInput } from "./agent.schemas.js";
```

Extend `AgentToolRunInput`:

```ts
previousResults?: Array<{ assetId: string; refId: string }>;
referenceContext?: AgentReferenceContextInput;
```

In `launchOne`, replace the current direct assignment:

```ts
const resolvedReferenceAssetIds = resolveAgentReferenceAssetIds({
  continuationContext: input.continuationContext,
  previousResults: input.previousResults,
  referenceContext: input.referenceContext,
  requestedRefs: referenceRefs,
});
```

Pass `resolvedReferenceAssetIds` into `launchImageGeneration`.

Update `buildTaskInputJson(...)` to include safe audit fields:

```ts
referenceAssetIds: resolvedReferenceAssetIds.length > 0 ? resolvedReferenceAssetIds : undefined,
referenceRefs: settings && "referenceRefs" in settings && Array.isArray(settings.referenceRefs)
  ? settings.referenceRefs
  : undefined,
```

Pass `resolvedReferenceAssetIds` into `buildTaskInputJson` from `createImageTask` or update the task input immediately after resolution. The final persisted task input must contain safe `referenceRefs` and resolved `referenceAssetIds`; it must not contain preview URLs.

- [ ] **Step 7: Run resolver and runner tests**

Run:

```bash
npm run test --workspace @aigc-flow/api -- agent-reference-context.test.ts agent-tool-runner.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/agent/agent-reference-context.ts apps/api/src/modules/agent/agent-tool-runner.ts apps/api/test/agent-reference-context.test.ts apps/api/test/agent-tool-runner.test.ts
git commit -m "fix: resolve agent references before workflow launch"
```

---

## Task 4: Validate Reference Assets And Carry Context Through Executor Approval Paths

**Files:**
- Modify: `D:\tapnow-flow\apps\api\src\modules\agent\agent-executor.service.ts`
- Modify: `D:\tapnow-flow\apps\api\test\agent-executor.test.ts`
- Modify: `D:\tapnow-flow\apps\api\test\agent-tool-runner.test.ts`

- [ ] **Step 1: Write failing executor runner-context test**

Append to `D:\tapnow-flow\apps\api\test\agent-executor.test.ts`:

```ts
it("passes referenceContext and previous results into tool runner", async () => {
  const generateText = vi
    .fn()
    .mockResolvedValueOnce({
      outputText: JSON.stringify({
        reply: "Starting edit.",
        toolCalls: [
          {
            arguments: { prompt: "use uploaded ref", referenceRefs: ["upload-1"], size: "1K" },
            toolCallKey: "tool-ref-1",
            toolName: "generate_image",
          },
        ],
      }),
    })
    .mockResolvedValueOnce({ outputText: JSON.stringify({ reply: "Submitted." }) });
  const repository = createExecutorRepository({
    listSessionAssetRefs: vi.fn().mockResolvedValue([
      { assetId: "asset-prev-1", kind: "image", label: "上一轮结果", promptSummary: "", refId: "round-1-image-1" },
    ]),
  });
  const toolRunner = {
    runToolCall: vi.fn().mockResolvedValue({
      assetRefs: [],
      failures: [],
      status: "succeeded",
      toolCallId: "tool-db-1",
      workflowRunIds: [],
      workflowRuns: [],
    }),
  };
  const executor = new AgentExecutorService({
    costEstimator: {
      estimateGenerateImage: vi.fn().mockResolvedValue({ totalCredits: 4 }),
      estimateGenerateImageBatch: vi.fn(),
    },
    repository,
    textRuntime: { generateText },
    toolRunner,
  });

  await executor.executeTurn(context, {
    prompt: "Use the uploaded reference",
    referenceContext: {
      items: [{ assetId: "asset-upload-1", kind: "upload", label: "参考图 1", refId: "upload-1" }],
    },
    sessionId: "session-1",
    snapshot,
  });

  expect(toolRunner.runToolCall).toHaveBeenCalledWith(context, expect.objectContaining({
    previousResults: [expect.objectContaining({ refId: "round-1-image-1" })],
    referenceContext: {
      items: [expect.objectContaining({ assetId: "asset-upload-1", refId: "upload-1" })],
    },
  }));
});
```

- [ ] **Step 2: Add failing approval persistence test**

Append to `D:\tapnow-flow\apps\api\test\agent-executor.test.ts`:

```ts
it("stores referenceContext with pending approval and restores it on approve", async () => {
  const repository = createExecutorRepository({
    readPendingApproval: vi.fn().mockResolvedValue({
      costEstimate: { totalCredits: 4 },
      pendingToolCall: {
        arguments: { prompt: "use uploaded ref", referenceRefs: ["upload-1"], size: "1K" },
        toolCallKey: "tool-ref-approve",
        toolName: "generate_image",
      },
      referenceContext: {
        items: [{ assetId: "asset-upload-1", kind: "upload", label: "参考图 1", refId: "upload-1" }],
      },
      snapshot,
    }),
  });
  const toolRunner = {
    runToolCall: vi.fn().mockResolvedValue({
      assetRefs: [],
      failures: [],
      status: "succeeded",
      toolCallId: "tool-db-approve",
      workflowRunIds: [],
      workflowRuns: [],
    }),
  };
  const executor = new AgentExecutorService({
    costEstimator: {
      estimateGenerateImage: vi.fn().mockResolvedValue({ totalCredits: 4 }),
      estimateGenerateImageBatch: vi.fn(),
    },
    limits: { requireApproval: true },
    repository,
    textRuntime: { generateText: vi.fn() },
    toolRunner,
  });

  await executor.approveToolCall(context, {
    sessionId: "session-1",
    toolCallKey: "tool-ref-approve",
    turnId: "turn-1",
  });

  expect(toolRunner.runToolCall).toHaveBeenCalledWith(context, expect.objectContaining({
    referenceContext: {
      items: [expect.objectContaining({ assetId: "asset-upload-1", refId: "upload-1" })],
    },
  }));
});
```

- [ ] **Step 3: Run failing executor tests**

Run:

```bash
npm run test --workspace @aigc-flow/api -- agent-executor.test.ts
```

Expected: FAIL because executor does not pass or persist reference context yet.

- [ ] **Step 4: Pass reference context into tool runner**

In `D:\tapnow-flow\apps\api\src\modules\agent\agent-executor.service.ts`, update the `runToolCall` call:

```ts
const result = await this.options.toolRunner.runToolCall(context, {
  call,
  continuationContext: input.continuationContext,
  costEstimate,
  executionTarget: resolveExecutionTarget(input.snapshot),
  onEvent: input.onEvent,
  previousResults,
  referenceContext: input.referenceContext,
  roundIndex: round + 1,
  sessionId: input.sessionId,
  turnId: turn.turnId,
});
```

- [ ] **Step 5: Persist reference context in pending approval plan JSON**

When `policy.requiresApproval`, add:

```ts
referenceContext: input.referenceContext ?? null,
```

to the `planJson` passed to `markTurnSucceeded`.

Extend `readPendingApproval` return type:

```ts
referenceContext?: AgentReferenceContextInput | null;
```

Read it from `row.plan_json.referenceContext` when present.

- [ ] **Step 6: Restore reference context on approve**

In `approveToolCall`, pass:

```ts
referenceContext: pending.referenceContext ?? undefined,
```

to `toolRunner.runToolCall`.

- [ ] **Step 7: Add asset ownership validation before model execution**

Add an optional dependency to `AgentExecutorService` constructor:

```ts
referenceAssetRepository?: Pick<AgentReferenceAssetRepository, "validateImageReferences">;
```

At the start of `executeTurn`, before calling `textRuntime.generateText`, run:

```ts
await this.options.referenceAssetRepository?.validateImageReferences({
  projectId: input.snapshot.projectId,
  referenceContext: input.referenceContext,
  tenantId: context.tenantId,
});
```

In app construction, instantiate `new AgentReferenceAssetRepository()` and pass it to `AgentExecutorService`.

- [ ] **Step 8: Run executor tests**

Run:

```bash
npm run test --workspace @aigc-flow/api -- agent-executor.test.ts agent-tool-runner.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/agent/agent-executor.service.ts apps/api/test/agent-executor.test.ts apps/api/test/agent-tool-runner.test.ts
git commit -m "feat: carry agent references through executor approval"
```

---

## Task 5: Build Upload Reference Button And Composer Reference Strip

**Files:**
- Create: `D:\tapnow-flow\src\flowCanvas\agent\CanvasAgentReferenceUploadButton.tsx`
- Create: `D:\tapnow-flow\src\flowCanvas\agent\CanvasAgentReferenceUploadButton.test.tsx`
- Modify: `D:\tapnow-flow\src\flowCanvas\agent\CanvasAgentComposer.tsx`
- Modify: `D:\tapnow-flow\src\flowCanvas\agent\CanvasAgentReferenceChips.tsx`
- Modify: `D:\tapnow-flow\src\flowCanvas\agent\CanvasAgentComposer.test.tsx`

- [ ] **Step 1: Write failing upload button tests**

Create `D:\tapnow-flow\src\flowCanvas\agent\CanvasAgentReferenceUploadButton.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { uploadAssetFile } from "../../assets/assetApi";
import { CanvasAgentReferenceUploadButton } from "./CanvasAgentReferenceUploadButton";

vi.mock("../../assets/assetApi", () => ({
  uploadAssetFile: vi.fn(),
}));

describe("CanvasAgentReferenceUploadButton", () => {
  it("uploads image files and returns upload reference chips", async () => {
    vi.mocked(uploadAssetFile).mockResolvedValue({
      height: 512,
      id: "asset-upload-1",
      kind: "image",
      mimeType: "image/png",
      previewUrl: "https://signed.example/preview",
      title: "ref.png",
      width: 512,
    } as Awaited<ReturnType<typeof uploadAssetFile>>);
    const onUploaded = vi.fn();

    render(<CanvasAgentReferenceUploadButton onUploaded={onUploaded} projectId="project-1" />);

    const file = new File(["x"], "ref.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("上传参考图"), { target: { files: [file] } });

    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith([
      expect.objectContaining({
        assetId: "asset-upload-1",
        kind: "upload",
        label: "参考图 1",
        previewUrl: "https://signed.example/preview",
        refId: "upload-1",
      }),
    ]));
    expect(uploadAssetFile).toHaveBeenCalledWith({ file, kind: "image", projectId: "project-1" });
  });

  it("rejects non-image files before upload", async () => {
    const onError = vi.fn();
    render(<CanvasAgentReferenceUploadButton onError={onError} onUploaded={vi.fn()} projectId="project-1" />);

    const file = new File(["x"], "notes.txt", { type: "text/plain" });
    fireEvent.change(screen.getByLabelText("上传参考图"), { target: { files: [file] } });

    expect(uploadAssetFile).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith("只能上传图片作为参考图。");
  });
});
```

- [ ] **Step 2: Run failing upload test**

Run:

```bash
npm test -- src/flowCanvas/agent/CanvasAgentReferenceUploadButton.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement upload button**

Create `D:\tapnow-flow\src\flowCanvas\agent\CanvasAgentReferenceUploadButton.tsx`:

```tsx
import React from "react";
import { Loader2, Plus } from "lucide-react";

import { uploadAssetFile } from "../../assets/assetApi";
import type { AgentReferenceChip } from "./CanvasAgentWorkspaceTypes";

export function CanvasAgentReferenceUploadButton(props: {
  disabled?: boolean;
  existingCount?: number;
  onError?: (message: string) => void;
  onUploaded: (chips: AgentReferenceChip[]) => void;
  projectId?: string | null;
}) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = React.useState(false);

  const handleFiles = async (files: FileList | null) => {
    const selected = Array.from(files ?? []);
    if (selected.length === 0) return;
    const invalid = selected.find((file) => !file.type.startsWith("image/"));
    if (invalid) {
      props.onError?.("只能上传图片作为参考图。");
      return;
    }

    setUploading(true);
    try {
      const offset = props.existingCount ?? 0;
      const assets = await Promise.all(
        selected.map((file) => uploadAssetFile({ file, kind: "image", projectId: props.projectId ?? null })),
      );
      props.onUploaded(assets.map((asset, index) => ({
        assetId: asset.id,
        id: `upload-${asset.id}`,
        kind: "upload",
        label: `参考图 ${offset + index + 1}`,
        previewUrl: asset.previewUrl,
        refId: `upload-${offset + index + 1}`,
      })));
    } catch (error) {
      props.onError?.(error instanceof Error ? error.message : "参考图上传失败。");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      <button
        aria-label="上传参考图"
        disabled={props.disabled || uploading}
        onClick={() => inputRef.current?.click()}
        style={iconButtonStyle(props.disabled || uploading)}
        title="上传参考图"
        type="button"
      >
        {uploading ? <Loader2 size={16} /> : <Plus size={16} />}
      </button>
      <input
        accept="image/*"
        aria-label="上传参考图"
        disabled={props.disabled || uploading}
        multiple
        onChange={(event) => {
          void handleFiles(event.currentTarget.files);
        }}
        ref={inputRef}
        style={{ display: "none" }}
        type="file"
      />
    </>
  );
}

function iconButtonStyle(disabled?: boolean): React.CSSProperties {
  return {
    alignItems: "center",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 16,
    color: "#f8fafc",
    cursor: disabled ? "not-allowed" : "pointer",
    display: "inline-flex",
    height: 36,
    justifyContent: "center",
    opacity: disabled ? 0.55 : 1,
    width: 36,
  };
}
```

- [ ] **Step 4: Update reference chips for thumbnails and removal**

In `D:\tapnow-flow\src\flowCanvas\agent\CanvasAgentReferenceChips.tsx`, add props:

```ts
onRemoveRef?: (chip: AgentReferenceChip) => void;
removableKinds?: AgentReferenceChip["kind"][];
```

Render an image thumbnail when `chip.previewUrl` is present:

```tsx
{chip.previewUrl ? (
  <img alt="" src={chip.previewUrl} style={{ borderRadius: 8, height: 28, objectFit: "cover", width: 28 }} />
) : null}
```

Render a remove button only when the chip kind is in `removableKinds`:

```tsx
{props.removableKinds?.includes(chip.kind) ? (
  <button aria-label={`移除${chip.label}`} onClick={(event) => {
    event.stopPropagation();
    props.onRemoveRef?.(chip);
  }} type="button">
    ×
  </button>
) : null}
```

- [ ] **Step 5: Write failing composer layout tests**

Add to `D:\tapnow-flow\src\flowCanvas\agent\CanvasAgentComposer.test.tsx`:

```tsx
it("shows upload reference button next to submit and keeps reference strip above textarea", () => {
  render(
    <CanvasAgentComposer
      onSend={vi.fn()}
      onUploadReferences={vi.fn()}
      referenceChips={[
        { assetId: "asset-upload-1", id: "chip-1", kind: "upload", label: "参考图 1", refId: "upload-1" },
      ]}
    />,
  );

  const strip = screen.getByTestId("agent-composer-reference-strip");
  const textarea = screen.getByLabelText("Agent prompt");
  expect(strip.compareDocumentPosition(textarea) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getByRole("button", { name: "上传参考图" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "发送" })).toBeTruthy();
});
```

- [ ] **Step 6: Update composer props and layout**

In `D:\tapnow-flow\src\flowCanvas\agent\CanvasAgentComposer.tsx`, add props:

```ts
onRemoveReference?: (chip: AgentReferenceChip) => void;
onUploadError?: (message: string) => void;
onUploadReferences?: (chips: AgentReferenceChip[]) => void;
projectId?: string | null;
```

Place `CanvasAgentReferenceUploadButton` in the bottom action row before the send button. Change send button text from mojibake to:

```tsx
发送
```

Use clean placeholder text:

```ts
const PROMPT_PLACEHOLDER = "描述你想完成的创作任务，或继续刚才的结果...";
```

Pass thumbnail/removal props into `CanvasAgentReferenceChips`:

```tsx
<CanvasAgentReferenceChips
  chips={mergedReferenceChips}
  disabled={disabled}
  onInsertRef={(chip) => {
    if (chip.refId) insertReference(chip.refId);
  }}
  onRemoveRef={props.onRemoveReference}
  removableKinds={["upload"]}
/>
```

- [ ] **Step 7: Run upload and composer tests**

Run:

```bash
npm test -- src/flowCanvas/agent/CanvasAgentReferenceUploadButton.test.tsx src/flowCanvas/agent/CanvasAgentComposer.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/flowCanvas/agent/CanvasAgentReferenceUploadButton.tsx src/flowCanvas/agent/CanvasAgentReferenceUploadButton.test.tsx src/flowCanvas/agent/CanvasAgentComposer.tsx src/flowCanvas/agent/CanvasAgentComposer.test.tsx src/flowCanvas/agent/CanvasAgentReferenceChips.tsx
git commit -m "feat: add agent reference upload composer"
```

---

## Task 6: Wire Panel State So Uploaded, Selected, And Continuation References Send Together

**Files:**
- Modify: `D:\tapnow-flow\src\flowCanvas\agent\CanvasAgentPanel.tsx`
- Modify: `D:\tapnow-flow\src\flowCanvas\agent\useCanvasAgentSession.ts`
- Modify: `D:\tapnow-flow\src\flowCanvas\agent\useCanvasAgentSession.test.tsx`
- Modify: `D:\tapnow-flow\src\flowCanvas\agent\CanvasAgentPanel.test.tsx`

- [ ] **Step 1: Write failing session hook test**

In `D:\tapnow-flow\src\flowCanvas\agent\useCanvasAgentSession.test.tsx`, add:

```tsx
it("passes referenceContext to executor stream when sending a prompt", async () => {
  mockExecuteAgentTurnStream.mockResolvedValue({ ok: true, body: new ReadableStream(), status: 200 });
  const { result } = renderHook(() => useCanvasAgentSession());

  await act(async () => {
    await result.current.sendPrompt("Use reference", {
      referenceContext: {
        items: [{ assetId: "asset-upload-1", kind: "upload", label: "参考图 1", refId: "upload-1" }],
      },
    });
  });

  expect(mockExecuteAgentTurnStream).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
    referenceContext: {
      items: [expect.objectContaining({ assetId: "asset-upload-1", refId: "upload-1" })],
    },
  }));
});
```

- [ ] **Step 2: Update hook send signature**

In `D:\tapnow-flow\src\flowCanvas\agent\useCanvasAgentSession.ts`, update `sendPrompt` to accept options:

```ts
sendPrompt: async (
  prompt: string,
  options?: { referenceContext?: AgentReferenceContext },
) => {
  // keep existing session creation and snapshot behavior
  await executeAgentTurnStream(sessionId, {
    continuationContext: pendingContinuation ?? null,
    prompt,
    referenceContext: options?.referenceContext,
    snapshot,
  });
}
```

Apply the same payload to any fallback `createAgentTurn` or `openAgentTurnStream` path still used by the hook.

- [ ] **Step 3: Write failing panel integration test**

Add to `D:\tapnow-flow\src\flowCanvas\agent\CanvasAgentPanel.test.tsx`:

```tsx
it("merges uploaded references into the sent referenceContext and clears them on new chat", async () => {
  mockExecuteAgentTurnStream.mockResolvedValue({ ok: false, status: 503 });
  mockCreateAgentTurn.mockResolvedValue({
    approvalRequired: false,
    evidence: [],
    plan: [],
    proposedOps: [],
    reply: "ok",
    sessionId: "session-1",
    turnId: "turn-1",
  });

  renderPanel();

  await act(async () => {
    fireEvent.change(screen.getByLabelText("Agent prompt"), { target: { value: "Use ref" } });
    // The implementation should expose a test helper through the upload button test path.
    window.dispatchEvent(new CustomEvent("agent:test-upload-reference", {
      detail: { assetId: "asset-upload-1", label: "参考图 1", previewUrl: "https://signed.example/ref", refId: "upload-1" },
    }));
  });

  expect(await screen.findByText("参考图 1")).toBeTruthy();

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "发送" }));
  });

  expect(mockCreateAgentTurn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
    referenceContext: {
      items: [expect.objectContaining({ assetId: "asset-upload-1", refId: "upload-1" })],
    },
  }));
  expect(screen.queryByText("参考图 1")).toBeNull();
});
```

If the implementation does not use a custom test event, replace this setup with a mocked `uploadAssetFile` file input interaction as in `CanvasAgentReferenceUploadButton.test.tsx`.

- [ ] **Step 4: Add panel upload state and reference builder**

In `D:\tapnow-flow\src\flowCanvas\agent\CanvasAgentPanel.tsx`, import:

```ts
import { buildAgentReferenceContext } from "./agentReferenceContext";
```

Add state:

```ts
const [uploadedReferences, setUploadedReferences] = React.useState<AgentReferenceChip[]>([]);
const [uploadError, setUploadError] = React.useState<string | null>(null);
```

When selected canvas chips are built, ensure image nodes with `assetId` get stable `refId`:

```ts
refId: typeof node.data.assetId === "string" ? `canvas-${imageIndex}` : undefined,
```

When continuation chips are built, include `assetId`:

```ts
assetId: refs[index]?.assetId,
```

Build sendable chips:

```ts
const composerReferenceChips = React.useMemo(
  () => [...selectedReferenceChips, ...continuationChips, ...uploadedReferences],
  [continuationChips, selectedReferenceChips, uploadedReferences],
);
```

On send:

```ts
const referenceContext = buildAgentReferenceContext({
  chips: composerReferenceChips,
  continuationContext: activeContinuation,
});
await sessionActions.sendPrompt(prompt, {
  referenceContext,
});
setUploadedReferences([]);
```

On failure before submission, keep the draft and uploaded references. On new chat, clear `uploadedReferences`, `uploadError`, pending continuation, current error, and set the tab back to chat.

- [ ] **Step 5: Pass upload callbacks to composer**

In the `CanvasAgentComposer` usage:

```tsx
<CanvasAgentComposer
  draftValue={composerDraft}
  models={modelOptions}
  onChangeDraft={setComposerDraft}
  onRemoveReference={(chip) => {
    setUploadedReferences((refs) => refs.filter((item) => item.id !== chip.id));
  }}
  onSend={async (prompt) => { /* send with reference context */ }}
  onUploadError={setUploadError}
  onUploadReferences={(chips) => {
    setUploadedReferences((refs) => [...refs, ...chips].slice(0, 8));
  }}
  projectId={backendProjectId}
  referenceChips={composerReferenceChips}
  workspaceState={sessionActions.workspaceState}
/>
```

Render upload error as a compact recoverable row above the composer:

```tsx
{uploadError ? (
  <div role="alert" style={{ color: "#fecaca", fontSize: 12, padding: "0 16px 8px" }}>
    {uploadError}
  </div>
) : null}
```

- [ ] **Step 6: Run session and panel tests**

Run:

```bash
npm test -- src/flowCanvas/agent/useCanvasAgentSession.test.tsx src/flowCanvas/agent/CanvasAgentPanel.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/flowCanvas/agent/CanvasAgentPanel.tsx src/flowCanvas/agent/useCanvasAgentSession.ts src/flowCanvas/agent/useCanvasAgentSession.test.tsx src/flowCanvas/agent/CanvasAgentPanel.test.tsx
git commit -m "feat: send agent reference context from panel"
```

---

## Task 7: Rebuild Shell Toolbar To Match The Sketch

**Files:**
- Modify: `D:\tapnow-flow\src\flowCanvas\agent\CanvasAgentWorkspaceShell.tsx`
- Modify: `D:\tapnow-flow\src\flowCanvas\agent\CanvasAgentWorkspaceShell.test.tsx`
- Modify: `D:\tapnow-flow\src\flowCanvas\agent\useAgentWorkspacePanel.ts`

- [ ] **Step 1: Write failing toolbar order test**

Update `D:\tapnow-flow\src\flowCanvas\agent\CanvasAgentWorkspaceShell.test.tsx`:

```tsx
it("renders hand-drawn toolbar order: logs, chat, history, new chat, collapse", () => {
  render(
    <CanvasAgentWorkspaceShell
      activeTab="chat"
      busy={false}
      onChangeTab={vi.fn()}
      onCollapse={vi.fn()}
      onNewChat={vi.fn()}
    >
      <div>Body</div>
    </CanvasAgentWorkspaceShell>,
  );

  const toolbar = screen.getByTestId("agent-shell-toolbar");
  expect(
    Array.from(toolbar.querySelectorAll("button")).map((button) => button.getAttribute("aria-label")),
  ).toEqual(["日志", "对话", "历史", "新对话", "收起 Agent"]);
  expect(screen.queryByRole("button", { name: "Connections" })).toBeNull();
});
```

- [ ] **Step 2: Run failing shell test**

Run:

```bash
npm test -- src/flowCanvas/agent/CanvasAgentWorkspaceShell.test.tsx
```

Expected: FAIL because current toolbar order is new/collapse plus secondary utility nav and still includes connections.

- [ ] **Step 3: Implement toolbar**

In `D:\tapnow-flow\src\flowCanvas\agent\CanvasAgentWorkspaceShell.tsx`, replace the toolbar model with:

```ts
const toolbarItems: Array<{
  icon: React.ElementType;
  label: string;
  onClickKind: "tab" | "new" | "collapse";
  tab?: AgentWorkspaceTab;
}> = [
  { icon: ScrollText, label: "日志", onClickKind: "tab", tab: "logs" },
  { icon: MessageCircle, label: "对话", onClickKind: "tab", tab: "chat" },
  { icon: History, label: "历史", onClickKind: "tab", tab: "history" },
  { icon: Plus, label: "新对话", onClickKind: "new" },
  { icon: PanelRightClose, label: "收起 Agent", onClickKind: "collapse" },
];
```

Render them inside:

```tsx
<div data-testid="agent-shell-toolbar" style={{ alignItems: "center", display: "flex", gap: 8 }}>
  {toolbarItems.map((item) => {
    const active = item.tab ? props.activeTab === item.tab : false;
    const Icon = item.icon;
    return (
      <button
        aria-label={item.label}
        key={item.label}
        onClick={() => {
          if (item.onClickKind === "new") props.onNewChat();
          else if (item.onClickKind === "collapse") props.onCollapse();
          else if (item.tab) props.onChangeTab(item.tab);
        }}
        style={iconButtonStyle(active)}
        title={item.label}
        type="button"
      >
        <Icon size={16} />
      </button>
    );
  })}
</div>
```

Remove `connections` from `AgentWorkspaceTab` for primary UI if it is only used by the old panel. If keeping the type for backward compatibility, do not render it in the shell toolbar.

- [ ] **Step 4: Ensure shell has three vertical regions**

Keep the layout as:

```ts
gridTemplateRows: "auto 1fr",
```

and keep child panel responsible for:

```ts
gridTemplateRows: "1fr auto auto"
```

so the central conversation scrolls and the composer stays docked.

- [ ] **Step 5: Run shell tests**

Run:

```bash
npm test -- src/flowCanvas/agent/CanvasAgentWorkspaceShell.test.tsx src/flowCanvas/agent/CanvasAgentPanel.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/flowCanvas/agent/CanvasAgentWorkspaceShell.tsx src/flowCanvas/agent/CanvasAgentWorkspaceShell.test.tsx src/flowCanvas/agent/useAgentWorkspacePanel.ts
git commit -m "refactor: align agent shell toolbar with sketch"
```

---

## Task 8: Polish Conversation Stream, Result Cards, And Chinese Copy

**Files:**
- Modify: `D:\tapnow-flow\src\flowCanvas\agent\CanvasAgentConversationView.tsx`
- Modify: `D:\tapnow-flow\src\flowCanvas\agent\CanvasAgentTimelineItem.tsx`
- Modify: `D:\tapnow-flow\src\flowCanvas\agent\CanvasAgentResultCard.tsx`
- Modify: `D:\tapnow-flow\src\flowCanvas\agent\agentWorkspaceTimeline.ts`
- Modify: `D:\tapnow-flow\src\flowCanvas\agent\canvasAgentStateMachine.ts`
- Modify: `D:\tapnow-flow\src\flowCanvas\agent\CanvasAgentConversationView.test.tsx`
- Modify: `D:\tapnow-flow\src\flowCanvas\agent\CanvasAgentResultCard.test.tsx`
- Modify: `D:\tapnow-flow\src\flowCanvas\agent\agentWorkspaceTimeline.test.ts`

- [ ] **Step 1: Write failing copy and result-card tests**

In `D:\tapnow-flow\src\flowCanvas\agent\CanvasAgentResultCard.test.tsx`, assert clean labels:

```tsx
it("renders clean Chinese result actions and thumbnail frame", () => {
  render(
    <CanvasAgentResultCard
      assets={[
        {
          assetId: "asset-1",
          height: 1024,
          kind: "image",
          label: "生成图 1",
          previewUrl: "https://signed.example/asset-1",
          promptSummary: "",
          refId: "round-1-image-1",
          width: 1024,
        },
      ]}
      onContinueFromAsset={vi.fn()}
      onPlaceAssets={vi.fn()}
    />,
  );

  expect(screen.getByText("生成结果")).toBeTruthy();
  expect(screen.getByText("1024 × 1024")).toBeTruthy();
  expect(screen.getByRole("button", { name: "放到画布" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "继续编辑" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "做变体" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "做海报" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "生成对比图" })).toBeTruthy();
  expect(document.body.textContent).not.toMatch(/[�]|鍙|鐢|绾|缁|鏂/);
});
```

In `D:\tapnow-flow\src\flowCanvas\agent\CanvasAgentConversationView.test.tsx`, assert compact empty state and no raw replay debug block:

```tsx
it("keeps the chat stream compact and free of raw replay debug blocks", () => {
  render(<CanvasAgentConversationView busy={false} items={[]} />);
  expect(screen.getByText("告诉 Agent 你想在画布上完成什么。")).toBeTruthy();
  expect(screen.queryByText("Replay Events")).toBeNull();
  expect(document.body.textContent).not.toMatch(/[�]|鍙|鐢|绾|缁|鏂/);
});
```

- [ ] **Step 2: Run failing UI copy tests**

Run:

```bash
npm test -- src/flowCanvas/agent/CanvasAgentConversationView.test.tsx src/flowCanvas/agent/CanvasAgentResultCard.test.tsx src/flowCanvas/agent/agentWorkspaceTimeline.test.ts
```

Expected: FAIL because current files contain mojibake labels and result cards have no thumbnail/dimension rendering.

- [ ] **Step 3: Update result card**

In `D:\tapnow-flow\src\flowCanvas\agent\CanvasAgentResultCard.tsx`, replace action labels:

```ts
const continuationActions: Array<{ action: CanvasAgentContinuationAction; label: string }> = [
  { action: "continue-edit", label: "继续编辑" },
  { action: "make-variant", label: "做变体" },
  { action: "make-poster", label: "做海报" },
  { action: "compare", label: "生成对比图" },
];
```

Render thumbnail and dimensions:

```tsx
{asset.previewUrl ? (
  <img alt={asset.label} src={asset.previewUrl} style={{ borderRadius: 10, height: 56, objectFit: "cover", width: 56 }} />
) : (
  <div aria-label="结果缩略图占位" style={{ borderRadius: 10, height: 56, width: 56 }} />
)}
{asset.width && asset.height ? (
  <div style={{ color: "rgba(148,163,184,0.9)", fontSize: 11 }}>
    {asset.width} × {asset.height}
  </div>
) : null}
```

Use clean status copy:

```tsx
{alreadyPlaced ? "已放入画布" : "待放入画布"}
```

- [ ] **Step 4: Update conversation and timeline copy**

Replace mojibake strings across these files with clean short labels:

```ts
"用户"
"Agent"
"第 N 轮"
"正在读取画布"
"正在规划下一步"
"正在提交生成任务"
"正在等待模型结果"
"Agent 执行失败"
"告诉 Agent 你想在画布上完成什么。"
```

Keep the empty state to one compact block and do not add marketing cards or feature explanation text.

- [ ] **Step 5: Update state labels**

In `D:\tapnow-flow\src\flowCanvas\agent\canvasAgentStateMachine.ts`, make labels clean and short:

```ts
export const CANVAS_AGENT_STATE_LABELS: Record<CanvasAgentWorkspaceState, string> = {
  idle: "就绪",
  reading_context: "读取画布",
  thinking: "规划中",
  plan_ready: "等待确认",
  awaiting_canvas_confirm: "确认画布操作",
  applying_canvas_ops: "更新画布",
  awaiting_credit_confirm: "确认积分",
  running_workflow: "生成中",
  asset_ready: "结果已生成",
  failed: "出错",
  replay: "查看历史",
};
```

- [ ] **Step 6: Run UI copy tests**

Run:

```bash
npm test -- src/flowCanvas/agent/CanvasAgentConversationView.test.tsx src/flowCanvas/agent/CanvasAgentResultCard.test.tsx src/flowCanvas/agent/agentWorkspaceTimeline.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/flowCanvas/agent/CanvasAgentConversationView.tsx src/flowCanvas/agent/CanvasAgentTimelineItem.tsx src/flowCanvas/agent/CanvasAgentResultCard.tsx src/flowCanvas/agent/agentWorkspaceTimeline.ts src/flowCanvas/agent/canvasAgentStateMachine.ts src/flowCanvas/agent/CanvasAgentConversationView.test.tsx src/flowCanvas/agent/CanvasAgentResultCard.test.tsx src/flowCanvas/agent/agentWorkspaceTimeline.test.ts
git commit -m "refactor: polish agent chat stream and result cards"
```

---

## Task 9: End-To-End Verification, Records, And Manual QA

**Files:**
- Modify: `D:\tapnow-flow\PROJECT_RECORD.md`
- Modify: `D:\tapnow-flow\docs\CODEX_HANDOFF.md` only if Agent current status changes materially.

- [ ] **Step 1: Run focused frontend Agent suite**

Run:

```bash
npm test -- src/flowCanvas/agent/CanvasAgentWorkspaceShell.test.tsx src/flowCanvas/agent/CanvasAgentComposer.test.tsx src/flowCanvas/agent/CanvasAgentReferenceUploadButton.test.tsx src/flowCanvas/agent/CanvasAgentPanel.test.tsx src/flowCanvas/agent/CanvasAgentConversationView.test.tsx src/flowCanvas/agent/CanvasAgentResultCard.test.tsx src/flowCanvas/agent/agentWorkspaceTimeline.test.ts src/flowCanvas/agent/useCanvasAgentSession.test.tsx src/flowCanvas/agent/canvasAgentApi.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run focused backend Agent suite**

Run:

```bash
npm run test --workspace @aigc-flow/api -- agent-schemas.test.ts agent-reference-context.test.ts agent-executor.test.ts agent-tool-runner.test.ts agent-tool-schemas.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run full build**

Run:

```bash
npm run build
```

Expected: PASS. If it fails because of unrelated pre-existing TypeScript or Vite issues, capture the exact command output and identify the file path and error in the final handoff.

- [ ] **Step 4: Run manual QA locally**

Start local services when infrastructure is available:

```bash
npm run dev:infra
npm run db:migrate
npm run dev:api
npm run dev:worker
npm run dev
```

Manual flow:

1. Open `http://localhost:5188`.
2. Log in and open a project at `/projects/:projectId`.
3. Open the Agent panel.
4. Confirm the top toolbar order is logs, chat, history, new chat, collapse.
5. Confirm the central area is the conversation stream and the bottom composer is docked.
6. Send a prompt without references.
7. Upload one image reference through the plus button.
8. Send `参考这张图做一张电影海报`.
9. Confirm the network payload includes `referenceContext.items[].assetId` and `refId`, but does not include `previewUrl`, signed URLs, `blob:`, `data:`, or base64.
10. Confirm backend logs/tool input use resolved `referenceAssetIds`, not raw model-invented values.
11. Confirm generated output appears as an inline result card.
12. Click `放到画布`.
13. Click `继续编辑` from the result card and confirm the next turn uses continuation refs.
14. Open history and return to the conversation.
15. Open logs and confirm no provider/base URL/API key/upstream model/Authorization data is visible.

- [ ] **Step 5: Negative QA**

Verify these cases:

1. Uploading a text file shows `只能上传图片作为参考图。` and does not call asset upload.
2. Upload failure keeps the prompt draft and reference state.
3. A tool call with `referenceRefs: ["unknown-ref"]` fails with `AGENT_REFERENCE_NOT_FOUND`.
4. A generated node stores `assetId` as source of truth and does not store base64/data/blob/signed URLs.
5. New chat clears uploaded references, pending continuation, and current error state.

- [ ] **Step 6: Update project record**

Add a concise entry to `D:\tapnow-flow\PROJECT_RECORD.md`:

```md
## 2026-07-02 - Agent Panel Handdrawn V1

- Rebuilt the creator Agent panel around the approved hand-drawn right-side workspace: icon toolbar, chat stream, prompt-first composer, upload references, and inline result cards.
- Added structured Agent reference context from frontend to backend and resolved model-facing `refId` values to validated asset IDs before workflow launch.
- Kept generated/reference media on the v2 asset path; no base64/blob/data/signed URL is authoritative in Agent or canvas payloads.
- Validation:
  - `npm test -- src/flowCanvas/agent/CanvasAgentWorkspaceShell.test.tsx src/flowCanvas/agent/CanvasAgentComposer.test.tsx src/flowCanvas/agent/CanvasAgentReferenceUploadButton.test.tsx src/flowCanvas/agent/CanvasAgentPanel.test.tsx src/flowCanvas/agent/CanvasAgentConversationView.test.tsx src/flowCanvas/agent/CanvasAgentResultCard.test.tsx src/flowCanvas/agent/agentWorkspaceTimeline.test.ts src/flowCanvas/agent/useCanvasAgentSession.test.tsx src/flowCanvas/agent/canvasAgentApi.test.ts` passed on 2026-07-02.
  - `npm run test --workspace @aigc-flow/api -- agent-schemas.test.ts agent-reference-context.test.ts agent-executor.test.ts agent-tool-runner.test.ts agent-tool-schemas.test.ts` passed on 2026-07-02.
  - `npm run build` passed on 2026-07-02.
```

If any command does not pass during execution, replace the corresponding `passed` line with the exact failure and the already-validated commands before committing.

- [ ] **Step 7: Commit docs**

```bash
git add PROJECT_RECORD.md docs/CODEX_HANDOFF.md
git commit -m "docs: record agent panel handdrawn v1"
```

Only include `docs/CODEX_HANDOFF.md` in the commit if it was actually modified.

---

## Self-Review Checklist

- Spec coverage:
  - Right docked hand sketch shell: Task 7.
  - Chat stream and bottom composer: Tasks 5, 7, 8.
  - Upload references through v2 assets: Task 5.
  - Structured frontend/backend reference context: Tasks 1, 2.
  - Backend `refId` to `assetId` resolution: Tasks 3, 4.
  - Inline result cards and continuation actions: Task 8.
  - History/log/new/collapse toolbar behavior: Tasks 6, 7, 9.
  - No provider/secrets/signed URL leakage: Tasks 2, 3, 8, 9.

- Placeholder scan:
  - This plan does not use `TBD`, `TODO`, or "implement later".
  - Every task includes specific files, tests, commands, and expected outcomes.

- Type consistency:
  - Frontend sends `AgentReferenceContext`.
  - Backend accepts `AgentReferenceContextInput`.
  - Tool runner receives `referenceContext` and `previousResults`.
  - Model-facing values stay in `referenceRefs`.
  - Workflow-facing values become `referenceAssetIds`.

## Recommended Execution Order

1. Task 1: frontend payload types.
2. Task 2: backend schema and executor context.
3. Task 3: resolver and tool runner.
4. Task 4: validation and approval persistence.
5. Task 5: upload button and composer.
6. Task 6: panel state wiring.
7. Task 7: shell toolbar.
8. Task 8: conversation/result polish.
9. Task 9: verification and records.

The backend reference chain should be completed before UI upload is exposed, so a user cannot create references that the executor treats unsafely.
