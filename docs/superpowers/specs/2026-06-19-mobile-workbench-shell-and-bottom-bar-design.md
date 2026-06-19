# Mobile Workbench Shell And Bottom Bar Design

Date: 2026-06-19

## Decision

Use the approved mobile workbench direction based on Scheme A, but keep the current mobile creation panel UI intact.

This task only changes the mobile outer shell and mobile bottom interaction model:

- rebuild the mobile page layout skeleton to fix scrolling and content occlusion
- remove the duplicated mobile header and replace it with a single compact top navigation bar
- replace the current bottom summary dock with a JiMeng-style bottom creation bar
- preserve the current mobile creation panel content and field layout

Desktop workbench behavior remains unchanged.

## Goals

- Make mobile `/workbench` scroll correctly and expose all content without bottom-bar overlap.
- Remove the double-branding header pattern on phones.
- Replace the current bottom mobile dock with a more natural mobile creation entry that feels like a real image-creation app.
- Keep the existing mobile creation panel UI, logic, and backend integration intact.

## Non-Goals

- Do not redesign the current mobile creation panel internals.
- Do not change backend workbench generation, billing, upload, polling, or result APIs.
- Do not redesign desktop `/workbench`.
- Do not change fullscreen result preview in this task unless needed for layout compatibility.

## Current Problems

The current mobile workbench has three main problems:

1. The shell has duplicated top branding, wasting precious mobile height.
2. The fixed bottom dock is too tall and visually heavy, and it obscures part of the feed.
3. The page layout uses a desktop-first framing pattern, so the mobile results area feels trapped and is difficult or impossible to scroll cleanly to the end.

The existing mobile creation panel itself is acceptable and should stay.

## Product Direction

Mobile workbench should behave like a creation app with three stable regions:

1. a single compact top bar
2. a middle result feed that is the only main scroll container
3. a bottom creation bar that gives immediate prompt/creation access and opens the full creation panel when needed

The current mobile creation panel remains the detailed editing surface.

## Layout Architecture

### Outer Shell

The mobile shell should use a fixed viewport-height frame:

- outer page uses `100dvh`
- outer mobile shell uses a column layout
- top bar is fixed-height
- bottom creation bar is fixed-height
- middle feed uses `min-h-0` and `overflow-y-auto`

This ensures the browser scroll is not fighting the internal workbench scroll.

### Scroll Ownership

Only the middle content/feed region should own vertical scrolling in the main mobile workbench state.

Requirements:

- no duplicated `overflow-hidden` wrappers that trap touch scrolling
- no result content hidden underneath the bottom creation bar
- feed gets bottom padding equal to bottom bar height + safe area
- last result card must be fully visible and tappable

## Top Bar

The mobile top bar becomes a single compact navigation row.

Contents:

- left: back button
- center: logo + `WORKBENCH` + `创作工作台`
- right: credits pill + history button

Rules:

- remove the second, duplicated branding block below it
- keep the title on one visual level instead of a large stacked hero-style presentation
- constrain total top bar height to a mobile-friendly compact size

## Bottom Creation Bar

The current bottom dock will be replaced with a JiMeng-style creation bar.

### Structure

The bar has three functional zones:

1. left reference entry
   - compact reference button
   - shows reference count
   - opens the current mobile creation panel

2. center creation input surface
   - prompt preview or placeholder
   - creator-facing parameter chips such as model, ratio, size, quantity
   - opens the current mobile creation panel on tap

3. right primary generate action
   - visible at all times
   - reflects loading state

### Interaction Model

- tapping the reference entry opens the existing mobile creation panel
- tapping the prompt/parameter area opens the existing mobile creation panel
- tapping the generate button submits immediately using current draft state

This keeps the old panel as the detailed editing view while making the default mobile state much lighter and easier to use.

## Existing Mobile Creation Panel

The existing panel content should remain unchanged in this task:

- reference area
- prompt textarea
- model selector
- route selector
- ratio / size / quantity controls
- generate button inside the panel

Allowed changes:

- only shell-level positioning or height behavior if necessary for the new layout
- no redesign of section order or internal field UI

## Result Feed

The result feed remains the primary middle content area.

Requirements:

- it must scroll independently under the single top bar and above the new bottom creation bar
- current tasks and completed results remain visible in the existing feed structure
- feed spacing should be rebalanced so cards do not feel crushed by the bottom bar

## Responsive Rules

- `< 768px`: use new mobile shell and JiMeng-style bottom bar
- `>= 768px`: keep existing tablet/desktop behavior

## Validation

Minimum validation:

```bash
npm run test -- src/workbench/WorkbenchPage.test.tsx
npm run build
```

Manual validation:

- only one mobile workbench header is visible
- mobile results can scroll all the way to the last card
- no content is hidden behind the bottom bar
- bottom creation bar stays visible on mobile
- tapping the bottom creation bar opens the existing mobile creation panel
- the current mobile creation panel content remains unchanged
