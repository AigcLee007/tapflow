# Aittco Text Models Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish eight priced Aittco relay text models through the database-backed AI Gateway and render them in the canvas text-node picker grouped by Gemini, GPT, and Claude with their manufacturer logos.

**Architecture:** Add one `aittco-text-relay` provider adapter that dispatches Gemini GenerateContent, OpenAI Responses, or Claude Messages according to normalized route metadata. A single built-in plugin manifest installs one provider connection and credential plus eight product models, routes, catalog entries, and prices. The frontend reads manufacturer and logo metadata from `ai_model_catalog.ui_schema`, groups only active priced routes, and persists real model/route identifiers.

**Tech Stack:** TypeScript, Node fetch, React, Vitest, Testing Library, Fastify, PostgreSQL, CredentialVault, Docker Compose v2.

---

## File Map

**Create:**

- `packages/ai-gateway-core/src/aittco-text-relay-adapter.ts`: protocol dispatch, request mapping, response parsing, safe diagnostics.
- `packages/ai-gateway-core/test/aittco-text-relay-adapter.test.ts`: focused Gemini, Responses, Claude, error, and redaction tests.
- `packages/ai-gateway-core/src/plugins/manifests/aittco-text-relay.ts`: eight models, routes, prices, UI branding metadata, and route smoke definitions.

**Modify:**

- `packages/ai-gateway-core/src/plugins/plugin-manifest.ts`: typed manufacturer/logo metadata and fractional positive price validation.
- `packages/ai-gateway-core/src/plugins/registry.ts`: register the Aittco manifest.
- `packages/ai-gateway-core/src/provider-adapter-registry.ts`: register the Aittco adapter kind.
- `packages/ai-gateway-core/src/database-text-runtime.ts`: include the Aittco adapter in the default database runtime.
- `packages/ai-gateway-core/src/index.ts`: export the new adapter.
- `packages/ai-gateway-core/test/plugin-registry.test.ts`: manifest, pricing, route, branding, and validation coverage.
- `packages/ai-gateway-core/test/provider-adapter-registry.test.ts`: default registry coverage.
- `apps/api/src/modules/ai-plugins/ai-plugins.service.ts`: persist the actual upstream model from route configuration.
- `apps/api/src/modules/ai-model-configurations/ai-model-configurations.service.ts`: match pricing by product model key while keeping upstream model separate.
- `apps/api/test/ai-plugins.test.ts`: database install/catalog/credential/upstream integration coverage.
- `apps/api/test/ai-model-configurations.test.ts`: product-model pricing publish regression coverage.
- `src/flowCanvas/text/textModelCatalog.ts`: manufacturer/logo fields and stable manufacturer grouping.
- `src/flowCanvas/text/textModelCatalog.test.ts`: branding, grouping, ordering, and fractional price coverage.
- `src/flowCanvas/nodes/FlowNodes.tsx`: grouped menu headers, logo-key rendering, and trigger branding.
- `src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx`: grouped UI and persisted selection regression coverage.
- `docs/STAGING_ENV_TEMPLATE.md`: Aittco provider, protocol, price, and CredentialVault deployment notes.
- `PROJECT_RECORD.md`: completed implementation, verification, and deployment status.

No database migration is required because manufacturer metadata is stored in existing JSONB `ui_schema`, normalized route fields already exist, and `model_pricing` already stores fractional numeric credits. No Compose environment variable is required because the real relay Key is written through the admin plugin install API into CredentialVault.

---

### Task 1: Allow branding metadata and fractional manifest pricing

**Files:**

- Modify: `packages/ai-gateway-core/src/plugins/plugin-manifest.ts`
- Modify: `packages/ai-gateway-core/test/plugin-registry.test.ts`

- [ ] **Step 1: Write failing manifest validation tests**

Add one test that clones a valid text manifest with `unitCredits` and `minChargeCredits` set to `0.5`, and a second assertion for zero pricing:

```ts
test("accepts fractional positive pricing and rejects zero pricing", () => {
  const source = builtinAiPluginRegistry.require("siphonlab.gpt-5-5-text");
  const fractional: AiPluginManifest = {
    ...source,
    packageKey: "test.fractional-text",
    pricing: source.pricing.map((item) => ({
      ...item,
      minChargeCredits: 0.5,
      unitCredits: 0.5,
    })),
  };
  expect(validateAiPluginManifest(fractional)).toEqual([]);

  const zero: AiPluginManifest = {
    ...fractional,
    packageKey: "test.zero-text",
    pricing: fractional.pricing.map((item) => ({ ...item, unitCredits: 0 })),
  };
  expect(validateAiPluginManifest(zero).map((issue) => issue.code)).toContain(
    "PRICING_CREDITS_INVALID",
  );
});
```

