# Global Menu and Auth Layout Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify all major menus and dropdowns to the same dark TapNow-style UI, fix menu dismissal conflicts and canvas obstruction issues, replace outdated non-canvas branding with the product logo, and reduce login page first-screen scale so it renders cleanly on common desktop viewports.

**Architecture:** Build one shared transient-surface layer first: visual primitives for menu surfaces and a lightweight open/close coordination hook. Then migrate high-visibility surfaces in order: shared shell/logo, canvas menus, workspace/creator dropdowns, admin/settings dropdowns, and finally the auth layout. Keep all business logic in place and replace only menu rendering, positioning, and trigger behavior.

**Tech Stack:** React, TypeScript, Vite, Tailwind utility classes, inline style-based canvas components, Vitest, Testing Library, existing portal-based menu/dialog patterns.

---

## File Map

### New files

- `src/components/menu/MenuSurface.tsx`
  - Shared menu shell, sections, items, divider, and icon/text layout.
- `src/components/menu/MenuSelect.tsx`
  - Shared custom dropdown/select trigger and popup list.
- `src/components/menu/useDismissibleLayer.ts`
  - Shared dismissal and mutual-exclusion behavior for menus/popovers.
- `src/components/menu/menuStyles.ts`
  - Shared tokens for radius, padding, typography, shadow, border, and density variants.
- `src/components/menu/useDismissibleLayer.test.tsx`
  - Unit coverage for outside click, `Escape`, and one-open-at-a-time behavior.
- `src/components/menu/MenuSelect.test.tsx`
  - Coverage for custom dropdown open/close and option selection.

### Modified files

- `src/components/EntityActionMenu.tsx`
  - Migrate existing project/asset action menu to shared menu surface and dismissal layer.
- `src/app/WorkspaceShell.tsx`
  - Replace legacy top-left logo block with shared brand mark and move account menu onto shared menu surface.
- `src/app/WorkspaceShell.test.tsx`
  - Lock logo behavior and account menu behavior against the new shared surface.
- `src/flowCanvas/canvas/FlowTopToolbar.tsx`
  - Fix canvas logo menu obstruction and migrate it to shared menu primitives.
- `src/flowCanvas/canvas/FlowTopToolbar.test.tsx`
  - Lock menu open/close/dismiss behavior and canvas logo menu rendering.
- `src/flowCanvas/canvas/FlowLeftAddPanel.tsx`
  - Align add-node flyout and user flyout with shared menu spacing/typography and coordinated dismissal behavior.
- `src/flowCanvas/nodes/ImageMoreMenu.tsx`
  - Restyle image more menu to shared metrics and plug into the shared dismissal layer.
- `src/flowCanvas/nodes/FlowNodes.tsx`
  - Close node menus when peer menus open and swap visible popup styling to shared menu primitives where feasible.
- `src/workspace/ProjectToolbar.tsx`
  - Replace sort/filter/view dropdowns with the shared custom select.
- `src/workspace/WorkspacePage.test.tsx`
  - Add checks that workspace dropdowns render through the shared custom select rather than native select UI.
- `src/account/ProviderSettingsPage.tsx`
  - Replace visible admin selects with `MenuSelect`.
- `src/account/ai-settings/AiSettingsPage.tsx`
  - Replace visible model-management selects with `MenuSelect`.
- `src/auth/LoginPage.tsx`
  - Reduce hero and form layout scale and tighten spacing.
- `src/auth/AuthPages.test.tsx`
  - Add layout-level assertions around auth shell sizing classes and visible login hierarchy.
- `PROJECT_RECORD.md`
  - Record the completed unification work and validation commands.

### Validation targets

- `src/components/menu/useDismissibleLayer.test.tsx`
- `src/components/menu/MenuSelect.test.tsx`
- `src/app/WorkspaceShell.test.tsx`
- `src/flowCanvas/canvas/FlowTopToolbar.test.tsx`
- `src/workspace/WorkspacePage.test.tsx`
- `src/auth/AuthPages.test.tsx`
- `npm run build`

---

### Task 1: Build Shared Menu Tokens and Dismissal Layer

**Files:**
- Create: `src/components/menu/menuStyles.ts`
- Create: `src/components/menu/useDismissibleLayer.ts`
- Create: `src/components/menu/useDismissibleLayer.test.tsx`

- [ ] **Step 1: Write the failing dismissal-layer tests**

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { useDismissibleLayer } from "./useDismissibleLayer";

