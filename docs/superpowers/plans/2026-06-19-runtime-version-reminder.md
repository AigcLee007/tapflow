# Runtime Version Reminder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Notify users when a newly deployed frontend version is available so long-lived browser tabs can refresh out of stale cached code.

**Architecture:** Generate a small `dist/version.json` file during Vite build, expose it with no-store caching, and have the React app compare the boot-time version with the latest server version. If they differ, render a global non-blocking update banner with a refresh action.

**Tech Stack:** Vite, React 19, Vitest, Testing Library, Express static server.

---

### Task 1: Build Version Manifest

**Files:**
- Create: `scripts/write-build-version.cjs`
- Modify: `package.json`
- Test: `scripts/write-build-version.test.ts`

- [ ] Step 1: Write a failing test that runs the script against a temporary output directory and asserts it writes JSON with `version`, `builtAt`, and `commit`.
- [ ] Step 2: Run `npx vitest run scripts/write-build-version.test.ts` and confirm it fails because the script does not exist.
- [ ] Step 3: Implement `scripts/write-build-version.cjs` using Node built-ins only. It should prefer `BUILD_VERSION`, then `git rev-parse --short HEAD`, then timestamp fallback.
- [ ] Step 4: Update `package.json` build script to run `vite build && node scripts/write-build-version.cjs`.
- [ ] Step 5: Run the focused test and confirm it passes.

### Task 2: Version Check Client Logic

**Files:**
- Create: `src/app/version/versionReminder.ts`
- Test: `src/app/version/versionReminder.test.ts`

- [ ] Step 1: Write failing tests for pure helpers: unchanged versions do not notify, changed versions notify, malformed/missing payloads are ignored, check interval is `60 * 60 * 1000`.
- [ ] Step 2: Run `npx vitest run src/app/version/versionReminder.test.ts` and confirm expected failures.
- [ ] Step 3: Implement pure helpers with no DOM coupling.
- [ ] Step 4: Run focused tests and confirm they pass.

### Task 3: Global React Reminder

**Files:**
- Create: `src/app/version/AppVersionReminder.tsx`
- Test: `src/app/version/AppVersionReminder.test.tsx`
- Modify: `src/app/AppRouter.tsx`

- [ ] Step 1: Write failing React tests: no banner when same version, banner when fetched version changes, reload button calls `window.location.reload`.
- [ ] Step 2: Run `npx vitest run src/app/version/AppVersionReminder.test.tsx` and confirm expected failures.
- [ ] Step 3: Implement `AppVersionReminder` with `setInterval` using the one-hour interval and fetch `version.json` with cache busting and `cache: "no-store"`.
- [ ] Step 4: Mount `AppVersionReminder` at the top level of `AppRouter` so protected shell pages and fullscreen workbench can see it.
- [ ] Step 5: Run focused tests and confirm they pass.

### Task 4: Static Server Cache Headers

**Files:**
- Modify: `scripts/serve-dist.cjs`
- Test: `scripts/serve-dist.test.ts`

- [ ] Step 1: Write a failing test for a cache-header helper so `version.json` receives `no-store, no-cache, must-revalidate`.
- [ ] Step 2: Run the focused test and confirm it fails.
- [ ] Step 3: Export or isolate cache-header logic without changing production server behavior.
- [ ] Step 4: Run focused test and confirm it passes.

### Task 5: Documentation Record and Verification

**Files:**
- Modify: `PROJECT_RECORD.md`

- [ ] Step 1: Add a dated entry describing runtime version reminder behavior and validation.
- [ ] Step 2: Run focused tests.
- [ ] Step 3: Run `npm run build`.
- [ ] Step 4: Inspect `git diff --check` and `git status`.
