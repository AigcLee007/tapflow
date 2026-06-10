# TapNow Canvas 100% Viewport Alignment Design

## Goal

Align the authenticated flow canvas with `app.tapnow.ai` so that at browser zoom `100%`:

- The visible canvas area feels comparably spacious.
- The left add-node menu opens fully without bottom clipping.
- The top toolbar, left dock, and bottom viewport controls consume a similar amount of screen space.
- The result is achieved through real viewport and layout changes, not page-level CSS scaling hacks.

## Current Problem

From the supplied screenshots, the local project diverges from TapNow in three compounding ways:

1. The initial canvas viewport is too close, so the same browser window shows fewer nodes.
2. The chrome around the canvas is oversized, especially the left dock, add-node flyout, and top-right pill buttons.
3. The add-node flyout is both too large and too aggressively positioned, so it requires browser zoom reduction to display fully.

The current `67%` browser zoom workaround demonstrates that the layout can fit within the screen, but only by shrinking the entire page. That is not acceptable as the product behavior.

## Source Areas

- [AiFlowCanvas.tsx](D:/tapnow-flow/src/flowCanvas/canvas/AiFlowCanvas.tsx)
- [FlowLeftAddPanel.tsx](D:/tapnow-flow/src/flowCanvas/canvas/FlowLeftAddPanel.tsx)
- [FlowTopToolbar.tsx](D:/tapnow-flow/src/flowCanvas/canvas/FlowTopToolbar.tsx)
- [flowCanvas.css](D:/tapnow-flow/src/flowCanvas/flowCanvas.css)

## Recommended Approach

Use a combined viewport-and-chrome alignment pass:

1. Reduce the initial visual density of the canvas by tuning the React Flow `fitView` and default viewport behavior.
2. Compress the canvas chrome to the same visual tier as TapNow instead of preserving the current larger dimensions.
3. Rebuild the add-node flyout dimensions and positioning constraints so it fits fully within a `100%` viewport.

This approach is preferred because either half on its own would still leave a visible mismatch. Viewport-only tuning would keep the menu oversized, while chrome-only tuning would still leave the graph too zoomed in.

## Design

### 1. Viewport alignment

The initial canvas should render with a slightly more distant framing than today.

Implementation direction:

- Lower the effective initial zoom pressure by adjusting `fitViewOptions`.
- Review any viewport restoration logic so fresh or sparse canvases do not reopen too close.
- Keep manual zoom behavior intact after the initial framing.

Expected outcome:

- At `100%` browser zoom, the same viewport shows meaningfully more graph area.
- The user no longer needs browser zoom reduction to approximate TapNow density.

### 2. Left dock alignment

The left rail should match TapNow's smaller footprint.

Implementation direction:

- Reduce dock width, vertical padding, large add-button size, and icon sizes.
- Reduce gaps between rail controls.
- Keep the same actions and interaction model.

Expected outcome:

- The dock occupies less horizontal space.
- The dock reads visually closer to TapNow without changing product behavior.

### 3. Add-node flyout alignment

The add-node flyout should be resized and re-positioned for `100%` browser zoom.

Implementation direction:

- Reduce flyout width, row height, icon block size, section spacing, and title spacing.
- Keep descriptive subtext only where it fits naturally; it should not force the panel taller than necessary.
- Bound the flyout height to the viewport and use internal scrolling when required.
- Adjust left/top offsets so the flyout anchors like TapNow and stays fully visible.

Expected outcome:

- Opening the add menu at `100%` shows the full menu body.
- The panel can still reveal all items without the browser being zoomed out.

### 4. Top and bottom chrome alignment

The title cluster, points pill, notification pill, share button, and bottom viewport controls should all be reduced to TapNow-like density.

Implementation direction:

- Tighten top-left title block spacing and font sizes.
- Reduce top-right pill height, horizontal padding, icon size, and inter-pill gaps.
- Reduce bottom control shell width, padding, and slider footprint.

Expected outcome:

- More of the browser viewport belongs to the actual canvas.
- Chrome balance matches TapNow more closely.

## Non-Goals

- No redesign of node card visuals in this pass.
- No change to canvas feature set, routes, auth, or persistence.
- No global browser zoom manipulation.
- No CSS `transform: scale(...)` workaround applied to the entire page or major canvas regions.

## Validation

The pass is complete when the following are true on the same machine and browser at zoom `100%`:

1. The main canvas shows a comparable amount of graph content to TapNow.
2. The add-node flyout opens fully without being cut off at the bottom.
3. The left dock and top-right controls are visibly smaller and closer to TapNow's proportions.
4. The page remains usable at standard desktop sizes without introducing overlap or clipped controls.

## Risks and Guardrails

- Over-correcting the viewport could make the graph feel too distant. Clamp changes to the initial framing only.
- Over-shrinking chrome could reduce tap targets. Preserve comfortable desktop hit areas even while tightening proportions.
- Internal menu scrolling must feel deliberate, not accidental. Scroll should appear only when the viewport truly cannot fit the full menu.
