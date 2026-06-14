# Project Menu and Confirmation Dialog Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the canvas project's browser-style delete confirmation with a dark action sheet and simplify the canvas project menu into the approved minimal TapNow-style shape.

**Architecture:** Keep the existing body-portal anchored menu behavior in `FlowTopToolbar`, but tighten its structure and remove mixed icon density. Replace the direct `window.confirm(...)` branch with local state that renders a custom destructive confirmation surface through the existing React tree, reusing shared menu/dialog primitives where helpful.

**Tech Stack:** React, TypeScript, Vite, Vitest, Testing Library, existing shared menu components

---

## File Map

- Modify: `src/flowCanvas/canvas/FlowTopToolbar.tsx`
  - tighten the project menu width and row structure
  - remove extra icons from non-highlight rows
  - replace `window.confirm(...)` deletion gate with a custom dark confirmation sheet
- Modify: `src/flowCanvas/canvas/FlowTopToolbar.test.tsx`
  - add regression coverage for the slimmer menu presentation
  - add deletion confirmation open/close behavior tests
- Modify: `PROJECT_RECORD.md`
  - record the completed UI refresh and validation commands

## Task 1: Add failing tests for the new menu and confirmation flow

**Files:**
- Modify: `src/flowCanvas/canvas/FlowTopToolbar.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add tests that assert:

```tsx
test("renders the project menu with the approved narrow minimal layout", async () => {
  render(
    <FlowTopToolbar
      cullingEnabled
      onToggleCulling={vi.fn()}
      saveStatus={{ label: "已保存到云端", status: "saved" }}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "打开项目菜单" }));

  const menu = screen.getByRole("menu", { name: "项目菜单" });
  expect(menu.style.width).toBe("288px");
  expect(screen.queryByTestId("project-menu-create-icon")).toBeNull();
  expect(screen.queryByTestId("project-menu-delete-icon")).toBeNull();
});

test("opens a custom dark confirmation sheet before deleting a project", async () => {
  deleteWorkspaceProjectMock.mockResolvedValue(undefined);

  render(
    <FlowTopToolbar
      cullingEnabled
      onToggleCulling={vi.fn()}
      projectId="project-1"
      saveStatus={{ label: "已保存到云端", status: "saved" }}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "打开项目菜单" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "删除项目" }));

  expect(screen.getByRole("dialog", { name: "删除当前项目" })).toBeTruthy();
  expect(deleteWorkspaceProjectMock).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the focused test file to verify RED**

Run:

```bash
npm test -- src/flowCanvas/canvas/FlowTopToolbar.test.tsx
```

Expected:

- FAIL because the menu is still `320px`
- FAIL because delete still uses `window.confirm(...)`

## Task 2: Implement the minimal project menu refresh

**Files:**
- Modify: `src/flowCanvas/canvas/FlowTopToolbar.tsx`

- [ ] **Step 1: Tighten the project menu width constant**

Change:

```ts
const PROJECT_MENU_WIDTH = 320;
```

to:

```ts
const PROJECT_MENU_WIDTH = 288;
```

- [ ] **Step 2: Update the menu row structure to the approved minimal layout**

Implement the menu so it follows this shape:

```tsx
<button
  type="button"
  role="menuitem"
  className={`${MENU_ITEM_CLASS} min-h-[68px] justify-between rounded-[18px] px-5`}
>
  <span className={MENU_ITEM_PRIMARY_CLASS}>返回工作空间</span>
  <ChevronRight size={16} />
</button>

<button type="button" role="menuitem" className={`${MENU_ITEM_CLASS} min-h-[60px] rounded-none px-5`}>
  <span className={MENU_ITEM_PRIMARY_CLASS}>重命名项目</span>
</button>

<button type="button" role="menuitem" className={`${MENU_ITEM_CLASS} min-h-[60px] rounded-none px-5`}>
  <span className={MENU_ITEM_PRIMARY_CLASS}>新建项目</span>
</button>

<button
  type="button"
  role="menuitem"
  className={`${MENU_ITEM_CLASS} min-h-[60px] rounded-b-[18px] rounded-t-none px-5 text-red-200 hover:bg-red-500/12`}
>
  <span className={MENU_ITEM_PRIMARY_CLASS}>删除项目</span>
</button>
```

Requirements:

- keep the top row highlighted and chevron-led
- remove `Plus` and `Trash2` from the create/delete rows
- keep loading copy support for create/delete states

- [ ] **Step 3: Remove no-longer-needed icon-specific styling for project menu rows**

Delete the now-unused icon-row helper if it becomes dead code:

```ts
const projectMenuLabelWithIconStyle: React.CSSProperties = { ... }
```

and remove unused icon imports tied only to that helper.

## Task 3: Replace browser confirm with the dark canvas action sheet

