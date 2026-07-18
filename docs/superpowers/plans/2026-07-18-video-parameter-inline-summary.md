# Video Parameter Inline Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with review checkpoints.

**Goal:** Replace the separate video parameter button and full-width summary row with a compact, synchronized LibTV-style parameter capsule in the bottom toolbar.

**Architecture:** Keep `VideoNodeComposer` as the owner of normalized video params and the existing `VideoParameterPopover` as the only parameter surface. The capsule becomes the popover trigger and anchor; no API, workflow, billing, or persisted data contracts change. Existing responsive flex wrapping remains the layout boundary.

**Tech Stack:** React, TypeScript, lucide-react, Tailwind utility classes, Vitest, Testing Library, Vite.

---

### Task 1: Lock The Inline Toolbar Contract With Tests

**Files:**
- Modify: `D:\tapnow-flow\src\flowCanvas\video\VideoNodeComposer.test.tsx`

- [ ] **Step 1: Replace the current summary test assertions**

Update the existing summary test so it asserts the capsule is in the toolbar and the standalone parameter button is absent:

```tsx
const summary = screen.getByRole("button", { name: "视频参数摘要" });
expect(summary.textContent).toContain("自动 · 720P · 4 秒 · 1 个 · 音频关闭");
expect(summary.parentElement?.parentElement?.querySelector("button[aria-label=\"视频参数\"]")).toBeNull();
```

Keep the existing rerender assertion for `16:9 · 1080P · 9 秒 · 2 个 · 音频开启`.

- [ ] **Step 2: Add the capsule interaction assertion**

Add this test:

```tsx
test("opens the parameter popover from the inline summary capsule", () => {
  const data = { generationPrompt: "", params: { videoGeneration: createDefaultVideoGenerationParams() } } as any;
  render(<VideoNodeComposer data={data} generating={false} nodeId="video-1" onGenerate={vi.fn()} onUpdate={vi.fn()} selected />);

  fireEvent.click(screen.getByRole("button", { name: "视频参数摘要" }));

  expect(screen.getByRole("dialog", { name: "视频参数" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "视频参数" })).toBeNull();
});
```

- [ ] **Step 3: Run the focused test and confirm it fails**

Run `npx.cmd vitest --run --exclude ".worktrees/**" src/flowCanvas/video/VideoNodeComposer.test.tsx`.
Expected: FAIL because the current implementation still renders the standalone parameter button and places the summary after the toolbar.

### Task 2: Move The Capsule Into The Toolbar And Re-anchor The Popover

**Files:**
- Modify: `D:\tapnow-flow\src\flowCanvas\video\VideoNodeComposer.tsx`

- [ ] **Step 1: Replace the trigger ref and import the closed-state icon**

Rename `parameterButtonRef` to `parameterTriggerRef` and add `ChevronDown` to the lucide import. Keep the existing dismiss-layer callback, but point it at `parameterTriggerRef`.

- [ ] **Step 2: Replace the standalone parameter button with the inline capsule**

Inside the existing bottom toolbar flex container, render:

```tsx
<div className="relative min-w-0 max-w-full">
  <button
    ref={(element) => {
      parameterTriggerRef.current = element;
      parameterLayer.triggerRef.current = element;
    }}
    aria-expanded={parameterLayer.open}
    aria-label="视频参数摘要"
    className="inline-flex h-[38px] max-w-full min-w-0 items-center gap-2 rounded-[10px] border border-white/10 bg-[#303036] px-3 text-xs font-bold text-white/90 transition hover:border-white/25 hover:bg-[#383840] focus:border-sky-300/50 focus:outline-none"
    onClick={() => {
      setModelOpen(false);
      if (parameterLayer.open) parameterLayer.dismissLayer();
      else parameterLayer.openLayer();
    }}
    type="button"
  >
    <RectangleHorizontal aria-hidden="true" className="shrink-0" size={16} />
    <span className="min-w-0 truncate">{parameterSummary}</span>
    {parameterLayer.open ? <ChevronUp aria-hidden="true" className="shrink-0 text-white/55" size={15} /> : <ChevronDown aria-hidden="true" className="shrink-0 text-white/55" size={15} />}
  </button>
  {parameterLayer.open ? <VideoParameterPopover anchorRef={parameterTriggerRef} layerRef={parameterLayer.ref}><VideoParameterPanel capabilities={capabilities} onChange={setParams} value={params} /></VideoParameterPopover> : null}
</div>
```

- [ ] **Step 3: Remove the old popover and full-width summary row**

Delete the old popover nested under the standalone parameter button and delete the separate `mt-2 w-full` summary button after the toolbar. The capsule above is the only parameter trigger.

- [ ] **Step 4: Preserve mutual exclusion and dismissal behavior**

Keep model-menu opening logic calling `parameterLayer.dismissLayer()`. Keep Escape/outside-click focus restoration pointed at `parameterTriggerRef`.

### Task 3: Verify, Record, And Commit

**Files:**
- Modify: `D:\tapnow-flow\PROJECT_RECORD.md`

- [ ] **Step 1: Run video regressions**

Run:

```bash
npx.cmd vitest --run --exclude ".worktrees/**" src/flowCanvas/video/VideoNodeComposer.test.tsx src/flowCanvas/video/VideoParameterPanel.test.tsx
npx.cmd vitest --run --exclude ".worktrees/**" src/flowCanvas/video scripts/smoke-video-node.test.ts scripts/smoke-video-node-visual.test.ts src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx
```

Expected: both commands exit 0.

- [ ] **Step 2: Run production build and diff checks**

Run:

```bash
npm.cmd run build
git diff --check
```

Expected: build exits 0 with only existing repository warnings.

- [ ] **Step 3: Update the project record**

Add a dated entry recording the inline capsule layout, preserved behavior, test counts, and any browser smoke limitation.

- [ ] **Step 4: Commit only scoped files**

```bash
git add src/flowCanvas/video/VideoNodeComposer.tsx src/flowCanvas/video/VideoNodeComposer.test.tsx PROJECT_RECORD.md
git diff --cached --check
git commit -m "fix: place video parameter summary inline"
```
