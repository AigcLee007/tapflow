# TapNow Canvas Viewport Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the authenticated flow canvas match TapNow's `100%` browser-zoom density by tightening viewport framing and resizing canvas chrome so the add-node menu and primary canvas both display fully.

**Architecture:** Keep the current React Flow canvas architecture and adjust only the viewport framing and chrome constants that define the visible layout. Implement the pass in the existing canvas chrome files so the behavior change stays local to the authenticated flow canvas route.

**Tech Stack:** React, TypeScript, `@xyflow/react`, inline React `CSSProperties`, local Codex browser verification

---

## File Map

- Modify: `src/flowCanvas/canvas/AiFlowCanvas.tsx`
  - Owns React Flow framing, connection-menu viewport clamping, minimap offset, and bottom viewport controls.
- Modify: `src/flowCanvas/canvas/FlowLeftAddPanel.tsx`
  - Owns left dock footprint and add-node flyout dimensions.
- Modify: `src/flowCanvas/canvas/FlowTopToolbar.tsx`
  - Owns top-left title block and top-right pill controls.
- Verify against: `docs/superpowers/specs/2026-06-10-tapnow-canvas-viewport-alignment-design.md`

### Task 1: Tighten the canvas viewport framing

**Files:**
- Modify: `src/flowCanvas/canvas/AiFlowCanvas.tsx`

- [ ] **Step 1: Record the current framing constants before changing them**

Inspect these existing lines and note them in the working diff:

```tsx
const CANVAS_MIN_ZOOM = 0.3;
const CANVAS_MAX_ZOOM = 2.35;
const CONNECTION_MENU_WIDTH = 432;
const CONNECTION_MENU_HEIGHT = 488;
const CONNECTION_MENU_MARGIN = 28;
```

And:

```tsx
fitViewOptions={{ padding: 0.3, maxZoom: 1.5 }}
```

And:

```tsx
onFitView={() => reactFlow.fitView({ padding: 0.28, duration: 220 })}
```

- [ ] **Step 2: Shrink the effective initial zoom pressure**

Update the framing constants to create a slightly more distant initial fit:

```tsx
const CANVAS_MIN_ZOOM = 0.24;
const CANVAS_MAX_ZOOM = 2.2;
const CONNECTION_MENU_WIDTH = 368;
const CONNECTION_MENU_HEIGHT = 452;
const CONNECTION_MENU_MARGIN = 24;
```

Update the React Flow fit options:

```tsx
fitViewOptions={{ padding: 0.38, maxZoom: 1.12 }}
```

Update the reset action:

```tsx
onFitView={() => reactFlow.fitView({ padding: 0.36, maxZoom: 1.12, duration: 220 })}
```

- [ ] **Step 3: Compress the bottom viewport controls to match the new density**

Update these style blocks in `AiFlowCanvas.tsx`:

```tsx
const viewportControlsShellStyle: React.CSSProperties = {
  position: 'absolute',
  left: 20,
  bottom: 16,
  zIndex: 45,
  display: 'flex',
  alignItems: 'center',
  gap: 10,
};

const viewportControlsStyle: React.CSSProperties = {
  height: 44,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '0 12px',
  borderRadius: 22,
  background: 'rgba(34,34,39,0.96)',
  border: '1px solid rgba(255,255,255,0.09)',
  boxShadow: '0 18px 48px rgba(0,0,0,0.46)',
  backdropFilter: 'blur(18px)',
};

const helpButtonStyle: React.CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: '50%',
  border: '1px solid rgba(255,255,255,0.09)',
  background: 'rgba(34,34,39,0.96)',
  color: '#e5e7eb',
  display: 'grid',
  placeItems: 'center',
  cursor: 'help',
  padding: 0,
  boxShadow: '0 18px 48px rgba(0,0,0,0.46)',
  backdropFilter: 'blur(18px)',
};

const zoomSliderWrapStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  width: 84,
  height: 30,
  padding: '0 1px',
};
```

Also reduce control icon sizes in `CanvasViewportControls`:

```tsx
<MapPinned size={18} />
<Grip size={18} />
<Crosshair size={18} />
<CircleHelp size={21} />
```

- [ ] **Step 4: Keep the minimap aligned with the narrower left chrome**

Update the minimap left offset:

```tsx
style={{ ...miniMapStyle, left: leftPanelOpen ? 248 : 20 }}
```

And reduce the minimap base placement:

```tsx
const miniMapStyle: React.CSSProperties = {
  background: 'rgba(20,20,28,0.92)',
  borderRadius: 18,
  border: '1px solid rgba(255,255,255,0.09)',
  boxShadow: '0 18px 50px rgba(0,0,0,0.45)',
  left: 20,
  bottom: 68,
  width: 280,
```

- [ ] **Step 5: Run the build after viewport changes**

Run:

```bash
npm run build
```

Expected:

```text
Build completes successfully.
```

### Task 2: Resize the left dock and add-node flyout

**Files:**
- Modify: `src/flowCanvas/canvas/FlowLeftAddPanel.tsx`

