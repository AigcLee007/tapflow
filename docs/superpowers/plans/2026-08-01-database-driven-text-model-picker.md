# Database-Driven Text Model Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the canvas text-node model picker show only active, priced text models and routes returned by the authenticated v2 database catalog APIs, with no hardcoded placeholder models.

**Architecture:** Add a pure catalog mapper and a session-scoped React loading hook beside the existing video catalog implementation. The text node consumes mapped options, persists the real model and route identifiers, renders explicit loading/error/empty states, and blocks workflow launch when no valid route is selected. New text nodes start unconfigured rather than carrying a fake default.

**Tech Stack:** React 18, TypeScript, Vitest, Testing Library, v2 AI model catalog API.

---

### Task 1: Map active priced text models and routes

**Files:**
- Create: `src/flowCanvas/text/textModelCatalog.ts`
- Test: `src/flowCanvas/text/textModelCatalog.test.ts`

- [ ] **Step 1: Write the failing mapper tests**

Cover filtering by text modality and active status, excluding models without routes or positive pricing, honoring `defaultRouteKey`, sorting models/routes, and retaining the real `modelKey`, `routeId`, and `routeKey`.

- [ ] **Step 2: Run the mapper test and verify it fails**

Run: `npx vitest --run --exclude='.worktrees/**' src/flowCanvas/text/textModelCatalog.test.ts`

Expected: FAIL because `toTextModelOptions` does not exist.

- [ ] **Step 3: Implement the pure mapper**

Define focused types:

```ts
export type TextRouteOption = {
  credits: number;
  id: string;
  label: string;
  routeKey: string;
};

export type TextModelOption = {
  defaultRoute: TextRouteOption;
  id: string;
  label: string;
  modelFamily: string;
  modelKey: string;
  providerKey: string;
  routes: TextRouteOption[];
};
```

Only emit models with at least one text route whose `estimatedCredits` or `minChargeCredits` is a positive finite number.

- [ ] **Step 4: Run the mapper test and verify it passes**

Run: `npx vitest --run --exclude='.worktrees/**' src/flowCanvas/text/textModelCatalog.test.ts`

Expected: PASS.

### Task 2: Load and cache the authenticated text catalog

**Files:**
- Create: `src/flowCanvas/text/useTextGenerationCatalog.ts`
- Test: `src/flowCanvas/text/useTextGenerationCatalog.test.tsx`

- [ ] **Step 1: Write failing hook tests**

Verify one shared request per auth/session identity, `listAiModelCatalog("text")`, per-model route loading, no fallback entries on empty/error responses, and retry cache invalidation.

- [ ] **Step 2: Run the hook test and verify it fails**

Run: `npx vitest --run --exclude='.worktrees/**' src/flowCanvas/text/useTextGenerationCatalog.test.tsx`

Expected: FAIL because the hook does not exist.

- [ ] **Step 3: Implement the hook**

Mirror the established video catalog cache boundary and expose:

```ts
{ models, loading, error, retry }
```

Map API results through `toTextModelOptions` and never synthesize product models client-side.

- [ ] **Step 4: Run the hook test and verify it passes**

Run: `npx vitest --run --exclude='.worktrees/**' src/flowCanvas/text/useTextGenerationCatalog.test.tsx`

Expected: PASS.

### Task 3: Integrate the database catalog into text nodes

**Files:**
- Modify: `src/flowCanvas/nodes/FlowNodes.tsx`
- Modify: `src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx`
- Modify: `src/flowCanvas/utils/nodeFactory.ts`
- Modify: `src/flowCanvas/runtime/graphExecutor.ts`
- Delete: `src/config/textModels.ts`

- [ ] **Step 1: Add failing text-node behavior tests**

Verify the picker shows only mocked database options, selecting a model persists its real `modelKey`, `routeId`, and `routeKey`, empty catalogs show `暂无可用文本模型`, and generate is blocked locally with `NO_TEXT_GENERATION_ROUTE`.

- [ ] **Step 2: Run the focused node test and verify it fails**

Run: `npx vitest --run --exclude='.worktrees/**' src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx`

Expected: FAIL because the component still renders static models and launches unconfigured runs.

- [ ] **Step 3: Replace the static picker**

Use `useTextGenerationCatalog`, resolve the current option only against returned models/routes, show explicit loading/error/empty menu rows, select the catalog default route, display real credits, and retain existing outside-click/Escape dismissal behavior.

- [ ] **Step 4: Remove static text defaults**

Delete the five-item config, stop pre-populating new text nodes with `gpt-5.5` and `text.gpt-5-5`, and make legacy graph execution read only a persisted model identifier.

- [ ] **Step 5: Run all focused tests**

Run: `npx vitest --run --exclude='.worktrees/**' src/flowCanvas/text/textModelCatalog.test.ts src/flowCanvas/text/useTextGenerationCatalog.test.tsx src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx`

Expected: PASS.

### Task 4: Record, verify, commit, and push

**Files:**
- Modify: `PROJECT_RECORD.md`

- [ ] **Step 1: Record the production-facing behavior change**

Document that text model choices now come from the active published catalog/route/pricing state and that an empty database intentionally yields an unconfigured UI.

- [ ] **Step 2: Run final verification**

Run:

```bash
npx vitest --run --exclude='.worktrees/**' src/flowCanvas/text/textModelCatalog.test.ts src/flowCanvas/text/useTextGenerationCatalog.test.tsx src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx
npm run build
```

Expected: all focused tests pass and the production build exits successfully.

- [ ] **Step 3: Review only task-scoped changes**

Run: `git diff --check` and `git diff -- <task files>`.

Expected: no whitespace errors and no unrelated worktree changes included.

- [ ] **Step 4: Commit and push main**

```bash
git add <task files>
git commit -m "fix(canvas): load text models from catalog"
git push origin main
```

Expected: push succeeds and `origin/main` points to the new commit.
