# Production Image Mode Route Capabilities Phase 27 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish real GPT-Image-2 route capabilities for 360 panorama and 270 wraparound image modes so the canvas can run those modes without preflight blocking.

**Architecture:** Keep generation modes as AI Gateway route capabilities, not frontend hardcoding. Add safe `requestConfig.capabilities.supportedGenerationModes` to the GPT-Image-2 plugin manifest, then rely on the existing plugin install and model catalog services to persist and expose only whitelisted public capability fields.

**Tech Stack:** TypeScript, AI Gateway plugin manifests, Fastify API services, Vitest.

---

## Task 1: Prove GPT-Image-2 Manifest Declares Production Image Modes

**Files:**
- Modify: `packages/ai-gateway-core/test/plugin-registry.test.ts`
- Modify: `packages/ai-gateway-core/src/plugins/manifests/openai-gpt-image-2.ts`

- [ ] **Step 1: Write the failing manifest test**

Add assertions to the GPT-Image-2 registry test that `image.gpt-image-2` exposes:

```ts
requestConfig: expect.objectContaining({
  capabilities: {
    supportedGenerationModes: [
      "standard",
      "panorama_360",
      "wraparound_270",
      "subject_orbit_270",
    ],
  },
})
```

- [ ] **Step 2: Run the test and verify failure**

Run:

```bash
npm run test --workspace @aigc-flow/ai-gateway-core -- plugin-registry.test.ts
```

Expected: fail because the GPT-Image-2 manifest currently has no generation-mode capability declaration.

- [ ] **Step 3: Add route capabilities**

In `openai-gpt-image-2.ts`, add a shared constant:

```ts
const supportedProductionImageModes = [
  "standard",
  "panorama_360",
  "wraparound_270",
  "subject_orbit_270",
];
```

Add it under `requestConfig.capabilities.supportedGenerationModes` for the real GPT-Image-2 route(s). Do not add new pricing units, provider credentials, or frontend-only assumptions.

- [ ] **Step 4: Run the test and verify pass**

Run:

```bash
npm run test --workspace @aigc-flow/ai-gateway-core -- plugin-registry.test.ts
```

## Task 2: Prove Installed Catalog Exposes Only Safe Modes

**Files:**
- Modify: `apps/api/test/ai-plugins.service.test.ts`
- Modify: `apps/api/test/ai-model-catalog.test.ts`

- [ ] **Step 1: Write the failing service test**

Add a non-DB plugin install service test that builds the GPT-Image-2 route insert payload and expects the persisted `request_config.capabilities.supportedGenerationModes` to include all four known modes.

- [ ] **Step 2: Write the model catalog regression**

Extend the DB-backed GPT/image catalog coverage, or add focused assertions where the plugin is installed, so `/api/v2/ai/model-catalog/gpt-image-2/routes` returns route capabilities with:

```ts
supportedGenerationModes: [
  "standard",
  "panorama_360",
  "wraparound_270",
  "subject_orbit_270",
]
```

The response must still not include raw `requestConfig`.

- [ ] **Step 3: Run focused API tests**

Run:

```bash
npm run test --workspace @aigc-flow/api -- test/ai-plugins.service.test.ts test/ai-model-catalog.test.ts test/ai-model-catalog.service.test.ts
```

Expected locally: non-DB tests pass; DB-backed tests may skip behind the existing local database guard.

## Task 3: Validate And Record

**Files:**
- Modify: `PROJECT_RECORD.md`

- [ ] **Step 1: Run focused builds**

Run:

```bash
npm run build --workspace @aigc-flow/ai-gateway-core
npm run build --workspace @aigc-flow/api
npm run build
git diff --check
```

- [ ] **Step 2: Update project record**

Add a top `PROJECT_RECORD.md` entry describing Phase 27, including validation output and the fact that no new billing/storage path was added.

- [ ] **Step 3: Commit**

Commit only the scoped files:

```bash
git add docs/superpowers/plans/2026-07-06-production-image-mode-route-capabilities-phase-27.md packages/ai-gateway-core/src/plugins/manifests/openai-gpt-image-2.ts packages/ai-gateway-core/test/plugin-registry.test.ts apps/api/test/ai-plugins.service.test.ts apps/api/test/ai-model-catalog.test.ts PROJECT_RECORD.md
git commit -m "feat: publish gpt image production mode capabilities"
```

## Completion Criteria

- GPT-Image-2 route manifests declare `standard`, `panorama_360`, `wraparound_270`, and `subject_orbit_270`.
- Plugin installation persists those route capabilities into `ai_routes.request_config`.
- Runtime model catalog responses expose only whitelisted generation modes and hide raw `requestConfig`.
- No new billing unit, DB schema, provider secret exposure, or canvas draft media storage path is introduced.
- Focused tests and `npm run build` pass or any local infrastructure skip is documented.
