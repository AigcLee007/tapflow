# Text Node Multimodal Image Input Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver up to three ordered upstream image assets to an explicitly visual-capable Text Node model, without persisting temporary media data or falling back to a text-only call on an image-input error.

**Architecture:** Extend the AI Gateway text request with ordered `inputAssets`; keep message text provider-neutral. The API validates deterministic topology/capability errors before billing reserve, while Worker resolves tenant-owned assets and hydrates short-lived URLs immediately before calling the text runtime. Provider adapters map the same contract to their native GPT, Responses, Gemini, and Claude payloads.

**Tech Stack:** TypeScript, Vitest, Fastify, PostgreSQL/RLS, BullMQ Worker, `@aigc-flow/ai-gateway-core`, Vite/React, existing S3-compatible asset store.

---

## File map

| Path | Responsibility |
| --- | --- |
| `packages/ai-gateway-core/src/types.ts` | Add ordered image assets to text-generation requests. |
| `packages/ai-gateway-core/src/text-generation-contract.ts` | Parse visual text capabilities and fail-closed image-input validation. |
| `packages/ai-gateway-core/src/openai-compatible-text-adapter.ts` | Render the contract as Chat Completions or Responses image blocks. |
| `packages/ai-gateway-core/src/aittco-text-relay-adapter.ts` | Render the contract as Aittco GPT, Gemini, and Claude protocol payloads. |
| `packages/ai-gateway-core/src/plugins/plugin-manifest.ts` | Type image-input text capabilities. |
| `packages/ai-gateway-core/src/plugins/manifests/aittco-text-relay.ts` | Publish only relay models verified to support image input. |
| `apps/worker/src/workflow-runtime/service.ts` | Extract ordered upstream image assets, validate, hydrate, and submit them for text generation. |
| `apps/api/src/modules/workflow-runs/workflow-runs.service.ts` | Reject deterministic image/capability errors before reserve/enqueue. |
| `apps/api/src/modules/ai-gateway/ai-gateway.service.ts` | Safely expose text image capabilities in runtime route catalog. |
| `src/services/v2AiGatewayAdminApi.ts` and model catalog service types | Carry safe capability fields to the client. |
| `src/flowCanvas/text/textModelCatalog.ts` | Preserve text-route image capability metadata in route options. |
| `src/flowCanvas/nodes/FlowNodes.tsx` | Disable incompatible text model/line menu items when upstream images exist. |
| `src/flowCanvas/runtime/v2WorkflowRunner.ts` | Map structured image-input error codes into creator-readable node errors. |
| `packages/db/migrations/000068_text_route_image_input_capabilities.sql` | Backfill verified installed Aittco route/model capabilities without modifying keys, credentials, pricing, or status. |
| `PROJECT_RECORD.md` | Record implementation, validation, staging, and deployment outcome. |

### Task 1: Define the provider-neutral text image contract

**Files:**
- Modify: `packages/ai-gateway-core/src/types.ts:3-27`
- Create: `packages/ai-gateway-core/src/text-generation-contract.ts`
- Modify: `packages/ai-gateway-core/src/index.ts`
- Test: `packages/ai-gateway-core/test/text-generation-contract.test.ts`

- [ ] **Step 1: Write failing contract tests**

Create `packages/ai-gateway-core/test/text-generation-contract.test.ts` with the desired public API. It must prove absent capability is text-only, supported MIME types are normalized, and a fourth image is rejected without truncation.

```ts
import { describe, expect, test } from "vitest";
import {
  resolveTextGenerationCapabilities,
  validateTextImageInput,
} from "../src/text-generation-contract.js";

describe("text image input contract", () => {
  test("fails closed when image capability is absent", () => {
    expect(resolveTextGenerationCapabilities({}, {})).toEqual({
      maxImages: 0,
      supportedImageMimeTypes: [],
      supportsImageInput: false,
    });
  });

  test("uses the lower route/model maximum and normalized MIME intersection", () => {
    expect(resolveTextGenerationCapabilities(
      { maxImages: 3, supportedImageMimeTypes: ["image/png", "image/webp"], supportsImageInput: true },
      { maxImages: 2, supportedImageMimeTypes: ["image/webp", "image/jpeg"], supportsImageInput: true },
    )).toEqual({
      maxImages: 2,
      supportedImageMimeTypes: ["image/webp"],
      supportsImageInput: true,
    });
  });

  test("rejects a fourth valid image instead of truncating it", () => {
    const issue = validateTextImageInput({
      capabilities: { maxImages: 3, supportedImageMimeTypes: ["image/png"], supportsImageInput: true },
      inputAssets: ["a", "b", "c", "d"].map((assetId) => ({ assetId, kind: "image", mimeType: "image/png" })),
    });
    expect(issue).toMatchObject({ code: "TEXT_IMAGE_INPUT_LIMIT_EXCEEDED" });
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm run test --workspace @aigc-flow/ai-gateway-core -- text-generation-contract.test.ts
```

