# Text Node Default Terra Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every newly created text node select GPT-5.6-terra and its default Aittco route.

**Architecture:** Keep default model selection in `createFlowNode`, the existing synchronous node-creation boundary. This writes stable product identifiers only for `text` nodes; explicit caller overrides retain their current precedence and saved nodes are untouched.

**Tech Stack:** TypeScript, Vitest, React Flow canvas node factory.

---

### Task 1: Initialize Text Nodes With Terra

**Files:**
- Modify: `src/flowCanvas/utils/nodeFactory.ts`
- Create: `src/flowCanvas/utils/nodeFactory.test.ts`

- [ ] **Step 1: Write a failing node-factory regression test**

```ts
import { describe, expect, test } from "vitest";

import { createFlowNode } from "./nodeFactory";

describe("createFlowNode", () => {
  test("initializes text nodes with the GPT-5.6-terra product route", () => {
    expect(createFlowNode("text", { x: 0, y: 0 }).data).toMatchObject({
      modelId: "gpt-5.6-terra",
      routeKey: "text.gpt-5-6-terra",
    });
  });

  test("keeps explicit text model overrides", () => {
    expect(createFlowNode("text", { x: 0, y: 0 }, {
      modelId: "claude-opus-5",
      routeKey: "text.claude-opus-5",
    }).data).toMatchObject({
      modelId: "claude-opus-5",
      routeKey: "text.claude-opus-5",
    });
  });
});
```

- [ ] **Step 2: Run the focused test and observe red**

Run:

```bash
npx vitest run src/flowCanvas/utils/nodeFactory.test.ts
```

Expected: the default-value assertion fails because new text nodes do not yet contain `modelId` or `routeKey`.

- [ ] **Step 3: Add the minimal text-node defaults**

In the `data` object inside `createFlowNode`, extend the existing route/model defaults with:

```ts
modelId: kind === "text" ? "gpt-5.6-terra" : undefined,
routeKey:
  kind === "image"
    ? "image.default"
    : kind === "video"
      ? "video.default"
      : kind === "text"
        ? "text.gpt-5-6-terra"
        : undefined,
```

Keep the later `...overrides` merge unchanged so explicit values win.

- [ ] **Step 4: Run focused tests and the production build**

```bash
npx vitest run src/flowCanvas/utils/nodeFactory.test.ts
npm run build
```

Expected: both tests and the Vite production build pass.

- [ ] **Step 5: Commit**

```bash
git add src/flowCanvas/utils/nodeFactory.ts src/flowCanvas/utils/nodeFactory.test.ts
git commit -m "feat(canvas): default text nodes to GPT-5.6-terra"
```
