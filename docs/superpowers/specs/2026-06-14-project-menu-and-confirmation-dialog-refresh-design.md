# 2026-06-14 Project Menu and Confirmation Dialog Refresh Design

## Status

- Drafted and approved in conversation on 2026-06-14
- Scope: canvas project menu and project-destructive confirmation dialog only

## Background

The current canvas project menu and delete confirmation UI still feel visually inconsistent with the stronger dark premium language already established elsewhere in the product.

Two specific issues are now the focus:

1. The project delete confirmation currently appears as a browser-style white dialog that breaks the canvas visual system.
2. The top-left canvas project menu still feels visually uneven, with row balance, width, and icon treatment not matching the cleaner TapNow-style menu rhythm the user wants.

The user reviewed option boards and selected the following target directions:

- Confirmation dialog: Option C, `Canvas Action Sheet`
- Project menu: Option B, `Minimal TapNow-style Menu`

This document defines the exact visual and interaction behavior for that combination before implementation begins.

## Goals

1. Replace the browser-like delete confirmation with a dark canvas-native confirmation sheet.
2. Refine the top-left canvas project menu into a cleaner, narrower, more coordinated TapNow-style menu.
3. Keep both surfaces aligned with the existing shared dark menu language already used in the app.
4. Preserve current project actions and behavior without changing underlying workflow semantics.

## Non-Goals

- No change to project action semantics:
  - return to workspace
  - rename project
  - create project
  - delete project
- No backend API or data model changes.
- No redesign of other menus in this task.
- No full canvas top bar redesign beyond the touched menu and confirmation surface.

## Final Chosen Direction

## A. Confirmation Dialog: Canvas Action Sheet

Selected option: `Option C`

Intent:

- The delete confirmation should feel like an extension of the canvas menu flow rather than a separate browser/system dialog.
- It should remain lightweight, dark, and calm, while still clearly communicating destructive consequence.

Core visual character:

- dark translucent panel
- soft shadow
- rounded corners consistent with the current menu system
- compact copy block
- two horizontal pill actions
- no white browser-dialog body
- no oversized alert treatment

Placement model:

- rendered as an app-level portal surface
- visually centered in the viewport for reliability
- styled like a lightweight sheet rather than a browser alert

This keeps the interaction dependable while preserving the chosen visual language.

## B. Project Menu: Minimal TapNow-style Menu

Selected option: `Option B`

Intent:

- Remove visual clutter from the current project menu.
- Use the same restrained density and width logic the user prefers from TapNow.
- Keep emphasis on typography, spacing, and row rhythm instead of icon-heavy rows.

Core visual character:

- one highlighted top row for `返回工作空间`
- plain text rows for `重命名项目` and `新建项目`
- one restrained destructive row for `删除项目`
- only the back row keeps the trailing chevron
- remove unnecessary leading icons from regular rows
- keep destructive emphasis through color and hover state, not through heavy decoration

## User-Facing Requirements

### 1. Delete confirmation sheet

When the user chooses `删除项目` from the canvas project menu:

- a custom dark confirmation sheet opens instead of a browser-style white dialog
- the sheet clearly states the action is deleting the current project
- the sheet includes concise consequence copy
- the sheet offers:
  - primary destructive action: `删除`
  - secondary action: `取消`
- the sheet closes when:
  - `取消` is clicked
  - the backdrop is clicked
  - `Escape` is pressed
  - the delete action succeeds

### 2. Project menu simplification

The canvas top-left project menu must:

- keep its current anchored body-level positioning behavior
- preserve non-obstructed placement relative to the left dock and top chrome
- become visually narrower and cleaner
- use a consistent row rhythm
- avoid mixed icon treatment where some rows feel heavy and others empty

### 3. Interaction continuity

The new confirmation sheet must integrate with the existing dismissible-layer behavior:

- opening the confirmation closes no unrelated persistent app state
- the originating menu should close before the confirmation sheet opens
- confirmation and menu should never overlap visually at the same time

## Visual Spec

## A. Project Menu

### Width

- target width: narrower than the earlier wide canvas menu
- should feel close to the compact TapNow reference rather than a large flyout
- implementation target should land around the current narrow visual band used in the approved mockup, with final pixel value tuned against actual canvas chrome

### Surface