Expected: FAIL because `text-generation-contract.js` and its exported helpers do not yet exist.

- [ ] **Step 3: Add the contract types and validator**

In `types.ts`, add `inputAssets?: AssetReferenceInput[] | null` to `TextGenerationRequest`. Create the contract module with these exact stable types and behavior:

```ts
export const TEXT_IMAGE_INPUT_ERROR_CODES = {
  ASSET_NOT_FOUND: "TEXT_IMAGE_ASSET_NOT_FOUND",
  LIMIT_EXCEEDED: "TEXT_IMAGE_INPUT_LIMIT_EXCEEDED",
  MODEL_UNSUPPORTED: "TEXT_MODEL_IMAGE_INPUT_UNSUPPORTED",
  TYPE_UNSUPPORTED: "TEXT_IMAGE_TYPE_UNSUPPORTED",
  URL_HYDRATION_FAILED: "TEXT_IMAGE_URL_HYDRATION_FAILED",
} as const;

export type TextGenerationCapabilities = {
  maxImages: number;
  supportedImageMimeTypes: string[];
  supportsImageInput: boolean;
};

export type TextImageInputIssue = {
  code: typeof TEXT_IMAGE_INPUT_ERROR_CODES[keyof typeof TEXT_IMAGE_INPUT_ERROR_CODES];
  message: string;
  path: string;
};
```

`resolveTextGenerationCapabilities(modelCapabilities, routeCapabilities)` must:

- read only `supportsImageInput`, `maxImages`, and `supportedImageMimeTypes`;
- use `false`, `0`, and `[]` when either side does not explicitly support image input;
- cap the effective max at `3`;
- use a case-normalized MIME intersection when both sides declare values, otherwise use the declaring side's MIME list;
- reject empty/invalid MIME values.

