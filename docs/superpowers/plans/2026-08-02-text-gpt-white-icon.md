# Text GPT White Icon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render OpenAI/GPT logos white in the dark text-model picker.

**Architecture:** Add a presentation-only OpenAI logo style helper beside the existing logo resolver and merge it into the menu and selected-model image styles.

**Tech Stack:** React, TypeScript, Vitest, Testing Library.

---

### Task 1: Apply OpenAI White Icon Styling

**Files:**
- Modify: `src/flowCanvas/nodes/FlowNodes.tsx`
- Modify: `src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx`

- [ ] **Step 1: Add a failing picker rendering assertion**

```ts
const openAiLogos = Array.from(document.querySelectorAll('img[src="/openai-icon.svg"]'));
expect(openAiLogos.length).toBeGreaterThan(0);
expect(openAiLogos.every((logo) => logo.style.filter === 'brightness(0) invert(1)')).toBe(true);
```

- [ ] **Step 2: Run the focused test and observe red**

```bash
npx vitest run src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx
```

Expected: the OpenAI image filter assertion fails because no white filter is set.

- [ ] **Step 3: Add the scoped style helper and consume it**

```ts
function getTextModelLogoColorStyle(logoKey?: string): React.CSSProperties {
  const key = String(logoKey || '').toLowerCase();
  return key.includes('openai') || key.includes('gpt')
    ? { filter: 'brightness(0) invert(1)' }
    : {};
}
```

Merge this helper into `textModelLogo` and `textModelTriggerLogo` only when rendering text-model image logos.

- [ ] **Step 4: Run focused test and production build**

```bash
npx vitest run src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/flowCanvas/nodes/FlowNodes.tsx src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx
git commit -m "fix(canvas): render GPT text model icon in white"
```