- dark translucent charcoal surface
- subtle 1px outline
- soft depth shadow
- rounded outer corners
- no excessive glow

### Row structure

- top row:
  - highlighted surface block
  - slightly larger visual presence than the rows below
  - trailing chevron on the far right
- middle rows:
  - text-led rows
  - no leading icons
  - equal height and padding
- bottom destructive row:
  - same structure as middle rows
  - red-tinted text and hover state

### Typography

- use the existing shared menu baseline already recorded in project rules:
  - primary label size: 12px
  - bold weight
  - compact line-height
- no oversized labels
- all rows must use the same label scale

### Dividers

- thin low-contrast dividers between grouped areas
- no thick boxed separators

## B. Confirmation Sheet

### Surface

- dark floating sheet
- rounded corners in the same family as menu surfaces
- shadow depth strong enough to separate from canvas
- subtle border
- no browser-default framing

### Content hierarchy

- title: short, direct, high-contrast
- body copy: one concise consequence statement
- buttons aligned in one row

Recommended copy direction:

- title: `删除当前项目`
- body: `删除后项目、画布和相关结果将无法恢复。`

Final Chinese copy can be tuned during implementation, but it must stay concise and product-native.

### Buttons

- destructive button first in visual emphasis
- cancel button secondary, still clearly visible
- both buttons pill-shaped and aligned to the shared dark UI language
- avoid browser-blue default buttons

### Motion

- quick fade and slight upward settle
- no large spring or theatrical motion
- reduced-motion-safe behavior should remain supported

## Interaction Spec

## A. Menu behavior

- clicking the logo toggles the project menu
- clicking outside closes the menu
- pressing `Escape` closes the menu
- opening other toolbar menus closes the project menu
- menu remains body-portal based to avoid clipping and dock overlap

## B. Confirmation behavior

- selecting `删除项目` closes the project menu and opens the confirmation sheet
- focus should land inside the confirmation surface
- pressing `Escape` closes the confirmation sheet
- clicking outside the sheet closes it
- clicking `删除` runs the existing delete flow
- while deleting:
  - destructive button shows loading copy/state
  - duplicate submissions are blocked
- on success:
  - sheet closes
  - existing navigation behavior after deletion remains unchanged
- on failure:
  - inline error feedback appears inside the sheet
  - sheet remains open

## Likely Implementation Areas

Primary files expected to change:

- `src/flowCanvas/canvas/FlowTopToolbar.tsx`
- `src/components/EntityActionMenu.tsx`
- possibly shared menu token/style files if a small reusable confirmation-sheet token layer is extracted

Supporting tests likely to change:

- `src/flowCanvas/canvas/FlowTopToolbar.test.tsx`
- any dialog/menu test covering project delete flow or dismiss behavior

## Design Constraints

- Preserve current portal and z-index safety for the canvas menu.
- Do not reintroduce clipping under the left floating rail.
- Do not widen the menu back toward the older oversized look.
- Do not use mixed icon density in the minimal project menu.
- Do not use browser-native `confirm()` or white modal styling.

## Acceptance Criteria

The work is complete when all of the following are true:

1. Clicking `删除项目` opens a custom dark confirmation sheet instead of a white browser-style dialog.
2. The confirmation surface visually matches the product's dark canvas language.
3. The project menu appears narrower, cleaner, and closer to the approved minimal TapNow-style direction.
4. The project menu rows use one consistent typography and spacing system.
5. The project menu and confirmation sheet do not overlap at the same time.
6. Outside click and `Escape` dismissal work for both surfaces.
7. Existing delete-project success and failure behavior still works.

## Validation Plan

Implementation validation must include:

- targeted menu open/close regression coverage
- targeted delete confirmation interaction coverage
- targeted outside-click and `Escape` dismissal coverage
- `npm run build`

Manual QA must cover:

- open project menu from the canvas logo
- close project menu by blank-space click
- open delete confirmation
- cancel delete confirmation
- close delete confirmation with `Escape`
- verify failure state remains readable if deletion fails
- verify success path still returns to workspace as before

## Recommendation to Implementation Phase

Implementation should proceed in this order:

1. restyle and tighten the project menu to the chosen minimal direction
2. replace the delete confirmation with the dark canvas action sheet
3. update tests for overlap, dismissal, and loading/error states
4. run focused tests and build verification
