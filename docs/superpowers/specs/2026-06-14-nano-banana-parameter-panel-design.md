# Nano Banana Parameter Panel Design

## Goal

Rebuild the popup parameter panel for `Nano Banana Pro` and `Nano Banana 2` so it visually matches the TapNow reference as closely as possible while keeping the existing generation runtime unchanged.

This iteration is limited to the popup parameter panel only.

## In Scope

- `Nano Banana Pro` popup parameter panel
- `Nano Banana 2` popup parameter panel
- quality selector visual redesign
- aspect ratio selector visual redesign
- fixed supported quality and ratio options for these two models
- Nano Banana specific fallback behavior when catalog metadata is incomplete

## Out of Scope

- `GPT-Image-2`
- bottom summary chip
- open/close animation polish
- API payload contract changes
- worker changes
- billing changes
- route/model backend changes
- other image-edit dialogs or menus

## Product Requirements

The panel must follow the TapNow reference structure:

1. A top `画质` section with a segmented control.
2. A lower `比例` section inside its own darker rounded container.
3. All ratio options visible on first open.
4. No scrolling inside the ratio area.
5. Two-row ratio layout.
6. Premium dark UI with clear selected state and restrained contrast.

## Supported Options

For both `Nano Banana Pro` and `Nano Banana 2`, the panel must expose:

### Quality

- `1K`
- `2K`
- `4K`

### Aspect Ratios

- `1:1`
- `2:3`
- `3:2`
- `3:4`
- `4:3`
- `4:5`
- `5:4`
- `9:16`
- `16:9`
- `21:9`

## Layout Design

The panel is split into two stacked blocks.

### Quality Block

- Section title: `画质`
- One rounded segmented background rail
- Three equal-width segmented buttons
- Selected item appears as a raised inner pill
- Text is centered
- No icons
- No helper text

### Ratio Block

- Section title: `比例`
- Ratios live inside a separate inner rounded dark container
- Two fixed rows
- Five items per row
- Each item consists of:
  - a small proportion icon
  - the ratio label
- The selected item uses a brighter elevated background and clearer border

## Ratio Grid Order

To keep the layout visually balanced, the ratio items should be shown in this order:

### First row

- `1:1`
- `4:3`
- `3:4`
- `16:9`
- `9:16`

### Second row

- `3:2`
- `2:3`
- `4:5`
- `5:4`
- `21:9`

This order preserves a stable visual rhythm and keeps landscape/portrait options balanced across rows.

## Interaction Rules

- Clicking a quality option updates the current Nano Banana size immediately.
- Clicking a ratio option updates the current Nano Banana ratio immediately.
- No extra confirmation action is added.
- The panel remains popup-based and reuses the current opening behavior.
- No scrollbars should appear inside the ratio block.

## Visual Rules

The target look should align closely with the TapNow panel:

- dark charcoal shell
- soft inner contrast
- large rounded corners
- low-noise borders
- clearly raised selected state
- muted unselected labels
- brighter selected labels

The visual hierarchy should feel:

- top section lighter and simpler
- bottom ratio block more framed and more tactile

## Technical Design

### Component Boundary

Keep current popup/menu state logic in place, but extract the Nano Banana parameter body into a dedicated focused component.

Recommended component:

- `src/flowCanvas/nodes/NanoBananaParamPanel.tsx`

This component should receive:

- current size
- current ratio
- available sizes
- available ratios
- callbacks for updating each value

### Integration Strategy

The current image node settings flow in `src/flowCanvas/nodes/FlowNodes.tsx` remains the entry point.

The new Nano Banana panel should be rendered only when the active model is:

- `pixellelabs.nano-banana-pro`
- `pixellelabs.nano-banana-2`

`GPT-Image-2` must continue using the existing path without visual or behavioral changes in this task.

### Data Contract

Do not invent new storage fields.

Continue writing:

- ratio to:
  - `params.aspectRatio`
  - `params.aspect_ratio`
- size to:
  - `params.size`
  - `params.imageSize`

This keeps the current save and execution path compatible.

## Option Source Rules

Nano Banana Pro and Nano Banana 2 should no longer depend purely on partial catalog options for this panel.

Instead, the frontend should enforce a strong local fallback:

- sizes: `1k`, `2k`, `4k`
- ratios:
  - `1:1`
  - `2:3`
  - `3:2`
  - `3:4`
  - `4:3`
  - `4:5`
  - `5:4`
  - `9:16`
  - `16:9`
  - `21:9`

If catalog metadata exists, it may still be read, but the Nano Banana panel must not regress to incomplete option sets.

## Testing Requirements

Implementation must add or update tests that verify:

1. Nano Banana Pro shows the dedicated TapNow-style parameter panel.
2. Nano Banana 2 shows the same dedicated panel.
3. The quality options are exactly `1K`, `2K`, `4K`.
4. The ratio options are all visible without scrolling.
5. The ratio order matches the approved two-row layout.
6. Clicking options updates the existing parameter fields.
7. `GPT-Image-2` does not switch to the Nano Banana-specific panel.

## Acceptance Criteria

This task is complete when:

- Nano Banana Pro and Nano Banana 2 use the new dedicated popup parameter panel
- the panel visually aligns with the TapNow reference structure
- all 10 ratios are visible in a two-row non-scrolling layout
- all 3 quality options are present
- selected states are visually clear and premium
- GPT-Image-2 remains unchanged
- existing generation parameter persistence continues to work through current fields