function TestMenuPair() {
  const first = useDismissibleLayer("first");
  const second = useDismissibleLayer("second");

  return (
    <div>
      <button onClick={first.toggle}>Open First</button>
      <button onClick={second.toggle}>Open Second</button>
      {first.open ? <div role="menu">First Menu</div> : null}
      {second.open ? <div role="menu">Second Menu</div> : null}
    </div>
  );
}

describe("useDismissibleLayer", () => {
  test("closes the first layer when a second layer opens", () => {
    render(<TestMenuPair />);
    fireEvent.click(screen.getByRole("button", { name: "Open First" }));
    fireEvent.click(screen.getByRole("button", { name: "Open Second" }));
    expect(screen.queryByText("First Menu")).toBeNull();
    expect(screen.getByText("Second Menu")).toBeTruthy();
  });

  test("closes the active layer on Escape and outside click", () => {
    render(<TestMenuPair />);
    fireEvent.click(screen.getByRole("button", { name: "Open First" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByText("First Menu")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the new test file and verify it fails**

Run: `npm test -- src/components/menu/useDismissibleLayer.test.tsx`

Expected: FAIL because `src/components/menu/useDismissibleLayer.ts` does not exist yet.

- [ ] **Step 3: Implement the minimal dismissal layer**

```ts
import { useCallback, useEffect, useId, useRef, useState } from "react";

let activeLayerId: string | null = null;
const listeners = new Set<(nextActiveId: string | null) => void>();

function publish(nextActiveId: string | null) {
  activeLayerId = nextActiveId;
  listeners.forEach((listener) => listener(nextActiveId));
}

export function useDismissibleLayer(layerKey?: string) {
  const generatedId = useId();
  const id = layerKey || generatedId;
  const ref = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const listener = (nextActiveId: string | null) => {
      if (nextActiveId !== id) setOpen(false);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (activeLayerId === id) publish(null);
    };
  }, [id]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (ref.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
      if (activeLayerId === id) publish(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      if (activeLayerId === id) publish(null);
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [id, open]);

  const openLayer = useCallback(() => {
    publish(id);
    setOpen(true);
  }, [id]);

  const closeLayer = useCallback(() => {
    if (activeLayerId === id) publish(null);
    setOpen(false);
  }, [id]);

  const toggle = useCallback(() => {
    if (open) {
      closeLayer();
    } else {
      openLayer();
    }
  }, [closeLayer, open, openLayer]);

  return { closeLayer, open, openLayer, ref, toggle, triggerRef };
}
```

- [ ] **Step 4: Add shared visual tokens**

```ts
export const MENU_SURFACE_CLASS =
  "border border-white/10 bg-[#1c1c20]/95 shadow-[0_28px_72px_rgba(0,0,0,0.5)] backdrop-blur-[18px]";

export const MENU_RADIUS_CLASS = "rounded-[26px]";
export const MENU_ITEM_CLASS =
  "flex w-full items-center gap-3 rounded-[18px] px-4 text-left text-white transition hover:bg-white/[0.07]";
export const MENU_ITEM_PRIMARY_CLASS = "text-[15px] font-semibold";
export const MENU_ITEM_SECONDARY_CLASS = "text-[12px] text-white/45";
export const MENU_DIVIDER_CLASS = "my-2 h-px bg-white/8";
```

- [ ] **Step 5: Run the targeted tests and verify they pass**

Run: `npm test -- src/components/menu/useDismissibleLayer.test.tsx`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/menu/menuStyles.ts src/components/menu/useDismissibleLayer.ts src/components/menu/useDismissibleLayer.test.tsx
git commit -m "feat: add shared dismissible menu layer"
```

### Task 2: Build Shared Menu Surface and Custom Select

**Files:**
- Create: `src/components/menu/MenuSurface.tsx`
- Create: `src/components/menu/MenuSelect.tsx`
- Create: `src/components/menu/MenuSelect.test.tsx`

- [ ] **Step 1: Write the failing custom-select tests**

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { MenuSelect } from "./MenuSelect";

describe("MenuSelect", () => {
  test("opens a styled option list and selects a value", () => {
    render(
      <MenuSelect
        label="排序"
        onChange={() => undefined}
        options={[
          { label: "最近更新", value: "updated" },
          { label: "最近创建", value: "created" },
        ]}
        value="updated"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "排序 最近更新" }));
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitem", { name: "最近创建" }));
  });
});
```

- [ ] **Step 2: Run the new select tests and verify they fail**

Run: `npm test -- src/components/menu/MenuSelect.test.tsx`

Expected: FAIL because `MenuSelect` does not exist yet.

- [ ] **Step 3: Implement `MenuSurface` and `MenuSelect`**

```tsx
import React from "react";
import { ChevronDown } from "lucide-react";

import { MENU_DIVIDER_CLASS, MENU_ITEM_CLASS, MENU_ITEM_PRIMARY_CLASS, MENU_RADIUS_CLASS, MENU_SURFACE_CLASS } from "./menuStyles";
import { useDismissibleLayer } from "./useDismissibleLayer";

export function MenuSurface({ children, className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`${MENU_SURFACE_CLASS} ${MENU_RADIUS_CLASS} ${className}`.trim()} {...props}>{children}</div>;
}

export function MenuDivider() {
  return <div className={MENU_DIVIDER_CLASS} />;
}

export function MenuSelect({
  label,
  options,
  onChange,
  value,
}: {
  label: string;
  options: Array<{ label: string; value: string }>;
  onChange: (value: string) => void;
  value: string;
}) {
  const layer = useDismissibleLayer(`select-${label}`);
  const current = options.find((option) => option.value === value) ?? options[0];

  return (
    <div className="relative">
      <button
        ref={layer.triggerRef as React.RefObject<HTMLButtonElement>}
        aria-expanded={layer.open}
        aria-haspopup="menu"
        aria-label={`${label} ${current?.label ?? ""}`.trim()}
        className="inline-flex h-16 items-center gap-3 rounded-[26px] border border-white/10 bg-[#17171b] px-7 text-[15px] font-semibold text-white"
        onClick={layer.toggle}
        type="button"
      >
        <span>{current?.label}</span>
        <ChevronDown size={18} className={layer.open ? "rotate-180 transition" : "transition"} />
      </button>
      {layer.open ? (
        <MenuSurface
          ref={layer.ref as React.RefObject<HTMLDivElement>}
          className="absolute left-0 top-[calc(100%+12px)] min-w-[180px] p-2"
          role="menu"
        >
          {options.map((option) => (
            <button
              key={option.value}
              className={`${MENU_ITEM_CLASS} h-12`}
              onClick={() => {
                onChange(option.value);
                layer.closeLayer();
              }}
              role="menuitem"
              type="button"
            >
              <span className={MENU_ITEM_PRIMARY_CLASS}>{option.label}</span>
            </button>
          ))}
        </MenuSurface>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Run the select tests and verify they pass**

Run: `npm test -- src/components/menu/MenuSelect.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/menu/MenuSurface.tsx src/components/menu/MenuSelect.tsx src/components/menu/MenuSelect.test.tsx
git commit -m "feat: add shared menu surface and select"
```

### Task 3: Migrate Shared Shell Branding and Account Menu

**Files:**
- Modify: `src/app/WorkspaceShell.tsx`
- Modify: `src/app/WorkspaceShell.test.tsx`
- Modify: `src/components/EntityActionMenu.tsx`

- [ ] **Step 1: Add failing shell tests for logo and shared account menu**

```tsx
test("renders the shared brand mark instead of the legacy cyan square icon", () => {
  renderShell();
  expect(screen.getByTestId("brand-mark")).toBeTruthy();
  expect(screen.queryByText("Workflow")).toBeNull();
});

test("closes the account menu when clicking blank space", () => {
  renderShell();
  fireEvent.click(screen.getByRole("button", { name: /打开账户菜单/ }));
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole("button", { name: "账户管理" })).toBeNull();
});
```

- [ ] **Step 2: Run the shell tests and verify they fail**

Run: `npm test -- src/app/WorkspaceShell.test.tsx`

Expected: FAIL because the shell still renders the old cyan block and local menu state.

- [ ] **Step 3: Replace the top-left icon block and move account menu onto shared primitives**

```tsx
import { BrandMark } from "./brand/BrandMark";
import { MenuSurface } from "../components/menu/MenuSurface";
import { useDismissibleLayer } from "../components/menu/useDismissibleLayer";

const accountLayer = useDismissibleLayer("workspace-shell-account");

<button
  aria-label={`AI Flow ${tenantName}`}
  className="flex min-w-0 items-center gap-4 text-left"
  onClick={() => goTo(HOME_ROUTE)}
  type="button"
>
  <BrandMark size="canvas" showCaption={false} />
  <span className="min-w-0">
    <span className="block truncate text-xl font-semibold text-white">AI Flow</span>
    <span className="block truncate text-sm text-slate-500">{tenantName}</span>
  </span>
</button>

{accountLayer.open ? (
  <MenuSurface
    ref={accountLayer.ref as React.RefObject<HTMLDivElement>}
    className="absolute right-0 top-[calc(100%+14px)] w-[320px] p-4"
    role="menu"
  >
    ...
  </MenuSurface>
) : null}
```

- [ ] **Step 4: Update `EntityActionMenu` to consume `MenuSurface` classes**

```tsx
import { MenuSurface } from "./menu/MenuSurface";
import { MENU_ITEM_CLASS } from "./menu/menuStyles";

const menu = (
  <MenuSurface
    ref={menuRef}
    className={`${position ? "fixed" : "absolute right-0 top-11"} z-[1800] w-[220px] overflow-hidden p-2`}
    role="menu"
    style={position ? { left: position.left, top: position.top } : undefined}
  >
    ...
  </MenuSurface>
);
```

- [ ] **Step 5: Run the shared-shell tests and verify they pass**

Run: `npm test -- src/app/WorkspaceShell.test.tsx`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/WorkspaceShell.tsx src/app/WorkspaceShell.test.tsx src/components/EntityActionMenu.tsx
git commit -m "feat: unify shell branding and account menu"
```

### Task 4: Unify Canvas Menus and Fix Canvas Logo Menu Obstruction

**Files:**
- Modify: `src/flowCanvas/canvas/FlowTopToolbar.tsx`
- Modify: `src/flowCanvas/canvas/FlowLeftAddPanel.tsx`
- Modify: `src/flowCanvas/nodes/ImageMoreMenu.tsx`
- Modify: `src/flowCanvas/nodes/FlowNodes.tsx`
- Modify: `src/flowCanvas/canvas/FlowTopToolbar.test.tsx`

- [ ] **Step 1: Add failing canvas tests for dismissal and shared menu rendering**

```tsx
test("closes the canvas logo menu when another canvas menu opens", async () => {
  render(<FlowTopToolbar cullingEnabled onToggleCulling={vi.fn()} saveStatus={{ label: "已保存到云端", status: "saved" }} />);
  fireEvent.click(screen.getByRole("button", { name: "打开项目菜单" }));
  fireEvent.pointerDown(document.body);
  await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
});
```

- [ ] **Step 2: Run the canvas toolbar tests and verify they fail**

Run: `npm test -- src/flowCanvas/canvas/FlowTopToolbar.test.tsx`

Expected: FAIL if the menu still uses isolated positioning or misses shared dismissal coordination.

- [ ] **Step 3: Move canvas logo menu onto portal-safe shared menu primitives**

```tsx
const logoMenuLayer = useDismissibleLayer("canvas-logo-menu");

{logoMenuLayer.open ? (
  <MenuSurface
    ref={logoMenuLayer.ref as React.RefObject<HTMLDivElement>}
    className="absolute left-0 top-[calc(100%+14px)] w-[296px] p-3"
    role="menu"
    style={{ zIndex: 1800 }}
  >
    ...
  </MenuSurface>
) : null}
```

- [ ] **Step 4: Align add-node flyout and user flyout spacing to the shared menu tokens**

```tsx
const flyoutStyle = (position: FlyoutPosition): React.CSSProperties => ({
  ...buildMenuPanelStyle({
    left: position.left,
    top: position.top,
    maxHeight: position.maxHeight,
    zIndex: 1200,
  }),
  padding: "14px 12px 12px",
});
```

- [ ] **Step 5: Restyle `ImageMoreMenu` to shared item height and typography**

```tsx
<MenuSurface
  className="absolute left-1/2 top-[calc(100%+14px)] w-[338px] -translate-x-1/2 p-4"
  role="menu"
>
  {menuRows.map((row) => (
    <button className="flex h-14 w-full items-center gap-4 rounded-[18px] px-3 text-left text-[15px] font-semibold text-white hover:bg-white/[0.07]" ...>
      ...
    </button>
  ))}
</MenuSurface>
```

- [ ] **Step 6: Close node-level more menus when peer menus open**

```tsx
useEffect(() => {
  if (!moreMenuOpen) return;
  const handlePointerDown = (event: PointerEvent) => {
    if (moreMenuRef.current?.contains(event.target as Node)) return;
    setMoreMenuOpen(false);
  };
  window.addEventListener("pointerdown", handlePointerDown);
  return () => window.removeEventListener("pointerdown", handlePointerDown);
}, [moreMenuOpen]);
```

- [ ] **Step 7: Run the canvas menu tests and verify they pass**

Run: `npm test -- src/flowCanvas/canvas/FlowTopToolbar.test.tsx`

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/flowCanvas/canvas/FlowTopToolbar.tsx src/flowCanvas/canvas/FlowLeftAddPanel.tsx src/flowCanvas/nodes/ImageMoreMenu.tsx src/flowCanvas/nodes/FlowNodes.tsx src/flowCanvas/canvas/FlowTopToolbar.test.tsx
git commit -m "feat: unify canvas menus"
```

### Task 5: Replace Workspace and Creator Dropdowns with Shared Custom Select

**Files:**
- Modify: `src/workspace/ProjectToolbar.tsx`
- Modify: `src/workspace/WorkspacePage.test.tsx`
- Modify: `src/assets/AssetLibraryPage.tsx` (if visible filter/sort dropdowns remain native)
- Modify: `src/account/AccountPage.tsx` (if visible dropdown-like controls remain mismatched)

- [ ] **Step 1: Add a failing workspace toolbar test for custom select usage**

```tsx
test("renders the sort control as a custom menu trigger", () => {
  render(<ProjectToolbar ... />);
  expect(screen.getByRole("button", { name: /最近更新/ })).toBeTruthy();
  expect(screen.queryByRole("combobox")).toBeNull();
});
```

- [ ] **Step 2: Run the workspace test and verify it fails**

Run: `npm test -- src/workspace/WorkspacePage.test.tsx`

Expected: FAIL because the workspace still uses the old dropdown UI.

- [ ] **Step 3: Replace sort/filter/view triggers with `MenuSelect`**

```tsx
<MenuSelect
  label="排序"
  onChange={(nextValue) => onSortChange(nextValue as "updated" | "created" | "name")}
  options={[
    { label: "最近更新", value: "updated" },
    { label: "最近创建", value: "created" },
    { label: "按名称", value: "name" },
  ]}
  value={sortMode}
/>
```

- [ ] **Step 4: Migrate any remaining creator-path visible native dropdowns**

```tsx
// replace visible select trigger on the touched page
<MenuSelect
  label="显示范围"
  onChange={(value) => setScope(value as Scope)}
  options={[
    { label: "显示全部", value: "all" },
    { label: "仅个人", value: "mine" },
  ]}
  value={scope}
/>
```

- [ ] **Step 5: Run the workspace/creator tests and verify they pass**

Run: `npm test -- src/workspace/WorkspacePage.test.tsx`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/workspace/ProjectToolbar.tsx src/workspace/WorkspacePage.test.tsx src/assets/AssetLibraryPage.tsx src/account/AccountPage.tsx
git commit -m "feat: replace creator dropdowns with custom menus"
```

### Task 6: Replace Admin and Model-Management Visible Selects

**Files:**
- Modify: `src/account/ProviderSettingsPage.tsx`
- Modify: `src/account/ai-settings/AiSettingsPage.tsx`
- Modify: `src/account/ProviderSettingsPage.test.tsx` or add new coverage if present

- [ ] **Step 1: Add a failing provider-settings test for custom select rendering**

```tsx
test("renders provider filters with custom menu triggers instead of native selects", () => {
  render(<ProviderSettingsPage />);
  expect(screen.queryByRole("combobox")).toBeNull();
});
```

- [ ] **Step 2: Run the admin/settings test and verify it fails**

Run: `npm test -- src/account/ProviderSettingsPage.test.tsx`

Expected: FAIL because visible provider settings still render `<select>`.

- [ ] **Step 3: Replace visible provider settings selects with `MenuSelect`**

```tsx
<MenuSelect
  label="服务商"
  onChange={(value) => setProviderFilterId(value)}
  options={[
    { label: "全部服务商", value: "" },
    ...providers.map((provider) => ({ label: `${provider.name} (${provider.key})`, value: provider.id })),
  ]}
  value={providerFilterId}
/>
```

- [ ] **Step 4: Replace visible AI settings/model-management selectors**

```tsx
<MenuSelect
  label="默认线路"
  onChange={(value) => setSelectedRouteId(value)}
  options={routeRows.map((row) => ({
    label: row.route.routeLabel || row.route.routeKey,
    value: row.route.routeId,
  }))}
  value={selectedRouteId}
/>
```

- [ ] **Step 5: Run the touched admin/settings tests and verify they pass**

Run: `npm test -- src/account/ProviderSettingsPage.test.tsx src/account/ai-settings/AiSettingsPage.test.tsx`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/account/ProviderSettingsPage.tsx src/account/ai-settings/AiSettingsPage.tsx src/account/ProviderSettingsPage.test.tsx src/account/ai-settings/AiSettingsPage.test.tsx
git commit -m "feat: unify admin dropdown styling"
```

### Task 7: Reduce Login Page First-Screen Scale and Final Validation

**Files:**
- Modify: `src/auth/LoginPage.tsx`
- Modify: `src/auth/AuthPages.test.tsx`
- Modify: `PROJECT_RECORD.md`

- [ ] **Step 1: Add a failing auth-page test for reduced layout scale classes**

```tsx
test("uses the reduced auth layout shell sizing", () => {
  renderWithAuth(<LoginPage />, createAuthState());
  expect(screen.getByRole("heading", { name: "登录 TapFlow" }).className).toContain("text-3xl");
});
```

- [ ] **Step 2: Run the auth-page tests and verify they fail**

Run: `npm test -- src/auth/AuthPages.test.tsx`

Expected: FAIL if the login layout still uses the oversized shell.

- [ ] **Step 3: Reduce auth shell scale and tighten spacing**

```tsx
<div className="relative mx-auto flex min-h-screen w-full max-w-[1320px] items-center px-4 py-6 sm:px-6 lg:px-8">
  <section className="grid w-full items-center gap-6 lg:grid-cols-[0.98fr_398px]">
    <div className="mb-8">
      <h2 className="max-w-2xl text-[64px] font-semibold leading-[1.02] text-white">
        ...
      </h2>
      <p className="mt-4 max-w-xl text-[15px] leading-7 text-slate-300">...</p>
    </div>
    <form className="mx-auto w-full max-w-[398px] rounded-[22px] border border-white/12 bg-white/[0.075] p-5 shadow-[0_26px_72px_rgba(0,0,0,0.42)] backdrop-blur-xl sm:p-6">
      ...
    </form>
  </section>
</div>
```

- [ ] **Step 4: Update `PROJECT_RECORD.md` with the completed unification work**

```md
## 2026-06-14 - Global Menu and Auth Layout Unification

- added shared menu tokens, dismissible-layer coordination, and custom dropdown primitives
- replaced legacy non-canvas shell branding with the shared product logo
- unified canvas/project/account/admin dropdown and menu surfaces to the dark TapNow-style reference
- fixed menu mutual-exclusion and outside-click dismissal conflicts
- reduced login page first-screen scale for common desktop viewports
- Validation:
  - `npm test -- src/components/menu/useDismissibleLayer.test.tsx src/components/menu/MenuSelect.test.tsx src/app/WorkspaceShell.test.tsx src/flowCanvas/canvas/FlowTopToolbar.test.tsx src/workspace/WorkspacePage.test.tsx src/auth/AuthPages.test.tsx`
  - `npm run build`
```

- [ ] **Step 5: Run the final targeted suite and verify it passes**

Run: `npm test -- src/components/menu/useDismissibleLayer.test.tsx src/components/menu/MenuSelect.test.tsx src/app/WorkspaceShell.test.tsx src/flowCanvas/canvas/FlowTopToolbar.test.tsx src/workspace/WorkspacePage.test.tsx src/auth/AuthPages.test.tsx`

Expected: PASS

- [ ] **Step 6: Run the production build and verify it passes**

Run: `npm run build`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/auth/LoginPage.tsx src/auth/AuthPages.test.tsx PROJECT_RECORD.md
git commit -m "feat: tighten auth layout and finalize menu unification"
```

---

## Self-Review

### Spec coverage

- Canvas logo menu obstruction: covered in Task 4.
- Non-canvas logo replacement: covered in Task 3.
- Menu visual unification across canvas and shared shell: covered in Tasks 3-6.
- Login page scale correction: covered in Task 7.
- Global dismissal behavior: covered in Tasks 1-4.
- Elimination of mismatched native dropdown UI: covered in Tasks 2, 5, and 6.

No spec gaps remain.

### Placeholder scan

- No `TBD`, `TODO`, or deferred implementation wording remains.
- Every task includes concrete files, commands, and code examples.

### Type consistency

- Shared naming is consistent across tasks:
  - `useDismissibleLayer`
  - `MenuSurface`
  - `MenuSelect`
- Route and page names align with the approved spec and current codebase.