**Files:**
- Modify: `src/flowCanvas/canvas/FlowTopToolbar.tsx`

- [ ] **Step 1: Introduce local state for delete confirmation visibility**

Add:

```ts
const [showDeleteProjectConfirm, setShowDeleteProjectConfirm] = useState(false);
```

- [ ] **Step 2: Split delete flow into open-confirm and confirm-delete actions**

Refactor:

```ts
const handleDeleteProject = useCallback(async () => {
  if (!projectId) return;
  ...
}, [navigate, projectId]);
```

into:

```ts
const openDeleteProjectConfirm = useCallback(() => {
  if (!projectId) return;
  projectMenuLayer.closeLayer();
  setShowDeleteProjectConfirm(true);
}, [projectId, projectMenuLayer]);

const confirmDeleteProject = useCallback(async () => {
  if (!projectId) return;
  ...
  setShowDeleteProjectConfirm(false);
}, [navigate, projectId]);
```

Requirements:

- remove `window.confirm(...)`
- preserve existing deletion success path and navigation
- preserve current loading/error safety

- [ ] **Step 3: Render the confirmation sheet through a portal-ready overlay block**

Add a custom dialog block like:

```tsx
{showDeleteProjectConfirm ? (
  <div className="fixed inset-0 z-[2500] grid place-items-center bg-black/58 px-4 backdrop-blur-sm">
    <div
      aria-modal="true"
      aria-labelledby="delete-project-title"
      className="w-full max-w-[340px] rounded-[24px] border border-white/10 bg-[#17191d]/96 p-5 shadow-[0_28px_72px_rgba(0,0,0,0.48)]"
      role="dialog"
    >
      <h2 id="delete-project-title" className="text-[18px] font-semibold text-white">
        删除当前项目
      </h2>
      <p className="mt-3 text-[13px] leading-6 text-white/58">
        删除后项目、画布和相关结果将无法恢复。
      </p>
      <div className="mt-5 flex items-center gap-2">
        <button type="button" className="h-10 rounded-full bg-[#ef6b6b] px-5 text-[13px] font-semibold text-[#140b0b]">
          删除
        </button>
        <button type="button" className="h-10 rounded-full border border-white/10 bg-white/6 px-5 text-[13px] font-semibold text-white/88">
          取消
        </button>
      </div>
    </div>
  </div>
) : null}
```

Behavior requirements:

- backdrop click closes it
- `Escape` closes it
- delete button reflects `正在删除...`
- inline error text appears on failure

## Task 4: Verify the behavior with focused tests and build

**Files:**
- Modify: `src/flowCanvas/canvas/FlowTopToolbar.test.tsx`

- [ ] **Step 1: Extend the confirmation tests to cover close and confirm behavior**

Add coverage like:

```tsx
fireEvent.click(screen.getByRole("menuitem", { name: "删除项目" }));
fireEvent.click(screen.getByRole("button", { name: "取消" }));
await waitFor(() => {
  expect(screen.queryByRole("dialog", { name: "删除当前项目" })).toBeNull();
});
```

and:

```tsx
fireEvent.click(screen.getByRole("button", { name: "删除" }));
await waitFor(() => {
  expect(deleteWorkspaceProjectMock).toHaveBeenCalledWith("project-1");
});
```

- [ ] **Step 2: Run the focused test file to verify GREEN**

Run:

```bash
npm test -- src/flowCanvas/canvas/FlowTopToolbar.test.tsx
```

Expected:

- PASS

- [ ] **Step 3: Run the production build**

Run:

```bash
npm run build
```

Expected:

- build completes with exit code 0

## Task 5: Record, commit, and push

**Files:**
- Modify: `PROJECT_RECORD.md`

- [ ] **Step 1: Add a dated project-record entry**

Document:

- minimal canvas project menu refresh
- dark delete confirmation sheet replacing browser confirm
- validation commands used

- [ ] **Step 2: Inspect git status**

Run:

```bash
git status --short
```

Expected:

- only the touched implementation, test, plan/spec/mockup, and record files appear for this task

- [ ] **Step 3: Commit and push**

Run:

```bash
git add src/flowCanvas/canvas/FlowTopToolbar.tsx src/flowCanvas/canvas/FlowTopToolbar.test.tsx PROJECT_RECORD.md docs/superpowers/specs/2026-06-14-project-menu-and-confirmation-dialog-refresh-design.md docs/superpowers/plans/2026-06-14-project-menu-and-confirmation-dialog-refresh.md docs/superpowers/mockups/2026-06-14-modal-menu-options/dialog-options-board.svg docs/superpowers/mockups/2026-06-14-modal-menu-options/menu-options-board.svg
git commit -m "feat: refresh canvas project menu and delete dialog"
git push origin main
```

Expected:

- commit succeeds
- push succeeds to `origin/main`
