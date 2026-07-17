# 视频参数时长与浮层修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将未配置模型的视频时长默认范围改为 4–15 秒，以 LibTV 式单行滑杆呈现，并让参数面板稳定显示在所有画布节点与工具条之上。

**Architecture:** 保留已确认模型能力作为权威范围，仅调整未确认能力的安全默认值。新增独立 `VideoParameterPopover`，通过 body Portal、fixed 坐标和共享高层菜单 z-index 锚定参数按钮，避免 ReactFlow 节点 stacking context。

**Tech Stack:** React 19、TypeScript、Tailwind CSS、Vitest、Testing Library、React Portal、现有 `useDismissibleLayer`。

---

### Task 1: 默认时长能力范围

**Files:**
- Modify: `src/flowCanvas/video/videoGenerationCapabilities.test.ts`
- Modify: `src/flowCanvas/video/videoGenerationCapabilities.ts`

- [x] **Step 1: 写默认范围红测**

在 `videoGenerationCapabilities.test.ts` 中断言：

```ts
const defaults = createSafeDefaultVideoCapabilities();
expect(defaults.minDurationSeconds).toBe(4);
expect(defaults.maxDurationSeconds).toBe(15);
expect(defaults.durationStepSeconds).toBe(1);
```

- [x] **Step 2: 运行红测**

Run: `npm.cmd test -- src/flowCanvas/video/videoGenerationCapabilities.test.ts`

Expected: FAIL，实际默认值仍为 `2` 和 `8`。

- [x] **Step 3: 修改安全默认能力**

在 `createSafeDefaultVideoCapabilities()` 中设置：

```ts
maxDurationSeconds: 15,
minDurationSeconds: 4,
```

不修改 `mergeVideoCapabilities()` 对已确认模型能力的覆盖规则。

- [x] **Step 4: 运行绿测**

Run: `npm.cmd test -- src/flowCanvas/video/videoGenerationCapabilities.test.ts`

Expected: PASS。

### Task 2: LibTV 式单行时长滑杆

**Files:**
- Modify: `src/flowCanvas/video/VideoParameterPanel.test.tsx`
- Modify: `src/flowCanvas/video/VideoParameterPanel.tsx`

- [x] **Step 1: 写时长 UI 红测**

新增测试断言默认范围、单行控件和模型能力覆盖：

```ts
const slider = screen.getByRole("slider", { name: "视频时长滑杆" });
expect(slider.getAttribute("min")).toBe("4");
expect(slider.getAttribute("max")).toBe("15");
expect(screen.getByLabelText("视频时长控制").contains(slider)).toBe(true);
expect(screen.queryByText(/^最短 /)).toBeNull();
expect(screen.queryByText(/^最长 /)).toBeNull();
```

已确认模型使用 `min=3`、`max=7`、`step=2` 的既有测试继续保留，证明模型能力优先。

- [x] **Step 2: 运行红测**

Run: `npm.cmd test -- src/flowCanvas/video/VideoParameterPanel.test.tsx`

Expected: FAIL，默认范围和 `视频时长控制` 尚不存在，最短/最长文字仍可见。

- [x] **Step 3: 实现紧凑时长行**

将时长区域改为：

```tsx
<div aria-label="视频时长控制" className="flex items-center gap-3">
  <input aria-label="视频时长滑杆" className="h-1 min-w-0 flex-1 cursor-pointer accent-sky-300" ... />
  <div className="flex h-8 shrink-0 items-center rounded-[8px] bg-black/20 px-2">
    <input aria-label="视频时长输入" className="w-9 ..." ... />
    <span>秒</span>
  </div>
</div>
```

删除独立最短/最长文字行，保留校正状态提示。

- [x] **Step 4: 运行绿测**

Run: `npm.cmd test -- src/flowCanvas/video/VideoParameterPanel.test.tsx`

Expected: PASS。

### Task 3: 参数 Portal 与高层定位