- [ ] **Step 2: Run the test and verify the red state**

Run:

```bash
npm run test --workspace @aigc-flow/ai-gateway-core -- plugin-registry.test.ts
```

Expected: FAIL because `0.5` currently trips `PRICING_CREDITS_INVALID`.

- [ ] **Step 3: Implement the smallest type and validation change**

Extend `AiPluginModelManifest.uiSchema`:

```ts
uiSchema: {
  fields: AiPluginUiField[];
  logoKey?: string;
  manufacturer?: string;
  panelLayout: "compact" | "default" | "nano-banana" | "text" | "video";
};
```

Change the validation condition to reject only non-positive or non-finite values:

```ts
if (
  !Number.isFinite(pricing.minChargeCredits)
  || !Number.isFinite(pricing.unitCredits)
  || pricing.minChargeCredits <= 0
  || pricing.unitCredits <= 0
) {
  issues.push({
    code: "PRICING_CREDITS_INVALID",
    message: `Pricing for ${pricing.route} must use positive credits`,
  });
}
```

- [ ] **Step 4: Run the focused test**

Run the command from Step 2.

Expected: PASS.

- [ ] **Step 5: Commit the validation boundary**

```bash
git add packages/ai-gateway-core/src/plugins/plugin-manifest.ts packages/ai-gateway-core/test/plugin-registry.test.ts
git commit -m "fix(ai-gateway): allow fractional model pricing"
```

---

### Task 2: Implement the three-protocol Aittco text adapter

**Files:**

- Create: `packages/ai-gateway-core/src/aittco-text-relay-adapter.ts`
- Create: `packages/ai-gateway-core/test/aittco-text-relay-adapter.test.ts`

- [ ] **Step 1: Write failing protocol tests**

Use an injected `fetchImplementation` and assert all calls use `Authorization: Bearer test-relay-key` without exposing that value in returned diagnostics.

The Gemini case must assert:

```ts
expect(url).toBe(
  "https://api.aittco.com/v1beta/models/gemini-3.1-pro-preview:generateContent",
);
expect(body).toMatchObject({
  contents: [
    { role: "user", parts: [{ text: "hello" }] },
    { role: "model", parts: [{ text: "previous answer" }] },
  ],
  generationConfig: { maxOutputTokens: 128, temperature: 0.2 },
  systemInstruction: { parts: [{ text: "You are concise." }] },
});
```

Return a mock Gemini response and expect `outputText` plus `promptTokenCount`, `candidatesTokenCount`, and `totalTokenCount` mapping.

The Responses case must assert `/v1/responses`, product-model override protection, `input`, `max_output_tokens`, and `temperature`, then parse `output_text` or `output[].content[].text`.

The Claude case must assert `/v1/messages`, system extraction, user/assistant messages, required `max_tokens`, and response `content[].text` plus usage parsing.

Add error cases for 401, 429, 500, timeout, unsupported protocol, and a 200 response without text. Check that serialized `providerRequest`, `providerResponse`, and thrown error diagnostics do not contain `test-relay-key` or the complete prompt.

- [ ] **Step 2: Run the adapter test and verify the red state**

Run:

```bash
npm run test --workspace @aigc-flow/ai-gateway-core -- aittco-text-relay-adapter.test.ts
```

Expected: FAIL because `AittcoTextRelayAdapter` does not exist.

- [ ] **Step 3: Implement protocol dispatch and common helpers**

Create the adapter with this public shape:

```ts
type FetchLike = typeof fetch;
type AittcoProtocol = "claude" | "gemini" | "responses";

export class AittcoTextRelayAdapter implements ProviderAdapter {
  private readonly fetchImplementation: FetchLike;

  constructor(options?: { fetchImplementation?: FetchLike }) {
    this.fetchImplementation = options?.fetchImplementation ?? fetch;
  }

  async generateText(
    context: ProviderCallContext,
    request: TextGenerationRequest,
  ): Promise<ProviderTextGenerationResult> {
    const protocol = resolveProtocol(context.requestConfig);
    const model = requireUpstreamModel(context.requestConfig, context.modelKey);
    if (protocol === "gemini") return this.generateGemini(context, request, model);
    if (protocol === "responses") return this.generateResponses(context, request, model);
    return this.generateClaude(context, request, model);
  }
}
```