- [ ] **Step 1: Reduce the left dock footprint**

Update the dock host and shell:

```tsx
const dockHostStyle: React.CSSProperties = {
  position: 'absolute',
  left: 20,
  top: 198,
  zIndex: 1000,
};

const dockStyle: React.CSSProperties = {
  width: 72,
  minHeight: 404,
  padding: '8px 8px 10px',
  boxSizing: 'border-box',
  borderRadius: 36,
  background: 'rgba(31,31,31,0.96)',
  border: '1px solid rgba(255,255,255,0.12)',
  boxShadow: '0 22px 56px rgba(0,0,0,0.48), inset 0 1px 0 rgba(255,255,255,0.05)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 12,
  backdropFilter: 'blur(18px)',
};
```

- [ ] **Step 2: Reduce button sizes in the dock**

Update the dock button styles:

```tsx
const addButtonStyle = (active?: boolean): React.CSSProperties => ({
  width: 54,
  height: 54,
  borderRadius: '50%',
  border: active ? '1px solid rgba(255,255,255,0.1)' : 'none',
  background: active ? 'rgba(255,255,255,0.095)' : '#f7f7f7',
  color: active ? 'rgba(255,255,255,0.52)' : '#0b0b0d',
  display: 'grid',
  placeItems: 'center',
  cursor: 'pointer',
  padding: 0,
  transition: 'background 140ms ease, color 140ms ease',
});

const dockButtonStyle = (active?: boolean): React.CSSProperties => ({
  position: 'relative',
  width: 48,
  height: 48,
  borderRadius: 14,
  border: 'none',
  background: active ? 'rgba(255,255,255,0.085)' : 'transparent',
  color: '#f4f4f5',
  display: 'grid',
  placeItems: 'center',
  cursor: 'pointer',
  padding: 0,
  transition: 'background 140ms ease',
});
```

Update icon sizes in the JSX:

```tsx
icon={addOpen ? <X size={24} strokeWidth={1.7} /> : <Plus size={30} strokeWidth={1.75} />}
<Folder size={21} strokeWidth={1.8} />
<LayoutList size={21} strokeWidth={1.85} />
<MessageCircle size={22} strokeWidth={1.85} />
<Clock3 size={22} strokeWidth={1.85} />
```

- [ ] **Step 3: Resize and clamp the add-node flyout**

Update the flyout styles:

```tsx
const flyoutStyle: React.CSSProperties = {
  position: 'absolute',
  left: 82,
  top: -12,
  width: 274,
  maxHeight: 'calc(100vh - 40px)',
  overflow: 'auto',
  padding: '12px 14px 14px',
  boxSizing: 'border-box',
  borderRadius: 20,
  background: 'linear-gradient(150deg, rgba(31,31,31,0.98), rgba(25,28,32,0.98))',
  border: '1px solid rgba(255,255,255,0.14)',
  boxShadow: '0 24px 70px rgba(0,0,0,0.58)',
  backdropFilter: 'blur(22px)',
};

const flyoutSectionTitleStyle: React.CSSProperties = {
  color: 'rgba(255,255,255,0.42)',
  fontSize: 12,
  fontWeight: 760,
  margin: '8px 0 6px',
};

const flyoutItemStyle = (active: boolean, disabled: boolean): React.CSSProperties => ({
  width: '100%',
  minHeight: 50,
  border: 'none',
  borderRadius: 14,
  background: active ? 'rgba(255,255,255,0.105)' : 'transparent',
  color: disabled ? 'rgba(255,255,255,0.56)' : '#f8fafc',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '7px 9px',
  cursor: disabled ? 'default' : 'pointer',
  textAlign: 'left',
});

const flyoutIconStyle = (active: boolean): React.CSSProperties => ({
  width: 40,
  height: 40,
  borderRadius: 12,
  display: 'grid',
  placeItems: 'center',
  background: active ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.065)',
  color: '#f4f4f5',
  flexShrink: 0,
});

const flyoutLabelStyle: React.CSSProperties = {
  display: 'block',
  color: '#fff',
  fontSize: 14,
  fontWeight: 800,
  lineHeight: 1.15,
};

const flyoutDescStyle: React.CSSProperties = {
  display: 'block',
  color: 'rgba(255,255,255,0.44)',
  fontSize: 11,
  fontWeight: 600,
  marginTop: 4,
};
```

- [ ] **Step 4: Reduce add-menu entry icon sizes so rows do not expand**

Update `PRIMARY_ITEMS`, `TOOL_ITEMS`, and `RESOURCE_ITEMS` icon sizes from `24` to `21` or `22`, for example:

```tsx
icon: <List size={21} strokeWidth={1.75} />
icon: <ImageIcon size={21} strokeWidth={1.75} />
icon: <PlaySquare size={21} strokeWidth={1.8} />
icon: <Music size={21} strokeWidth={1.8} />
icon: <Box size={21} strokeWidth={1.75} />
icon: <LayoutList size={21} strokeWidth={1.75} />
icon: <Wand2 size={21} strokeWidth={1.8} />
icon: <Upload size={21} strokeWidth={1.85} />
```

