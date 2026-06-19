# Mobile Workbench Optimization Design

Date: 2026-06-19

## Decision

Use the approved mobile workbench direction based on the current standalone `/workbench` route, but replace the current "desktop composer inside a bottom sheet" behavior with a true mobile-first creation workstation.

This design keeps the existing backend generation, billing, result polling, temporary reference upload, and send-to-project flows unchanged. The work is a frontend interaction and layout redesign focused on mobile ergonomics while preserving desktop behavior.

## Goals

- Make `/workbench` feel intentionally designed for phones instead of merely responsive.
- Keep the page fullscreen and tool-like, not a homepage/content-page experience.
- Preserve the existing AI generation, billing, assets, temporary reference upload, and result history contracts.
- Optimize for one-handed creation on mobile:
  - result-first browsing
  - bottom anchored primary actions
  - touch-friendly parameter editing
  - clear reference-image workflow
- Keep desktop workbench behavior intact except where shared state/components need small compatibility refactors.

## Non-Goals

- Do not change backend API contracts.
- Do not change pricing, model semantics, route resolution, or polling logic.
- Do not redesign the desktop `/workbench` shell in this task beyond any small shared-component compatibility adjustments.
- Do not reintroduce project dependency into workbench.
- Do not make workbench reference images authoritative in browser local storage.

## Current Problem Summary

The current mobile workbench is functionally available but not product-ready:

- `WorkbenchMobileComposer` only opens the existing `WorkbenchComposer` inside a bottom sheet.
- The main page layout still reflects desktop priorities.
- The result surface, history, prompt, references, and parameters do not form a clear mobile hierarchy.
- Touch targets and information density are still tuned around desktop assumptions.
- Reference-image management is technically working, but mobile usability and preview clarity are poor.

## Product Direction

Mobile `/workbench` should become a fullscreen independent creation surface with this priority order:

1. current result or generation state
2. prompt and reference workflow
3. model/route/ratio/size/quantity editing
4. history browsing and result actions

On phones, the user should always understand:

- what is currently generating
- what the latest result is
- what model/route/ratio/size/count is selected
- where to edit prompt and references
- how to start the next generation without scrolling around the page

## Mobile IA And Layout

### Top Bar

Mobile top bar becomes compact and utility-focused.

Contains:

- left: back button
- center: `创作工作台`
- right: credits pill plus history entry

Remove or hide on mobile:

- desktop-style status chips
- notification/share utility cluster
- large stacked title treatment

The top bar should consume minimal height and remain readable at common mobile widths such as `375px`, `390px`, and `430px`.

### Main Stage

The central mobile area is result-first.

Priority order:

- currently running task if any
- latest completed generation
- empty state if no generations exist yet

Requirements:

- hero image or task stage occupies the main visual focus
- generation state cards are vertically compact but visually prominent
- failed states surface retry clearly
- latest batch should show partial completion instead of waiting for the entire batch

### Bottom Action Dock

Mobile gets a persistent bottom action dock above the safe area.

The dock contains:

- left summary block: selected model and route
- center summary block: ratio, size, quantity
- right primary action: `开始创作`

Behavior:

- tapping the summary area opens the full mobile parameter panel
- the primary action is always visible without scrolling
- generation loading state is reflected directly in the primary action button

### Full Mobile Parameter Panel

Instead of reusing the current desktop composer as-is, mobile uses a dedicated parameter sheet that preserves existing business logic but changes presentation.

The panel opens from bottom and can expand to near-fullscreen height.

Section order:

1. Prompt
2. Reference images
3. Model and route
4. Ratio / size / quantity
5. Advanced GPT-Image-2 fields when relevant

Rules:

- use large touch targets
- avoid desktop-style dense multi-column sections
- default to one column
- use shared menu tokens where popup menus are still needed
- keep the generate button pinned at the bottom of the panel

## Reference Image UX

Reference images are a critical mobile workflow and need first-class treatment.

### Requirements

- uploaded references show immediate local preview
- each reference card remains visible as an actual image thumbnail, not just a filename or hidden attachment state
- each card shows:
  - thumbnail
  - index badge like `图1`
  - remove action
  - quick `@引用` insertion action
- reference strip scrolls horizontally with touch and clearly indicates overflow only when overflow exists
- reference upload must continue using the existing temporary upload endpoint, not browser direct OSS upload and not asset-library persistence