`requireUpstreamModel` must prefer `requestConfig.model`/`requestConfig.upstreamModel` over `request.model`, because node data stores the product model key. `resolveProtocol` accepts normalized `protocol` or `apiMode` and throws `PROVIDER_BAD_REQUEST` for any other value.

Use protocol-specific body builders:

```ts
const geminiBody = {
  contents: nonSystemMessages.map((message) => ({
    parts: [{ text: message.content }],
    role: message.role === "assistant" ? "model" : "user",
  })),
  ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
  generationConfig: compactObject({
    maxOutputTokens: resolveMaxTokens(request, requestConfig),
    temperature: resolveTemperature(request, requestConfig),
  }),
};

const responsesBody = compactObject({
  input: request.messages,
  max_output_tokens: resolveMaxTokens(request, requestConfig),
  model,
  temperature: resolveTemperature(request, requestConfig),
});

const claudeBody = compactObject({
  max_tokens: resolveMaxTokens(request, requestConfig) ?? 2048,
  messages: nonSystemMessages.map(({ content, role }) => ({
    content,
    role: role === "assistant" ? "assistant" : "user",
  })),
  model,
  system: systemText || undefined,
  temperature: resolveTemperature(request, requestConfig),
});
```

Use a shared request method that sends only the two approved headers and `AbortSignal.timeout(context.timeoutMs)`. Returned diagnostics must be summaries:

```ts
providerRequest: {
  messageCount: request.messages.length,
  model,
  protocol,
  routeKey: context.routeKey,
  url,
},
providerResponse: {
  requestId: readRequestId(responseBody),
  status: response.status,
},
```

Map errors as follows: 401/403 `PROVIDER_AUTH_FAILED`, 429 `PROVIDER_RATE_LIMIT`, 400-499 `PROVIDER_BAD_REQUEST`, 500-599 `PROVIDER_INTERNAL_ERROR`, timeout `PROVIDER_TIMEOUT`, successful response without parseable text `PROVIDER_INVALID_RESPONSE`.

- [ ] **Step 4: Run the adapter test**

Run the command from Step 2.

Expected: all adapter tests PASS.

- [ ] **Step 5: Commit the adapter**

```bash
git add packages/ai-gateway-core/src/aittco-text-relay-adapter.ts packages/ai-gateway-core/test/aittco-text-relay-adapter.test.ts
git commit -m "feat(ai-gateway): add Aittco text relay adapter"
```

---

### Task 3: Register the adapter in every text runtime entry point

**Files:**

- Modify: `packages/ai-gateway-core/src/provider-adapter-registry.ts`
- Modify: `packages/ai-gateway-core/src/database-text-runtime.ts`
- Modify: `packages/ai-gateway-core/src/index.ts`
- Modify: `packages/ai-gateway-core/test/provider-adapter-registry.test.ts`

- [ ] **Step 1: Add failing registry assertions**

Import `AittcoTextRelayAdapter`, expect `listKinds()` to include `aittco-text-relay`, and assert:

```ts
expect(registry.create("aittco-text-relay")).toBeInstanceOf(AittcoTextRelayAdapter);
```

- [ ] **Step 2: Run the test and verify the red state**

```bash
npm run test --workspace @aigc-flow/ai-gateway-core -- provider-adapter-registry.test.ts
```

Expected: FAIL because the adapter kind is not registered.

- [ ] **Step 3: Register and export the adapter**

Add to `createDefaultProviderAdapterRegistry()`:

```ts
{
  create: () => new AittcoTextRelayAdapter(),
  kind: "aittco-text-relay",
},
```

Add the same adapter to the `DatabaseTextGenerationRuntime` default `AiGateway` map:

```ts
"aittco-text-relay": new AittcoTextRelayAdapter(),
```

Export the class from `src/index.ts` so API/Worker builds consume the same implementation.

- [ ] **Step 4: Run registry and core build checks**

```bash
npm run test --workspace @aigc-flow/ai-gateway-core -- provider-adapter-registry.test.ts
npm run build --workspace @aigc-flow/ai-gateway-core
```