- [ ] **Step 5: Run the build after left-panel changes**

Run:

```bash
npm run build
```

Expected:

```text
Build completes successfully.
```

### Task 3: Compress the top toolbar to TapNow density

**Files:**
- Modify: `src/flowCanvas/canvas/FlowTopToolbar.tsx`

- [ ] **Step 1: Reduce the top bar frame and spacing**

Update the main frame styles:

```tsx
const topChromeStyle: React.CSSProperties = {
  position: 'fixed',
  left: 28,
  right: 28,
  top: 24,
  zIndex: 900,
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  pointerEvents: 'none',
};

const titleClusterStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  pointerEvents: 'auto',
  minWidth: 0,
};
```

- [ ] **Step 2: Reduce the title block footprint**

Update the title-related styles:

```tsx
const logoImageStyle: React.CSSProperties = {
  width: 44,
  height: 44,
  objectFit: 'contain',
  display: 'block',
  filter: 'drop-shadow(0 8px 14px rgba(0,0,0,0.34))',
};

const titleTextWrapStyle: React.CSSProperties = {
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

const titleInputStyle: React.CSSProperties = {
  width: 'min(280px, calc(100vw - 520px))',
  minWidth: 136,
  border: 'none',
  outline: 'none',
  background: 'transparent',
  color: '#fff',
  fontSize: 22,
  fontWeight: 760,
  lineHeight: 1,
  padding: 0,
  textShadow: '0 2px 12px rgba(0,0,0,0.35)',
};

const saveStatusStyle = (status?: string): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  color:
    status === 'failed'
      ? 'rgba(251,191,36,0.86)'
      : status === 'saved'
        ? 'rgba(156,163,175,0.78)'
        : 'rgba(125,211,252,0.86)',
  fontSize: 14,
  fontWeight: 520,
  lineHeight: 1,
});
```

- [ ] **Step 3: Reduce top-right pills and share button**

Update the right-cluster spacing and control sizes:

```tsx
const rightClusterStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  pointerEvents: 'auto',
};

const topPillStyle: React.CSSProperties = {
  height: 52,
  border: 'none',
  borderRadius: 18,
  padding: '0 18px',
  display: 'flex',
  alignItems: 'center',
  gap: 9,
  background: 'rgba(43,43,49,0.96)',
  color: '#fff',
  fontSize: 16,
  fontWeight: 820,
  cursor: 'pointer',
  boxShadow: '0 12px 34px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.06)',
};

const shareButtonStyle: React.CSSProperties = {
  width: 52,
  height: 52,
  border: 'none',
  borderRadius: '50%',
  display: 'grid',
  placeItems: 'center',
  background: 'rgba(43,43,49,0.96)',
  color: '#fff',
  cursor: 'pointer',
  boxShadow: '0 12px 34px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.06)',
};
```

Update the top-right icon sizes in JSX:

```tsx
<Sparkles size={20} />
<Bell size={20} />
<Share2 size={20} />
```

- [ ] **Step 4: Run the build after top-toolbar changes**

Run:

```bash
npm run build
```

Expected:

```text
Build completes successfully.
```

### Task 4: Browser verification against the approved spec

**Files:**
- Verify: `src/flowCanvas/canvas/AiFlowCanvas.tsx`
- Verify: `src/flowCanvas/canvas/FlowLeftAddPanel.tsx`
- Verify: `src/flowCanvas/canvas/FlowTopToolbar.tsx`

- [ ] **Step 1: Start the local app if it is not already running**

Run the local frontend and supporting services using the repo's documented dev flow. If the full app is already available, reuse the existing local URL.

Expected:

```text
A working local canvas route is reachable in the browser.
```

- [ ] **Step 2: Open the canvas page in the in-app browser at browser zoom `100%`**

Verify these acceptance points visually:

```text
1. The visible canvas area is wider than before.
2. The left dock is visibly narrower than before.
3. The top-right pills are smaller and closer to TapNow.
4. The bottom viewport controls occupy less space.
```

- [ ] **Step 3: Open the add-node flyout and verify full visibility**

Expected:

```text
The flyout fits inside the viewport at `100%` browser zoom without bottom clipping.
```

- [ ] **Step 4: Capture before/after screenshots for review**

Store or attach screenshots from the local app after the pass so future iterations can compare deltas against TapNow.

- [ ] **Step 5: Run the final build**

Run:

```bash
npm run build
```

Expected:

```text
Build completes successfully.
```

- [ ] **Step 6: Commit**

Run:

```bash
git add src/flowCanvas/canvas/AiFlowCanvas.tsx src/flowCanvas/canvas/FlowLeftAddPanel.tsx src/flowCanvas/canvas/FlowTopToolbar.tsx docs/superpowers/specs/2026-06-10-tapnow-canvas-viewport-alignment-design.md docs/superpowers/plans/2026-06-10-tapnow-canvas-viewport-alignment.md
git commit -m "feat: align flow canvas viewport with tapnow"
```

Expected:

```text
A single commit containing the viewport-alignment pass.
```
