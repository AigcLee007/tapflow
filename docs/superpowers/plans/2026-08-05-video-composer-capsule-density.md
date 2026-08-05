# Video Composer Capsule Density Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make video composer model and parameter controls content-sized capsules that visually match the image composer without changing text/image editor geometry.

**Architecture:** Keep the existing `NodeEditorSurface` and video state flow. Promote capsule sizing and footer layout into video-specific utility classes/tokens, then update only `VideoNodeComposer` and its focused tests. Browser smoke will measure the rendered capsule widths and assert the absence of an expanded parameter region at desktop, tablet, and mobile widths.

**Tech Stack:** React 19, TypeScript, Tailwind utility classes, Vitest, Testing Library, Playwright smoke harness.

---

## Scope And File Map

**Modify:**

- `src/flowCanvas/utils/promptBarDensity.ts` - add video capsule and footer density tokens without changing text/image values.
- `src/flowCanvas/video/VideoNodeComposer.tsx` - remove flex expansion from model/parameter controls, show route label, omit fixed values, and use a circular generate action.
- `src/flowCanvas/video/VideoNodeComposer.test.tsx` - lock content-width classes, label truncation, fixed-value omission, and generate-action contracts.
- `scripts/smoke-video-node.ts` - measure capsule widths and verify no blank parameter expansion at 1440/1024/768/390.
- `scripts/smoke-video-node.test.ts` - assert the smoke contract markers.
- `PROJECT_RECORD.md` - record validation evidence after implementation.

**Do not modify:**

- `src/flowCanvas/nodes/NodeEditorSurface.tsx`.
- Text or image composer implementations and their density values.
- Video model capabilities, pricing, route keys, provider credentials, backend APIs, or billing.

### Task 1: Add Video Capsule Tokens

**Files:** `src/flowCanvas/utils/promptBarDensity.ts`, `src/flowCanvas/utils/promptBarDensity.test.ts`

- [ ] **Step 1: Add failing token tests** asserting video-only values: capsule height `40`, capsule radius `9999`, model max width `230`, parameter max width `320`, mobile parameter max width `180`, and circular action size `40`.
- [ ] **Step 2: Run `npx vitest --run src/flowCanvas/utils/promptBarDensity.test.ts` and confirm the new token assertions fail.**
- [ ] **Step 3: Add the tokens under `promptBarDensity.video` or a dedicated exported `videoComposerDensity` object. Keep `text` and `image` object values byte-for-byte unchanged.**
- [ ] **Step 4: Re-run the focused density test and confirm all tests pass.**
- [ ] **Step 5: Commit with `git commit -m "feat(video): add capsule density tokens"`.**

### Task 2: Make Composer Controls Content-Sized

**Files:** `src/flowCanvas/video/VideoNodeComposer.tsx`, `src/flowCanvas/video/VideoNodeComposer.test.tsx`

- [ ] **Step 1: Add failing tests** that render a long model label and assert the model trigger has `max-w`, `min-w-0`, and `truncate`; render a normal model and assert the parameter trigger has `w-max`/`max-w` and does not contain `w-full` or `flex-1`; assert the summary omits `· 1 个`; assert the route label is shown when present; assert the Generate button is a `40px` circular action with an accessible `生成视频` label.
- [ ] **Step 2: Run the focused composer tests and confirm these assertions fail against the current stretched footer.**
- [ ] **Step 3: Update the footer layout:** use a non-growing settings group, remove `flex-1` from the parameter wrapper, remove `w-full` from the parameter trigger, and leave the only flexible spacer between settings and cost/action. Use the density tokens rather than new per-component magic dimensions.
- [ ] **Step 4: Build the model summary as `label + routeLabel` with a middle dot, truncate the combined text, and expose the full value via `title`. Keep provider/vendor data out of the creator UI.
- [ ] **Step 5: Build the parameter summary from capability-supported values. Omit count when it is exactly one. Render a non-interactive audio indicator only when the selected model's capabilities indicate implicit/always-on audio. Do not add an audio toggle.
- [ ] **Step 6: Replace the text Generate button with the shared circular action contract, preserving the existing `onGenerate`, disabled, pending, generating, and retry behavior.
- [ ] **Step 7: Run `npx vitest --run src/flowCanvas/video/VideoNodeComposer.test.tsx src/flowCanvas/utils/promptBarDensity.test.ts` and confirm all pass.
- [ ] **Step 8: Commit with `git commit -m "refactor(video): use content-sized composer capsules"`.**

### Task 3: Extend Responsive Browser Acceptance

**Files:** `scripts/smoke-video-node.ts`, `scripts/smoke-video-node.test.ts`

- [ ] **Step 1: Add failing smoke contract assertions for `video-composer-settings-group`, `video-composer-submit-group`, `video-capsule-model`, `video-capsule-parameters`, `capsuleWidthMatchesContent`, and `noParameterFlexExpansion`.**
- [ ] **Step 2: Run `npm run test:smoke-video-node` and confirm the new markers fail before the harness changes.**
- [ ] **Step 3: Add a browser helper that reads each capsule's bounding box and scroll width, then asserts `rect.width <= scrollWidth + 24` and `rect.width < composer.width * 0.75` for the parameter capsule.**
- [ ] **Step 4: Execute the helper at 1440, 1024, 768, and 390 widths. Preserve the existing default-model, feedback, reduced-motion, and no-overflow assertions.**
- [ ] **Step 5: Capture `desktop.png`, `narrow.png`, `tablet.png`, and `mobile.png` only after transient menus close, then inspect each image for overlap and truncation.
- [ ] **Step 6: Run `npm run test:smoke-video-node` and `npm run smoke:video-node`; require contract tests to pass and smoke JSON to return `status: ok`.
- [ ] **Step 7: Commit with `git commit -m "test(video): verify content-sized capsules"`.**

### Task 4: Regression, Record, And Handoff

**Files:** `PROJECT_RECORD.md`

- [ ] **Step 1: Run the complete focused suite:**
  `npx vitest --run src/flowCanvas/video/VideoNodeComposer.test.tsx src/flowCanvas/utils/promptBarDensity.test.ts src/flowCanvas/nodes/NodeEditorSurface.test.tsx scripts/smoke-video-node.test.ts`.
- [ ] **Step 2: Run `npm run build`; record exit code and distinguish existing Vite warnings from failures.**
- [ ] **Step 3: Attempt `npm test` once with a 180-second timeout; record exact timeout/failure evidence and do not call it passing if it times out.**
- [ ] **Step 4: Add a dated project-record entry with the exact focused count, smoke status, build result, and full-suite result.**
- [ ] **Step 5: Run `git diff --check` and `git status --short`; stage only implementation files and the project record. Leave local screenshots and unrelated dirty files untouched.**
- [ ] **Step 6: Commit with `git commit -m "docs: record video composer capsule density"`.**

## Final Acceptance Checklist

- [ ] Model and parameter capsules resize to content and never contain a blank flex-expanded region.
- [ ] Fixed count/audio controls are omitted or represented as non-interactive status only.
- [ ] Model labels and route labels truncate safely without changing editor geometry.
- [ ] Desktop/tablet remain one execution row; mobile uses two intentional groups.
- [ ] Existing video generation, disabled, feedback, and retry behavior remains intact.
- [ ] Text/image editor size and zoom regression tests remain green.
