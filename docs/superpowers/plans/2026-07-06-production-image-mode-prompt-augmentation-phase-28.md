# Production Image Mode Prompt Augmentation Phase 28 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make 360 panorama and 270 wraparound generation modes affect provider requests, not just route metadata.

**Architecture:** Add a small shared AI Gateway helper that reads `request.metadata.params.generationMode`, `panorama`, and `wraparound`, then appends deterministic production instructions to the prompt before image providers receive it. Keep the original user prompt first, keep metadata unchanged, and do not add billing, storage, schema, or UI changes.

**Tech Stack:** TypeScript, AI Gateway provider adapters, Vitest.

---

## Task 1: Shared Prompt Augmentation Helper

**Files:**
- Create: `packages/ai-gateway-core/src/production-image-prompt.ts`
- Create: `packages/ai-gateway-core/test/production-image-prompt.test.ts`

- [ ] **Step 1: Write failing unit tests**

Test that:

- `standard` returns the original prompt unchanged.
- `panorama_360` appends concise equirectangular/seamless 360 panorama instructions.
- `wraparound_270` appends continuous three-side 270 environment instructions.
- `subject_orbit_270` appends three-panel subject orbit sheet instructions.
- unknown modes return the original prompt unchanged.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm run test --workspace @aigc-flow/ai-gateway-core -- production-image-prompt.test.ts
```

Expected: fail because the helper does not exist.

- [ ] **Step 3: Implement helper**

Create `buildProductionImagePrompt(prompt, metadata)` using only whitelisted modes:

```ts
standard
panorama_360
wraparound_270
subject_orbit_270
```

Append a short instruction block. Do not overwrite or reorder the user's prompt.

## Task 2: Wire Provider Image Adapters

**Files:**
- Modify: `packages/ai-gateway-core/src/openai-compatible-text-adapter.ts`
- Modify: `packages/ai-gateway-core/src/pixellelabs-gemini-image-adapter.ts`
- Modify: `packages/ai-gateway-core/src/visionary-nano-banana-adapter.ts`
- Modify: `packages/ai-gateway-core/test/runtime.test.ts`

- [ ] **Step 1: Write failing adapter tests**

Add tests proving:

- OpenAI-compatible `/images/generations` payload `prompt` contains the original prompt plus a 360 equirectangular instruction when metadata params use `panorama_360`.
- PixelleLabs Gemini request `contents[0].parts[0].text` contains a continuous 270 environment instruction when metadata params use `wraparound_270`.
- Visionary Nano Banana request prompt contains a three-panel subject orbit sheet instruction when metadata params use `subject_orbit_270`.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm run test --workspace @aigc-flow/ai-gateway-core -- runtime.test.ts production-image-prompt.test.ts
```

Expected: fail because adapters send the raw prompt today.

- [ ] **Step 3: Wire helper**

Import and use `buildProductionImagePrompt` at the points where each adapter writes the prompt into the provider payload. Keep provider-specific payload structure unchanged.

## Task 3: Validate And Record

**Files:**
- Modify: `PROJECT_RECORD.md`

- [ ] **Step 1: Run focused validation**

Run:

```bash
npm run test --workspace @aigc-flow/ai-gateway-core -- production-image-prompt.test.ts runtime.test.ts plugin-registry.test.ts
npm run build --workspace @aigc-flow/ai-gateway-core
npm run build
git diff --check
```

- [ ] **Step 2: Update project record**

Add a top entry describing Phase 28 and validation.

- [ ] **Step 3: Commit**

Commit only scoped files:

```bash
git add docs/superpowers/plans/2026-07-06-production-image-mode-prompt-augmentation-phase-28.md packages/ai-gateway-core/src/production-image-prompt.ts packages/ai-gateway-core/src/openai-compatible-text-adapter.ts packages/ai-gateway-core/src/pixellelabs-gemini-image-adapter.ts packages/ai-gateway-core/src/visionary-nano-banana-adapter.ts packages/ai-gateway-core/test/production-image-prompt.test.ts packages/ai-gateway-core/test/runtime.test.ts PROJECT_RECORD.md
git commit -m "feat: augment production image mode prompts"
```

## Completion Criteria

- 360/270 modes produce provider prompts with deterministic production instructions.
- Standard/unknown modes leave prompts unchanged.
- No extra provider secrets, schema changes, billing changes, draft media storage, or frontend local persistence are introduced.
- Existing image adapter payload contracts remain otherwise unchanged.
