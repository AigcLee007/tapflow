# GPT-Image Fallback Production Modes Phase 29 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep GPT-Image-2 official frontend fallback routes aligned with the newly published 360/270 backend route capabilities.

**Architecture:** Update only the fallback route metadata used when runtime/catalog route data is unavailable. The real runtime catalog remains the source of truth when present, and production generation still fails closed if pricing is missing.

**Tech Stack:** Vite, TypeScript, Vitest frontend utility tests.

---

## Task 1: Fallback Route Capability Coverage

**Files:**
- Modify: `src/flowCanvas/utils/runtimeRouteOptions.test.ts`
- Modify: `src/flowCanvas/utils/imageGenerationModeSupport.test.ts`

- [ ] **Step 1: Write failing tests**

Assert that `getOfficialFallbackImageRuntimeRoutes("gpt-image-2")` returns line one and line two with:

```ts
supportedGenerationModes: [
  "standard",
  "panorama_360",
  "wraparound_270",
  "subject_orbit_270",
]
```

Also assert that production-mode preflight still returns `PRICING_NOT_FOUND` when a fallback route has capabilities but no pricing.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm test -- src/flowCanvas/utils/runtimeRouteOptions.test.ts src/flowCanvas/utils/imageGenerationModeSupport.test.ts
```

Expected: fail because GPT-Image-2 fallback routes currently do not declare supported generation modes.

## Task 2: Add Fallback Capabilities

**Files:**
- Modify: `src/flowCanvas/utils/runtimeRouteOptions.ts`

- [ ] **Step 1: Implement shared fallback modes**

Add a shared constant and set it on the two GPT-Image-2 official fallback routes:

```ts
const GPT_IMAGE_2_PRODUCTION_MODES: FlowImageGenerationMode[] = [
  "standard",
  "panorama_360",
  "wraparound_270",
  "subject_orbit_270",
];
```

- [ ] **Step 2: Run focused tests**

Run:

```bash
npm test -- src/flowCanvas/utils/runtimeRouteOptions.test.ts src/flowCanvas/utils/imageGenerationModeSupport.test.ts src/flowCanvas/runtime/v2WorkflowRunner.test.ts
```

## Task 3: Validate And Record

**Files:**
- Modify: `PROJECT_RECORD.md`

- [ ] **Step 1: Run build and diff check**

Run:

```bash
npm run build
git diff --check
```

- [ ] **Step 2: Update project record**

Add a top entry describing Phase 29 and validation.

- [ ] **Step 3: Commit**

Commit scoped files:

```bash
git add docs/superpowers/plans/2026-07-06-gpt-image-fallback-production-modes-phase-29.md src/flowCanvas/utils/runtimeRouteOptions.ts src/flowCanvas/utils/runtimeRouteOptions.test.ts src/flowCanvas/utils/imageGenerationModeSupport.test.ts PROJECT_RECORD.md
git commit -m "feat: align gpt image fallback production modes"
```

## Completion Criteria

- GPT-Image-2 official fallback routes expose the same four production image modes as the backend plugin manifest.
- Production image mode execution still requires active pricing and does not become free.
- Existing runtime/catalog route behavior remains unchanged when API data exists.
