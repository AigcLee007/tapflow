# Production Image Mode Capability And Pricing Phase 8 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make 360 panorama and 270 wraparound image modes route-capability aware and fail closed before paid execution when support or pricing is missing.

**Architecture:** Backend runtime route listing exposes safe model/route capabilities from `ai_models.capabilities` and `ai_routes.request_config`. Frontend maps those capabilities into image route options, filters generation-mode UI affordances, and performs a final workflow-run preflight before creating a run. Existing billing reserve/settle/refund behavior remains server-side.

**Tech Stack:** TypeScript, React, Vitest, Fastify API, Postgres-backed AI Gateway route metadata.

---

### Task 1: Route Capability Types And Mapping Tests

**Files:**
- Modify: `src/services/v2AiRoutesApi.ts`
- Modify: `src/services/v2AiRoutesApi.test.ts`
- Modify: `src/flowCanvas/utils/runtimeRouteOptions.ts`
- Modify: `src/flowCanvas/utils/runtimeRouteOptions.test.ts`

- [ ] **Step 1: Write failing frontend API/type tests**

```ts
expect(response[0]?.capabilities).toEqual({
  supportedGenerationModes: ["standard", "panorama_360", "wraparound_270"],
});
```

- [ ] **Step 2: Write failing runtime route mapping tests**

```ts
expect(options[0]?.supportedGenerationModes).toEqual([
  "standard",
  "panorama_360",
  "wraparound_270",
]);
```

- [ ] **Step 3: Run focused tests and verify red**

Run: `npm test -- src/services/v2AiRoutesApi.test.ts src/flowCanvas/utils/runtimeRouteOptions.test.ts`

Expected: FAIL because `capabilities` and `supportedGenerationModes` are not mapped yet.

- [ ] **Step 4: Implement minimal type and mapper support**

Add a route capability type that allows `supportedGenerationModes?: string[]`. Map only known image generation modes and fall back to `["standard"]` when a route has no explicit capability.

- [ ] **Step 5: Run focused tests and verify green**

Run: `npm test -- src/services/v2AiRoutesApi.test.ts src/flowCanvas/utils/runtimeRouteOptions.test.ts`

Expected: PASS.

### Task 2: Backend Runtime Route Capabilities

**Files:**
- Modify: `apps/api/src/modules/ai-gateway/ai-gateway.service.ts`
- Test: existing API tests if they cover `/api/v2/ai/routes`; otherwise use service-level shape through current route tests.

- [ ] **Step 1: Write failing backend test**

Add an expectation that `/api/v2/ai/routes?modality=image` includes:

```json
{
  "capabilities": {
    "supportedGenerationModes": ["standard", "panorama_360", "wraparound_270"]
  }
}
```

Use route `request_config.capabilities.supportedGenerationModes` or model `capabilities.supportedGenerationModes` fixture data.

- [ ] **Step 2: Run focused backend test and verify red**

Run the smallest matching API test file that exercises runtime route listing.

Expected: FAIL because the response omits capabilities.

- [ ] **Step 3: Implement runtime route capability merge**

Select `model.capabilities` and `route.request_config`, merge safe values, and return only `supportedGenerationModes` as an array of strings.

- [ ] **Step 4: Run focused backend test and verify green**

Expected: PASS.

### Task 3: Image Mode Support Helpers And UI Guard

**Files:**
- Create: `src/flowCanvas/utils/imageGenerationModeSupport.ts`
- Create: `src/flowCanvas/utils/imageGenerationModeSupport.test.ts`
- Modify: `src/flowCanvas/nodes/FlowNodes.tsx`

- [ ] **Step 1: Write failing helper tests**

Cover:
- standard is always supported.
- production modes require explicit route support.
- missing production pricing means generation is not runnable.

- [ ] **Step 2: Run helper tests and verify red**

Run: `npm test -- src/flowCanvas/utils/imageGenerationModeSupport.test.ts`

Expected: FAIL because helper does not exist.

- [ ] **Step 3: Implement helper**

Expose:

```ts
resolveSupportedImageGenerationModes(route)
isImageGenerationModeSupportedByRoute(mode, route)
resolveImageGenerationModeRunBlocker({ mode, route })
```

- [ ] **Step 4: Wire `FlowNodes.tsx` mode menu**

Keep all labels visible, but annotate unsupported modes and reset to `standard` when the active route cannot run the selected production mode.

- [ ] **Step 5: Run helper and existing image prompt tests**

Run: `npm test -- src/flowCanvas/utils/imageGenerationModeSupport.test.ts src/flowCanvas/nodes/ImagePromptActionRow.test.tsx`

Expected: PASS.

### Task 4: Workflow Runner Preflight

**Files:**
- Modify: `src/flowCanvas/runtime/v2WorkflowRunner.ts`
- Modify: `src/flowCanvas/runtime/v2WorkflowRunner.test.ts`

- [ ] **Step 1: Write failing runner tests**

Cover:
- `panorama_360` target-node run does not call `createWorkflowRun` when route capabilities do not include the mode.
- `wraparound_270` target-node run does not call `createWorkflowRun` when pricing cannot be resolved.

- [ ] **Step 2: Run runner tests and verify red**

Run: `npm test -- src/flowCanvas/runtime/v2WorkflowRunner.test.ts`

Expected: FAIL because local preflight currently allows missing production-mode pricing/support.

- [ ] **Step 3: Implement minimal preflight**

Inside target-node credit preflight, for image nodes with production modes:
- resolve active route.
- reject unsupported modes with `UNSUPPORTED_GENERATION_MODE`.
- reject missing price with `PRICING_NOT_FOUND`.
- mark the node failed before API run creation.

- [ ] **Step 4: Run runner tests and verify green**

Run: `npm test -- src/flowCanvas/runtime/v2WorkflowRunner.test.ts`

Expected: PASS.

### Task 5: Project Record And Full Verification

**Files:**
- Modify: `PROJECT_RECORD.md`

- [ ] **Step 1: Update project record**

Add a dated entry describing Phase 8 route capabilities, UI support guard, and pricing preflight.

- [ ] **Step 2: Run focused regression tests**

Run:

```bash
npm test -- src/services/v2AiRoutesApi.test.ts src/flowCanvas/utils/runtimeRouteOptions.test.ts src/flowCanvas/utils/imageGenerationModeSupport.test.ts src/flowCanvas/runtime/v2WorkflowRunner.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run build**

Run: `npm run build`

Expected: PASS, allowing existing bundle-size and Browserslist warnings.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-07-05-production-image-mode-capability-pricing-phase-8.md src/services/v2AiRoutesApi.ts src/services/v2AiRoutesApi.test.ts src/flowCanvas/utils/runtimeRouteOptions.ts src/flowCanvas/utils/runtimeRouteOptions.test.ts src/flowCanvas/utils/imageGenerationModeSupport.ts src/flowCanvas/utils/imageGenerationModeSupport.test.ts src/flowCanvas/nodes/FlowNodes.tsx src/flowCanvas/runtime/v2WorkflowRunner.ts src/flowCanvas/runtime/v2WorkflowRunner.test.ts apps/api/src/modules/ai-gateway/ai-gateway.service.ts PROJECT_RECORD.md
git commit -m "feat: add production image mode preflight"
```