`validateTextImageInput` must return `null` for no input images, return `TEXT_MODEL_IMAGE_INPUT_UNSUPPORTED` when images exist but effective support is false, then check count, `kind === "image"`, nonempty `assetId`, and allowed MIME in that order. Export the module from `index.ts`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
npm run test --workspace @aigc-flow/ai-gateway-core -- text-generation-contract.test.ts
```

Expected: PASS with all three contract tests green.

- [ ] **Step 5: Commit the contract**

```bash
git add packages/ai-gateway-core/src/types.ts packages/ai-gateway-core/src/text-generation-contract.ts packages/ai-gateway-core/src/index.ts packages/ai-gateway-core/test/text-generation-contract.test.ts
git commit -m "feat(ai-gateway): add text image input contract"
```

### Task 2: Map image assets to OpenAI-compatible text protocols

**Files:**
- Modify: `packages/ai-gateway-core/src/openai-compatible-text-adapter.ts:672-835`
- Test: `packages/ai-gateway-core/test/runtime.test.ts`

- [ ] **Step 1: Write failing Chat Completions and Responses tests**

Add tests beside the existing OpenAI-compatible text adapter tests. Use a fake `fetchImplementation`, call `generateText`, and assert exactly these image-bearing user payload fragments:

```ts
expect(JSON.parse(String(fetchImplementation.mock.calls[0]?.[1]?.body))).toMatchObject({
  messages: [{
    content: [
      { text: "Describe the connected images", type: "text" },
      { image_url: { url: "https://signed.test/first.png" }, type: "image_url" },
      { image_url: { url: "https://signed.test/second.webp" }, type: "image_url" },
    ],
    role: "user",
  }],
});
```

For a route configured with Responses mode, assert `input` contains `{ type: "input_text", text: ... }` followed by ordered `{ type: "input_image", image_url: ... }` blocks. Add a pure-text regression asserting the pre-existing string `content` shape is unchanged.

- [ ] **Step 2: Run the focused adapter tests and verify RED**

Run:

```bash
npm run test --workspace @aigc-flow/ai-gateway-core -- runtime.test.ts
```

Expected: new multimodal assertions FAIL because `generateText` serializes `request.messages` unchanged.

- [ ] **Step 3: Implement a redacted message builder**

Add private helpers that:

- collect only image `inputAssets` in request order;
- read a hydrated URL only from in-memory `metadata.url`, `metadata.signedUrl`, or `metadata.publicUrl`;
- throw `AiGatewayError` using `TEXT_IMAGE_URL_HYDRATION_FAILED` if a declared input asset has no usable URL;
- replace the final `user` message string with content blocks only when images exist;
- retain system and assistant message strings and all pure-text payloads exactly as before.

For Chat Completions use `text`/`image_url`; for Responses use `input_text`/`input_image`. Keep `providerRequest.body` safe for persistence by replacing image URL values with `{ imageInputCount, imageMimeTypes }` in the logged summary, while sending the real body only to `fetch`.

- [ ] **Step 4: Run the focused adapter tests and verify GREEN**

Run:

```bash
npm run test --workspace @aigc-flow/ai-gateway-core -- runtime.test.ts
```

Expected: existing OpenAI-compatible tests and new Chat/Responses multimodal tests PASS.

- [ ] **Step 5: Commit the adapter mapping**

```bash
git add packages/ai-gateway-core/src/openai-compatible-text-adapter.ts packages/ai-gateway-core/test/runtime.test.ts
git commit -m "feat(ai-gateway): map text image inputs for openai routes"
```

### Task 3: Map image assets to Aittco relay GPT, Gemini, and Claude protocols

**Files:**
- Modify: `packages/ai-gateway-core/src/aittco-text-relay-adapter.ts:57-370`
- Test: `packages/ai-gateway-core/test/aittco-text-relay-adapter.test.ts`

- [ ] **Step 1: Write failing protocol-specific adapter tests**

Add one test per Aittco protocol using a request with a user message and two hydrated image assets. Assert order and exact protocol blocks:

```ts
// chat-completions
expect(payload.messages.at(-1)).toEqual({
  role: "user",
  content: [
    { type: "text", text: "Create a short video prompt" },
    { type: "image_url", image_url: { url: "https://signed.test/1.png" } },
    { type: "image_url", image_url: { url: "https://signed.test/2.png" } },
  ],
});

// Gemini
expect(payload.contents.at(-1)?.parts).toEqual([
  { text: "Create a short video prompt" },
  { fileData: { fileUri: "https://signed.test/1.png", mimeType: "image/png" } },
  { fileData: { fileUri: "https://signed.test/2.png", mimeType: "image/png" } },
]);
```

For Claude, assert `content` has a text block then ordered `{ type: "image", source: { type: "url", url: ... } }` blocks. Add an assertion that `result.providerRequest` has no signed URL and exposes only `imageInputCount: 2` and `imageMimeTypes`.

- [ ] **Step 2: Run the focused Aittco adapter suite and verify RED**

Run:

```bash
npm run test --workspace @aigc-flow/ai-gateway-core -- aittco-text-relay-adapter.test.ts
```

Expected: new assertions FAIL because `buildPayload` emits only text strings and diagnostics do not include redacted image metadata.

- [ ] **Step 3: Implement protocol-local multimodal builders**

Add a shared private `resolveImageInputs(request)` that reads only ordered hydrated image assets and returns `{ mimeType, url }` values. Do not fetch or base64-encode in the initial relay integration: the approved Aittco relay contract uses signed HTTPS URLs. Build protocol payloads as follows:

- `chat-completions`: final user message `content` is text then `image_url` blocks;
- `responses`: final user message `content` is `input_text` then `input_image` blocks;
- `gemini`: final user content `parts` is text then `fileData` blocks with `fileUri` and `mimeType`;
- `claude`: final user content is text then `image` URL-source blocks.

Change the `TextMessage`-typed internal payload variables to local provider payload types rather than widening the public text-message type. Add `imageInputCount` and `imageMimeTypes` to the safe `providerRequest`, never a URL or raw payload.

- [ ] **Step 4: Run the focused Aittco adapter suite and verify GREEN**

Run:

```bash
npm run test --workspace @aigc-flow/ai-gateway-core -- aittco-text-relay-adapter.test.ts
```

Expected: all existing protocol/error/redaction tests and new multimodal tests PASS.

- [ ] **Step 5: Commit the Aittco mappings**

```bash
git add packages/ai-gateway-core/src/aittco-text-relay-adapter.ts packages/ai-gateway-core/test/aittco-text-relay-adapter.test.ts
git commit -m "feat(ai-gateway): add relay text image inputs"
```

### Task 4: Declare, persist, and publish visual text route capabilities

**Files:**
- Modify: `packages/ai-gateway-core/src/plugins/plugin-manifest.ts:34-58`
- Modify: `packages/ai-gateway-core/src/plugins/manifests/aittco-text-relay.ts`
- Modify: `apps/api/src/modules/ai-gateway/ai-gateway.service.ts:451-467`
- Modify: `src/services/v2AiGatewayAdminApi.ts`
- Modify: `src/services/v2AiModelCatalogApi.ts`
- Create: `packages/db/migrations/000068_text_route_image_input_capabilities.sql`
- Test: `packages/ai-gateway-core/test/plugin-registry.test.ts`
- Test: `apps/api/test/ai-plugins.service.test.ts`
- Test: `apps/api/test/ai-model-catalog.test.ts`

- [ ] **Step 1: Write failing manifest/catalog/migration tests**

Add a plugin registry assertion that every model and route in `aittco.text-relay` marked visual declares the same safe capability object:

```ts
{
  maxImages: 3,
  supportedImageMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  supportsImageInput: true,
}
```

In the plugin service integration test, install `aittco.text-relay` and assert the persisted `ai_models.capabilities` and `ai_routes.request_config->capabilities` include that object for verified models/routes. In the catalog test, assert public runtime/model-catalog JSON exposes those three fields and no `baseUrl`, `credentialId`, `signedUrl`, `url`, or object key.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npm run test --workspace @aigc-flow/ai-gateway-core -- plugin-registry.test.ts
npm run test --workspace @aigc-flow/api -- ai-plugins.service.test.ts ai-model-catalog.test.ts
```