### Prompt Integration

- users must be able to tap a reference card action to insert `@图N` into the prompt
- referenced cards should visually highlight when their `@图N` token exists in the prompt
- the prompt hint should be rewritten for mobile clarity and reduced visual noise

## Result Feed UX

Mobile should not inherit the desktop "history rail" mental model.

### Structure

- one primary hero result/stage at top
- below it, a vertical result feed of recent tasks
- each feed item is simplified compared to desktop:
  - preview image
  - prompt preview
  - creator-facing parameter summary
  - status
  - overflow action menu

### Multi-Image Behavior

- multi-image generations should render as one grouped result item
- inside the result item, images should be displayed as a swipeable horizontal gallery or horizontal thumbnail strip
- the first completed child image appears immediately when available
- additional images append as they arrive
- tapping a thumbnail changes the selected preview without forcing fullscreen

### Result Actions

Each result item supports:

- fullscreen preview
- download original
- use as reference
- delete record
- send to project where already supported

On mobile these actions should live behind either:

- a compact bottom action row for the selected image, or
- a `更多` action menu

The goal is a clean card, not a dense desktop action cluster.

## Fullscreen Preview

The fullscreen preview already exists, but mobile behavior should be refined:

- image fits by longest side within viewport
- same-batch images can be switched left/right
- action row remains accessible without obscuring the image
- close affordance is always obvious and reachable

## Shared State And Data Flow

No backend contract changes are required.

The mobile workbench continues to use:

- `useImageModelCatalog`
- `createDefaultWorkbenchDraft`
- `useWorkbenchGenerations`
- `sendWorkbenchResultToProject`
- `getAssetVariantUrl`
- existing workbench temporary reference upload APIs

State responsibilities:

- `WorkbenchPage` remains the owner of draft state, generation state, selected result, and send-to-project dialog state
- mobile-only presentational state such as panel open/closed, current mobile stage selection, and active feed item should be isolated in mobile components

## Component Architecture

Expected shape after implementation:

- `WorkbenchPage`
  - route container
  - shared state and side effects
  - desktop/mobile branching
- `WorkbenchMobileShell`
  - mobile-specific page frame
  - top bar
  - stage region
  - feed region
  - bottom dock
- `WorkbenchMobileBottomDock`
  - persistent mobile action dock
- `WorkbenchMobileParameterSheet`
  - mobile-first prompt/reference/parameter editor
- `WorkbenchMobileReferenceStrip`
  - mobile reference cards and interactions
- `WorkbenchMobileResultFeed`
  - mobile result list
- `WorkbenchMobileResultCard`
  - mobile-friendly generation card

`WorkbenchComposer` should remain the desktop baseline. Shared business logic may be extracted, but desktop should not regress because of the mobile redesign.

## Responsive Rules

- `< 768px`: mobile workbench shell
- `768px - 1023px`: tablet behavior can initially follow mobile shell with slightly wider spacing
- `>= 1024px`: keep current desktop shell

This avoids trying to force a desktop three-pane concept into tablet/phone widths.

## Visual Rules

- maintain the existing dark premium workbench atmosphere
- avoid homepage-navigation feel
- avoid oversized hero text
- prioritize image visibility and touch ergonomics
- use consistent menu/select surface styling from shared menu tokens
- use stable fixed heights for bottom dock and top bar
- respect mobile safe area insets for bottom actions and sheet content

## Error And Loading States

- submission errors show as compact inline alerts near the mobile stage or sheet footer
- reference upload errors stay scoped to the reference section
- loading state appears in:
  - primary generate button
  - current task stage card
  - feed item skeletons when polling
- result feed must not appear "stuck" when one child image is already ready

## Validation

Minimum implementation validation:

```bash
npm run test -- src/workbench/WorkbenchPage.test.tsx src/workbench/workbenchReferences.test.ts
npm run build
```

Manual validation:

- iPhone-width viewport opens a true mobile-first workbench shell
- the bottom action dock remains visible without scrolling
- prompt editing, reference upload, model selection, route selection, ratio, size, and quantity are all reachable from the mobile parameter sheet
- reference uploads show local preview immediately
- tapping `@引用` inserts the correct `@图N`
- multi-image generations show partial results as children complete
- latest results appear in the feed without requiring a full page refresh
- fullscreen preview fits the image correctly and remains usable on mobile