Expected: both commands PASS.

- [ ] **Step 5: Commit runtime registration**

```bash
git add packages/ai-gateway-core/src/provider-adapter-registry.ts packages/ai-gateway-core/src/database-text-runtime.ts packages/ai-gateway-core/src/index.ts packages/ai-gateway-core/test/provider-adapter-registry.test.ts
git commit -m "feat(ai-gateway): register Aittco relay runtime"
```

---

### Task 4: Add the eight-model plugin manifest

**Files:**

- Create: `packages/ai-gateway-core/src/plugins/manifests/aittco-text-relay.ts`
- Modify: `packages/ai-gateway-core/src/plugins/registry.ts`
- Modify: `packages/ai-gateway-core/test/plugin-registry.test.ts`

- [ ] **Step 1: Write failing manifest assertions**

Assert the built-in package `aittco.text-relay` has provider key/kind `aittco-text-relay`, base URL `https://api.aittco.com`, one bearer credential field, and exactly this model/route/price matrix:

```ts
const expected = [
  ["gemini-3.1-pro", "Gemini-3.1-pro", "gemini-3.1-pro-preview", "gemini", 1],
  ["gemini-3.5-flash", "Gemini-3.5-flash", "gemini-3.5-flash-preview", "gemini", 0.5],
  ["gpt-5.6-sol", "GPT-5.6-sol", "gpt-5.6-sol", "responses", 2],
  ["gpt-5.6-terra", "GPT-5.6-terra", "gpt-5.6-terra", "responses", 1],
  ["gpt-5.5", "GPT-5.5", "gpt-5.5", "responses", 2],
  ["claude-opus-5", "Claude-Opus-5", "claude-opus-5", "claude", 2.5],
  ["claude-sonnet-5", "Claude-Sonnet-5", "claude-sonnet-5", "claude", 1.5],
  ["claude-opus-4-8", "Claude-Opus-4-8", "claude-opus-4-8", "claude", 2],
] as const;
```

Assert every `modelFamily` equals its product `modelKey`, preventing `SELECT DISTINCT ON (model_family)` from collapsing models. Assert UI schemas contain the corresponding manufacturer and logo key.

- [ ] **Step 2: Run the registry test and verify the red state**

```bash
npm run test --workspace @aigc-flow/ai-gateway-core -- plugin-registry.test.ts
```

Expected: FAIL because `aittco.text-relay` is not registered.

- [ ] **Step 3: Implement the manifest**

Use one internal definition array to derive models, routes, pricing, and tests. Stable route keys must be:

```txt
text.gemini-3-1-pro
text.gemini-3-5-flash
text.gpt-5-6-sol
text.gpt-5-6-terra
text.gpt-5-5
text.claude-opus-5
text.claude-sonnet-5
text.claude-opus-4-8
```

Model UI metadata and route request config must follow this shape:

```ts
uiSchema: {
  fields: textFields,
  logoKey: definition.logoKey,
  manufacturer: definition.manufacturer,
  panelLayout: "text",
},
requestConfig: {
  apiMode: definition.protocol,
  model: definition.upstreamModel,
  path: definition.path,
  protocol: definition.protocol,
  timeoutMs: 60_000,
},
```

Paths are `/v1beta/models/{model}:generateContent`, `/v1/responses`, and `/v1/messages`. Each route uses `默认线路`, sync mode, active-publication defaults, and one matching `text_generation` price where `unitCredits === minChargeCredits`.

- [ ] **Step 4: Register and test the manifest**

Add `aittcoTextRelayManifest` to `BUILTIN_AI_PLUGIN_MANIFESTS`. Run:

```bash
npm run test --workspace @aigc-flow/ai-gateway-core -- plugin-registry.test.ts
```

Expected: PASS with the built-in manifest count increased by one and text filtering returning both Aittco and the historical SiphonLab package.

- [ ] **Step 5: Commit the manifest**

```bash
git add packages/ai-gateway-core/src/plugins/manifests/aittco-text-relay.ts packages/ai-gateway-core/src/plugins/registry.ts packages/ai-gateway-core/test/plugin-registry.test.ts
git commit -m "feat(ai-gateway): publish Aittco text models"
```

---

### Task 5: Preserve upstream-model and pricing semantics during plugin installation

**Files:**