**Files:**
- Create: `src/flowCanvas/video/VideoParameterPopover.tsx`
- Create: `src/flowCanvas/video/VideoParameterPopover.test.ts`
- Modify: `src/flowCanvas/video/VideoNodeComposer.tsx`
- Modify: `src/flowCanvas/video/VideoNodeComposer.test.tsx`

- [x] **Step 1: 写定位函数红测**

为纯函数 `getVideoParameterPopoverPosition` 覆盖：

```ts
expect(getVideoParameterPopoverPosition(anchor, { width: 1440, height: 900 }, { width: 480, height: 620 }))
  .toMatchObject({ placement: "top" });
expect(getVideoParameterPopoverPosition(topAnchor, { width: 390, height: 844 }, { width: 358, height: 620 }))
  .toMatchObject({ left: 16, placement: "bottom" });
```

- [x] **Step 2: 写 Composer Portal 红测**

打开参数面板后断言：

```ts
const dialog = screen.getByRole("dialog", { name: "视频参数" });
expect(dialog.parentElement).toBe(document.body);
expect(dialog.style.position).toBe("fixed");
expect(dialog.style.zIndex).toBe("10020");
```

并保留 Escape、外部点击和焦点恢复测试。

- [x] **Step 3: 运行红测**

Run: `npm.cmd test -- src/flowCanvas/video/VideoParameterPopover.test.ts src/flowCanvas/video/VideoNodeComposer.test.tsx`

Expected: FAIL，新组件不存在，现有参数面板仍嵌套在 Composer 内。

- [x] **Step 4: 实现定位函数与 Portal**

`VideoParameterPopover.tsx`：

```ts
export const VIDEO_PARAMETER_POPOVER_Z_INDEX = 10020;

export function getVideoParameterPopoverPosition(anchor, viewport, panel) {
  const margin = 16;
  const gap = 8;
  const left = Math.min(
    Math.max(anchor.left, margin),
    Math.max(margin, viewport.width - panel.width - margin),
  );
  const topPosition = anchor.top - gap - panel.height;
  if (topPosition >= margin) return { left, placement: "top" as const, top: topPosition };
  return {
    left,
    placement: "bottom" as const,
    top: Math.min(anchor.bottom + gap, Math.max(margin, viewport.height - panel.height - margin)),
  };
}
```

组件使用 `createPortal(..., document.body)`、`position: fixed`、`zIndex: 10020`，在 resize/scroll 时重新读取锚点和面板尺寸。

- [x] **Step 5: 接入 Composer**

将现有参数面板绝对定位容器替换为：

```tsx
<VideoParameterPopover anchorRef={parameterButtonRef} layerRef={parameterLayer.ref}>
  <VideoParameterPanel capabilities={capabilities} onChange={setParams} value={params} />
</VideoParameterPopover>
```

参数按钮同时写入 `parameterLayer.triggerRef`，确保 Portal 外部点击判断和焦点恢复仍正确。

- [x] **Step 6: 运行绿测**

Run: `npm.cmd test -- src/flowCanvas/video/VideoParameterPopover.test.ts src/flowCanvas/video/VideoNodeComposer.test.tsx`

Expected: PASS。

### Task 4: 回归、记录与交付

**Files:**
- Modify: `PROJECT_RECORD.md`
- Inspect: all Task 1–3 files

- [x] **Step 1: 更新项目记录**

记录默认 `4–15 秒`、模型能力优先、LibTV 式单行滑杆、Portal 高层定位和验证结果。

- [x] **Step 2: 运行聚焦回归**

Run:

```bash
npm.cmd test -- src/flowCanvas/video scripts/smoke-video-node.test.ts scripts/smoke-video-node-visual.test.ts src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx
npm.cmd run smoke:video-node
npm.cmd run build
git diff --check
```

Expected: 测试、功能 smoke 和构建全部退出 0；构建仅允许既有 Browserslist、动态导入和 chunk size 警告。

- [x] **Step 3: 提交并推送分支**

```bash
git add PROJECT_RECORD.md docs/superpowers/plans/2026-07-17-video-duration-layering-fix.md src/flowCanvas/video
git commit -m "fix: stabilize video parameter panel"
git push -u origin codex/video-duration-layering-fix
```