Expected: capability assertions FAIL because text plugin and public capability merger do not yet publish image support.

- [ ] **Step 3: Implement typed capability publication and migration**

Extend `AiPluginModelManifest["capabilities"]` with optional `supportsImageInput`, `maxImages`, and `supportedImageMimeTypes`. In `aittco-text-relay.ts`, set the capability on only upstream models verified through the relay test process and copy it into the corresponding route `requestConfig.capabilities`; raise the plugin version to `1.1.0`.

Add a strict safe capability reader in `ai-gateway.service.ts`. It must return only boolean support, positive integer max clamped to three, and valid MIME strings; merge model and route support by intersection and max by minimum. Keep existing video/image capability output unchanged.

Write migration `000068_text_route_image_input_capabilities.sql` using `jsonb_set` to update only the verified `aittco-text-relay` model keys and their matching `text.*` route keys. It must add capability keys without replacing the containing `capabilities` object, and its `WHERE` clauses must join the provider by key and preserve every other route/model column.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
npm run test --workspace @aigc-flow/ai-gateway-core -- plugin-registry.test.ts
npm run test --workspace @aigc-flow/api -- ai-plugins.service.test.ts ai-model-catalog.test.ts
```

Expected: manifest persistence and safe catalog exposure tests PASS.

- [ ] **Step 5: Commit capability persistence**

```bash
git add packages/ai-gateway-core/src/plugins/plugin-manifest.ts packages/ai-gateway-core/src/plugins/manifests/aittco-text-relay.ts apps/api/src/modules/ai-gateway/ai-gateway.service.ts src/services/v2AiGatewayAdminApi.ts src/services/v2AiModelCatalogApi.ts packages/db/migrations/000068_text_route_image_input_capabilities.sql packages/ai-gateway-core/test/plugin-registry.test.ts apps/api/test/ai-plugins.service.test.ts apps/api/test/ai-model-catalog.test.ts
git commit -m "feat(ai-gateway): publish text image capabilities"
```

### Task 5: Deliver ordered hydrated image assets through Worker text execution

**Files:**
- Modify: `apps/worker/src/workflow-runtime/service.ts:344-545,2535-2558,3236-3290`
- Test: `apps/worker/test/worker.test.ts`

- [ ] **Step 1: Write failing Worker tests**

Add database-backed `text.generate` workflow tests that seed two upstream image nodes with assets and a target Text Node whose `inputOrder` reverses dependency order. Capture the request passed to `textGenerationRuntime.generateText` and assert:

```ts
expect(request.inputAssets?.map((asset) => asset.assetId)).toEqual([
  "asset-second", "asset-first",
]);
expect(request.inputAssets?.map((asset) => asset.metadata?.url)).toEqual([
  expect.stringMatching(/^memory:/),
  expect.stringMatching(/^memory:/),
]);
```

Add independent tests for four images, a video asset connected to Text Node, a missing tenant asset, and `storageProvider.createPresignedGetUrl` failure. Each must assert `generateText` is not called and the node error code equals the matching `TEXT_IMAGE_*` error. Add a pure-text regression asserting `inputAssets` is `undefined` and message content is unchanged.

- [ ] **Step 2: Run the focused Worker test and verify RED**

Run:

```bash
npm run test --workspace @aigc-flow/worker -- worker.test.ts
```

Expected: ordered image request assertions FAIL because `buildTextMessages` presently accepts only upstream outputs and emits string messages.

- [ ] **Step 3: Implement ordered extraction, validation, and hydration**

Refactor `buildTextMessages` to receive both ordered dependency outputs and the target route capabilities. Reuse `getDependencyOutputsByNodeIdFromRuntimeGraph` and `getOrderedDependencyIds` so the extracted image `AssetReferenceInput[]` follows `inputOrder` rather than raw database execution order. Reuse `extractAssetInputs` only after filtering to `kind === "image"`; do not serialize images as `JSON.stringify(value)` in upstream text.

Before `textGenerationRuntime.generateText`:

1. resolve effective text capability from the selected route/model runtime context;
2. call `validateTextImageInput`;
3. call a text-specific wrapper around `hydrateInputAssetUrls` that maps missing asset, wrong kind/MIME, and signed URL failures to the stable `TEXT_IMAGE_*` codes;
4. invoke the runtime with `{ messages, inputAssets }` only when the ordered image list is nonempty.

The wrapper may reuse storage lookup and signing internals, but must not write `bucket`, `objectKey`, `url`, `signedUrl`, or base64 into `outputJson`, logs, or database. Logger fields may contain only count, MIME list, route key, model key, and node/workflow IDs.

- [ ] **Step 4: Run the focused Worker test and verify GREEN**

Run:

```bash
npm run test --workspace @aigc-flow/worker -- worker.test.ts
```

Expected: ordered two-image, limit, MIME, missing-asset, hydration-failure, and pure-text tests PASS with the existing Worker suite.

- [ ] **Step 5: Commit Worker text asset delivery**

```bash
git add apps/worker/src/workflow-runtime/service.ts apps/worker/test/worker.test.ts
git commit -m "feat(worker): pass ordered images to text generation"
```

### Task 6: Fail deterministic runs before billing reserve and queue enqueue

**Files:**
- Modify: `apps/api/src/modules/workflow-runs/workflow-runs.service.ts`
- Test: `apps/api/test/workflow-runs.test.ts`

- [ ] **Step 1: Write failing API preflight tests**

Create target-node run requests for a Text Node connected to four image nodes and one connected to an image with an inactive/nonvisual text route. Assert the API response is `422` with `TEXT_IMAGE_INPUT_LIMIT_EXCEEDED` or `TEXT_MODEL_IMAGE_INPUT_UNSUPPORTED`; assert no `billing_wallet_ledger`, `usage_events`, `workflow_runs`, or node queue job row is created.

```ts
expect(response.statusCode).toBe(422);
expect(response.json()).toMatchObject({ error: { code: "TEXT_IMAGE_INPUT_LIMIT_EXCEEDED" } });
expect(await countBillingState(pool, tenantId, userId)).toEqual({ ledgerEntries: 0, usageEvents: 0 });
expect(fakeQueue.jobs).toHaveLength(0);
```

- [ ] **Step 2: Run the focused API test and verify RED**

Run:

```bash
npm run test --workspace @aigc-flow/api -- workflow-runs.test.ts
```

Expected: tests FAIL because workflow creation currently reserves/queues text nodes without inspecting image capability or count.

- [ ] **Step 3: Add API-side preflight with no asset URL hydration**

At target-node runtime graph compilation/validation, calculate ordered upstream image candidates from `inputOrder` and dependencies, read only safe route/model capability JSON, and call the shared contract validator. Do not sign URLs, fetch object storage, or rely on image preview fields in API preflight.

Run this check before `resolveNodePricing`, reserve, `INSERT workflow_runs`, and enqueue. Return `WorkflowRunsApiError(422, code, message)` using the shared stable code/message. Leave tenant ownership and final MIME/storage checks to Worker, because they require authoritative asset lookup at execution time.

- [ ] **Step 4: Run the focused API test and verify GREEN**

Run:

```bash
npm run test --workspace @aigc-flow/api -- workflow-runs.test.ts
```

Expected: deterministic capability/count errors return 422 with no billing or queue side effects; unrelated workflow-run tests remain green.

- [ ] **Step 5: Commit API preflight**

```bash
git add apps/api/src/modules/workflow-runs/workflow-runs.service.ts apps/api/test/workflow-runs.test.ts
git commit -m "feat(api): preflight text image inputs"
```

### Task 7: Make Text Node model selection capability-aware and map errors

**Files:**
- Modify: `src/flowCanvas/text/textModelCatalog.ts`
- Modify: `src/flowCanvas/nodes/FlowNodes.tsx`
- Modify: `src/flowCanvas/runtime/v2WorkflowRunner.ts`
- Test: `src/flowCanvas/text/textModelCatalog.test.ts`
- Test: `src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx`
- Test: `src/flowCanvas/runtime/v2WorkflowRunner.test.ts`

- [ ] **Step 1: Write failing catalog, menu, and error mapping tests**

Extend `TextRouteOption` expectation to include:

```ts
capabilities: {
  maxImages: 3,
  supportedImageMimeTypes: ["image/png"],
  supportsImageInput: true,
}
```

Render a Text Node with one upstream Image Node and two routes. Assert the nonvisual route button is disabled, its tooltip explains `当前文本模型线路不支持图片输入，请切换支持图片的线路`, and the visual route remains selectable. Add runner tests that a failed node with `TEXT_IMAGE_INPUT_LIMIT_EXCEEDED` shows `当前模型最多支持 3 张图片`, and an unsupported route shows the same text used in the menu.

- [ ] **Step 2: Run focused frontend tests and verify RED**

Run:

```bash
npm test -- src/flowCanvas/text/textModelCatalog.test.ts src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx src/flowCanvas/runtime/v2WorkflowRunner.test.ts
```

Expected: tests FAIL because route options discard capabilities, menu items do not consider image inputs, and runner errors are raw backend text.

- [ ] **Step 3: Implement UI route compatibility and structured error display**

Carry `AiModelCatalogRoute.capabilities` through `toTextRouteOption`. In `FlowNodes.tsx`, derive existing ordered image inputs from the same input projection used by the Text Node tray. A route is selectable when no images are connected or `route.capabilities.supportsImageInput === true`; do not hide routes or replace the current selection. Use the existing `MenuSurface`, menu density tokens, `disabled`, title/Tooltip, and dismissal behavior.

In `v2WorkflowRunner.ts`, add a code-to-message map:

```ts
const TEXT_IMAGE_ERROR_MESSAGES: Record<string, string> = {
  TEXT_IMAGE_ASSET_NOT_FOUND: "图片素材不存在或无权访问",
  TEXT_IMAGE_INPUT_LIMIT_EXCEEDED: "当前模型最多支持 3 张图片",
  TEXT_IMAGE_TYPE_UNSUPPORTED: "当前图片格式不受支持",
  TEXT_IMAGE_URL_HYDRATION_FAILED: "图片读取失败，请稍后重试",
  TEXT_MODEL_IMAGE_INPUT_UNSUPPORTED: "当前文本模型线路不支持图片输入，请切换支持图片的线路",
};
```

Apply it before generic provider context formatting. Keep legacy/raw fallback errors unchanged.

- [ ] **Step 4: Run focused frontend tests and verify GREEN**

Run:

```bash
npm test -- src/flowCanvas/text/textModelCatalog.test.ts src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx src/flowCanvas/runtime/v2WorkflowRunner.test.ts
```

Expected: catalog metadata, disabled menu state, tooltip, and Chinese error mapping tests PASS.

- [ ] **Step 5: Commit UI behavior**

```bash
git add src/flowCanvas/text/textModelCatalog.ts src/flowCanvas/nodes/FlowNodes.tsx src/flowCanvas/runtime/v2WorkflowRunner.ts src/flowCanvas/text/textModelCatalog.test.ts src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx src/flowCanvas/runtime/v2WorkflowRunner.test.ts
git commit -m "feat(canvas): gate text routes by image support"
```

### Task 8: Verify migration, full regression suites, and browser behavior

**Files:**
- Modify: `PROJECT_RECORD.md`
- Optional test harness update: `scripts/smoke-text-node-image-input.ts`

- [ ] **Step 1: Add an authenticated browser smoke script if no equivalent harness exists**

Create `scripts/smoke-text-node-image-input.ts` only if the existing Playwright harness cannot create an authenticated project, upload a tenant-owned PNG, connect Image Node to Text Node, and select a visual text route. The script must assert the connected image thumbnail appears, a visual route remains enabled, a nonvisual route is disabled, four image inputs produce the creator message before dispatch, and request/result screenshots omit signed URLs.

- [ ] **Step 2: Run database migration validation**

Run:

```bash
npm run build --workspace @aigc-flow/db
npm run test --workspace @aigc-flow/db
```

Expected: database package builds and migration tests pass; inspect the generated SQL in a transaction to confirm only model/route capability JSON changed.

- [ ] **Step 3: Run all affected suites and production build**

Run:

```bash
npm run test --workspace @aigc-flow/ai-gateway-core
npm run test --workspace @aigc-flow/worker
npm run test --workspace @aigc-flow/api
npm test
npm run build
```

Expected: all commands exit 0. If root `npm test` is blocked by the documented Windows `.worktrees` `EMFILE` condition, record its full failure separately and do not report it as passing.

- [ ] **Step 4: Run local browser smoke after starting v2 services**

Run the v2 stack according to `docs/v2-local-development.md`, then run:

```bash
npx tsx scripts/smoke-text-node-image-input.ts
```

Expected: one-image and ordered-three-image visual calls reach the provider test route, the generated text is image-grounded, a pure-text call is unchanged, and four-image/nonvisual cases stop before reserve/enqueue.

- [ ] **Step 5: Update operational record and commit verification artifacts**

Document exact commands, pass/fail counts, any infrastructure limitation, migration behavior, browser smoke result, and the required staging deployment order in `PROJECT_RECORD.md`.

```bash
git add PROJECT_RECORD.md scripts/smoke-text-node-image-input.ts
git commit -m "test: verify text node image inputs"
```

Omit `scripts/smoke-text-node-image-input.ts` from `git add` when an existing harness was extended instead; stage that exact existing harness path instead.

### Task 9: Staging deployment and rollback readiness

**Files:**
- Modify: `PROJECT_RECORD.md`
- Modify only if new operator steps are necessary: `docs/staging-runbook.md`

- [ ] **Step 1: Build and deploy through the v2 Compose path**

Run on the server:

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

Expected: all four services are running, migration runs once, and logs show no route capability or adapter errors.

- [ ] **Step 2: Execute authenticated staging acceptance**

Use a tenant-owned image to verify: single-image prompt generation, three-image input ordering, pure-text regression, unsupported route rejection before charge, four-image rejection before charge, and the absence of signed URLs in canvas draft/API response/log screenshots. Confirm reserve/settle for success and no ledger entry for API preflight failures.

- [ ] **Step 3: Record outcome and rollback method**

Add the staging date, deployed commit, smoke results, and observed route keys to `PROJECT_RECORD.md`. If a route protocol fails, set only that route `supportsImageInput` to false or mark it `inactive`, stop Worker if needed, and redeploy the previous image; do not delete routes, assets, call logs, or ledger entries.

- [ ] **Step 4: Commit deployment record when repository documentation changed**

```bash
git add PROJECT_RECORD.md docs/staging-runbook.md
git commit -m "docs: record text image input staging validation"
```

Stage only files actually changed by this task.

## Plan self-review

- Design coverage: Tasks 1-3 implement the contract and all requested provider protocols; Task 4 publishes verified capabilities and migration; Tasks 5-6 enforce ordered, tenant-safe execution and pre-reserve failure; Task 7 covers catalog/UI/error states; Tasks 8-9 cover build, browser, staging, billing, and rollback.
- Safety coverage: the plan keeps `assetId` authoritative, hydrates URLs only in Worker memory, adds redaction assertions, and prohibits text-only fallback after image failures.
- Scope coverage: input handling is limited to upstream Image Nodes, three images, and no video/audio support.
- Type consistency: `TextGenerationCapabilities`, `TEXT_IMAGE_INPUT_ERROR_CODES`, `TextImageInputIssue`, and `inputAssets` are defined in Task 1 and used under those exact names in later tasks.
- Placeholder scan: this plan contains no deferred implementation placeholders; the optional smoke script has an explicit decision criterion and staging command.