- Modify: `apps/api/src/modules/ai-plugins/ai-plugins.service.ts`
- Modify: `apps/api/src/modules/ai-model-configurations/ai-model-configurations.service.ts`
- Modify: `apps/api/test/ai-plugins.test.ts`
- Modify: `apps/api/test/ai-model-configurations.test.ts`

- [ ] **Step 1: Add a failing Aittco plugin install integration test**

Install `aittco.text-relay` with a test secret and `publishImmediately: true`. Assert:

```ts
expect(install.json()).toMatchObject({
  catalogModelKeys: [
    "gemini-3.1-pro",
    "gemini-3.5-flash",
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-5.5",
    "claude-opus-5",
    "claude-sonnet-5",
    "claude-opus-4-8",
  ],
  packageKey: "aittco.text-relay",
  status: "published",
});
```

Query the database and assert one provider connection, one active credential reference, eight active routes, eight active catalog rows, eight active prices, and `text.gemini-3-1-pro.upstream_model === "gemini-3.1-pro-preview"`. Assert `request_config.protocol === "gemini"`, `api_mode === "gemini"`, and the raw test secret is absent from serialized API output.

- [ ] **Step 2: Run the API test and observe the upstream-model failure**

```bash
npm run test --workspace @aigc-flow/api -- ai-plugins.test.ts
```

Expected when `DATABASE_URL` is configured: FAIL because the installer currently writes `route.modelKey` to `upstream_model`. Without a database, the suite reports skipped database tests; retain the test and continue with static API build verification.

- [ ] **Step 3: Persist the manifest's actual upstream model**

Add a helper in `AiPluginService`:

```ts
private resolveRouteUpstreamModel(route: AiPluginManifest["routes"][number]): string {
  return this.readRouteRequestConfigString(route.requestConfig, "upstreamModel")
    ?? this.readRouteRequestConfigString(route.requestConfig, "model")
    ?? route.modelKey;
}
```

Use it for the `upstream_model` value in `buildRouteInsertStatement` while continuing to use `route.modelKey` for the product model row and pricing manifest reference.

- [ ] **Step 4: Fix model configuration pricing lookup**

Change the publish query join from:

```sql
pricing.model=route.upstream_model
```

to:

```sql
pricing.model=model.model_key
```

Add a regression case whose product model is `gemini-3.1-pro`, upstream model is `gemini-3.1-pro-preview`, and price model is `gemini-3.1-pro`; after a successful route test revision, publish must not report missing pricing.

- [ ] **Step 5: Run focused API tests and build**

```bash
npm run test --workspace @aigc-flow/api -- ai-plugins.test.ts ai-model-configurations.test.ts ai-model-catalog.test.ts
npm run build --workspace @aigc-flow/api
```

Expected: focused tests PASS when database infrastructure is present; otherwise database-backed cases are explicitly skipped and the API build PASSes.

- [ ] **Step 6: Commit normalized route persistence**

```bash
git add apps/api/src/modules/ai-plugins/ai-plugins.service.ts apps/api/src/modules/ai-model-configurations/ai-model-configurations.service.ts apps/api/test/ai-plugins.test.ts apps/api/test/ai-model-configurations.test.ts
git commit -m "fix(ai-gateway): persist relay upstream models"
```

---

### Task 6: Map and group catalog models by manufacturer

**Files:**

- Modify: `src/flowCanvas/text/textModelCatalog.ts`
- Modify: `src/flowCanvas/text/textModelCatalog.test.ts`

- [ ] **Step 1: Write failing mapper/grouping tests**

Add `uiSchema` metadata to fixture models and verify:

```ts
expect(options[0]).toMatchObject({
  logoKey: "google-gemini",
  manufacturer: "Gemini",
});
expect(groupTextModelOptions(options).map((group) => group.label)).toEqual([
  "Gemini",
  "GPT",
  "Claude",
]);
```

Include `0.5` credits and assert the route is retained. Include an unknown manufacturer and assert it appears after the three known groups as `其他`, without synthesizing a model or route.

- [ ] **Step 2: Run the mapper test and verify the red state**

```bash
npx vitest --run --exclude='.worktrees/**' src/flowCanvas/text/textModelCatalog.test.ts
```

Expected: FAIL because the model option has no branding fields or grouping helper.

- [ ] **Step 3: Implement safe metadata parsing and grouping**

Extend the model type:

```ts
export type TextModelLogoKey = "claude" | "google-gemini" | "openai" | "unknown";

export type TextModelOption = {
  defaultRoute: TextRouteOption;
  id: string;
  label: string;
  logoKey: TextModelLogoKey;
  manufacturer: string;
  modelFamily: string;
  modelKey: string;
  routes: TextRouteOption[];
};
```

Read strings only from `model.uiSchema.manufacturer` and `model.uiSchema.logoKey`. Normalize accepted values and use `其他`/`unknown` for absent or invalid metadata. Add:

```ts
export type TextModelGroup = {
  id: string;
  label: string;
  logoKey: TextModelLogoKey;
  models: TextModelOption[];
};

export function groupTextModelOptions(models: TextModelOption[]): TextModelGroup[];
```

Use order weights `Gemini=10`, `GPT=20`, `Claude=30`, `其他=100`. Preserve the already stable model sort order inside each group.

- [ ] **Step 4: Run the mapper test**

Run the command from Step 2.

Expected: PASS.

- [ ] **Step 5: Commit catalog branding**

```bash
git add src/flowCanvas/text/textModelCatalog.ts src/flowCanvas/text/textModelCatalog.test.ts
git commit -m "feat(canvas): group text models by manufacturer"
```

---

### Task 7: Render grouped text models and manufacturer logos

**Files:**

- Modify: `src/flowCanvas/nodes/FlowNodes.tsx`
- Modify: `src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx`

- [ ] **Step 1: Add failing UI behavior tests**

Mock one model from each manufacturer with explicit `logoKey`. Open the menu and assert group labels occur in order, the three logo paths are rendered, `0.5 积分` displays without rounding to zero, and no provider key/base URL/upstream model text appears.

Select the Gemini row and retain the existing persistence assertion:

```ts
expect(useFlowCanvasStore.getState().nodes[0]?.data).toMatchObject({
  modelId: "gemini-3.1-pro",
  routeId: "route-gemini-31",
  routeKey: "text.gemini-3-1-pro",
});
```

- [ ] **Step 2: Run the node test and verify the red state**

```bash
npx vitest --run --exclude='.worktrees/**' src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx
```

Expected: FAIL because the current menu is flat and infers logos from the unified provider key.

- [ ] **Step 3: Replace provider inference with logo-key rendering**

Use this explicit safe map:

```ts
const TEXT_MODEL_LOGO_BY_KEY: Record<TextModelLogoKey, string | null> = {
  claude: "/claude-ai-icon.svg",
  "google-gemini": "/google-gemini-icon.svg",
  openai: "/openai-icon.svg",
  unknown: null,
};
```

Compute `const textModelGroups = groupTextModelOptions(textModels)` and render a compact group header before each group's rows. The trigger and model row both use `model.logoKey`; route `providerKey` remains runtime metadata and is not used for branding.

Group header styling must stay within the existing menu surface:

```ts
const textModelGroupHeader: React.CSSProperties = {
  alignItems: "center",
  color: "#a1a1aa",
  display: "flex",
  fontSize: 9,
  fontWeight: 700,
  gap: 7,
  letterSpacing: 0,
  lineHeight: 1.25,
  padding: "8px 6px 4px",
};
```

Keep row min-height `38`, label `12/700/1.1`, secondary label `9/1.25`, outside-click/Escape dismissal, portal z-index `10020`, and existing loading/error/empty states.

- [ ] **Step 4: Run focused frontend tests**

```bash
npx vitest --run --exclude='.worktrees/**' src/flowCanvas/text/textModelCatalog.test.ts src/flowCanvas/text/useTextGenerationCatalog.test.tsx src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx
```

Expected: all focused tests PASS.

- [ ] **Step 5: Commit the grouped picker**

```bash
git add src/flowCanvas/nodes/FlowNodes.tsx src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx
git commit -m "feat(canvas): show branded text model groups"
```

---

### Task 8: Update staging documentation and project record

**Files:**

- Modify: `docs/STAGING_ENV_TEMPLATE.md`
- Modify: `PROJECT_RECORD.md`
- Include: `docs/superpowers/specs/2026-08-02-aittco-text-models-design.md`
- Include: `docs/superpowers/plans/2026-08-02-aittco-text-models.md`

- [ ] **Step 1: Replace the historical single text-route staging scope**

Document provider `aittco-text-relay`, Base URL, the eight model/upstream/protocol/price mappings, and that all use one CredentialVault Bearer secret. State explicitly:

```txt
The relay Key is supplied once to the authenticated plugin install API.
Do not add it to docker-compose.staging.yml or commit it to this template.
```

Document that the old `siphonlab.gpt-5-5-text` install is disabled after Aittco route tests pass, preserving historical rows.

- [ ] **Step 2: Record completed work and exact validation results**

Append a dated `2026-08-02 - Aittco Text Relay Models` entry to `PROJECT_RECORD.md`. List adapter protocols, eight models/prices, upstream-model persistence fix, grouped UI, commands actually run, skipped infrastructure-dependent tests, and staging rollout status.

- [ ] **Step 3: Scan documentation for secrets**

```bash
rg -n -e 'sk-[A-Za-z0-9]' -e 'Bearer [A-Za-z0-9]{12,}' docs/STAGING_ENV_TEMPLATE.md PROJECT_RECORD.md docs/superpowers/specs/2026-08-02-aittco-text-models-design.md docs/superpowers/plans/2026-08-02-aittco-text-models.md
```

Expected: no output.

- [ ] **Step 4: Commit documentation**

```bash
git add docs/STAGING_ENV_TEMPLATE.md PROJECT_RECORD.md docs/superpowers/specs/2026-08-02-aittco-text-models-design.md docs/superpowers/plans/2026-08-02-aittco-text-models.md
git commit -m "docs(ai-gateway): record Aittco text rollout"
```

---

### Task 9: Final verification, local UI smoke, merge, and push

**Files:** All task-scoped files above.

- [ ] **Step 1: Run all focused tests**

```bash
npm run test --workspace @aigc-flow/ai-gateway-core -- aittco-text-relay-adapter.test.ts provider-adapter-registry.test.ts plugin-registry.test.ts
npm run test --workspace @aigc-flow/api -- ai-plugins.test.ts ai-model-configurations.test.ts ai-model-catalog.test.ts
npx vitest --run --exclude='.worktrees/**' src/flowCanvas/text/textModelCatalog.test.ts src/flowCanvas/text/useTextGenerationCatalog.test.tsx src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx
```

Expected: all non-infrastructure tests PASS; database-backed tests PASS when `DATABASE_URL` is available or report explicit skips otherwise.

- [ ] **Step 2: Run production builds and broader tests**

```bash
npm run build --workspace @aigc-flow/ai-gateway-core
npm run build --workspace @aigc-flow/api
npm run build --workspace @aigc-flow/worker
npm run build
npm test
```

Expected: builds PASS. Record any known unrelated root-test failures separately, but do not treat them as feature passes.

- [ ] **Step 3: Start the local app and visually inspect the picker**

Start API/worker/frontend using the documented v2 local stack when local infrastructure is available. Use Playwright at desktop and mobile-width viewports to open a project, select a text node, open the model menu, and verify the grouped menu is nonblank, does not overlap controls, shows all three brands, and keeps all labels/prices within the 320-360px surface. Save screenshots under task-scoped temporary output only; do not commit authenticated screenshots or secrets.

- [ ] **Step 4: Review the exact diff and worktree state**

```bash
git diff --check
git status --short
git diff --stat origin/main...HEAD
```

Expected: no whitespace errors; only task-scoped files are staged/committed; unrelated dirty files remain untouched.

- [ ] **Step 5: Integrate and push main**

If implementation was done in an isolated branch, fast-forward or merge it into local `main` without overwriting unrelated work. Then run:

```bash
git push origin main
git rev-parse --short HEAD
git status --short
```

Expected: push succeeds, `origin/main` points to the printed commit, and unrelated pre-existing files remain uncommitted.

- [ ] **Step 6: Hand off safe staging configuration commands**

Provide the Docker Compose v2 deployment sequence from `AGENTS.md`, followed by authenticated admin API commands that:

1. read the Aittco Key into a temporary non-exported shell variable without echoing it;
2. install `aittco.text-relay` with `publishImmediately: true`;
3. verify eight catalog models and eight active routes/prices;
4. route-test one Gemini, one GPT, and one Claude model, then the remaining five;
5. disable the old SiphonLab install only after the new tests pass;
6. run one real canvas text generation and inspect API/Worker logs without printing the Key.

The operational handoff must use `/opt/aittco/tapflow`, `/opt/aittco/env/tapflow.staging.env`, `docker-compose.staging.yml`, and `node packages/db/dist/cli.js` exactly.
