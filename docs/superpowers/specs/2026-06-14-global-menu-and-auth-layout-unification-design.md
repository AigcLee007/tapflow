# 2026-06-14 Global Menu and Auth Layout Unification Design

## Status

- Drafted and approved in conversation on 2026-06-14
- Scope: full frontend, including creator-facing pages, canvas surfaces, and admin/model-management pages

## Background

The current product has reached a point where individual menu and dropdown fixes are no longer enough. The UI now shows multiple classes of inconsistency:

- canvas logo menu can be visually obstructed by neighboring UI
- non-canvas pages still show an outdated top-left brand block instead of the product logo
- canvas menus use different font sizes, item heights, spacing, corner radii, and shadows
- some menus remain open until manually dismissed and interfere with other interactions
- native or semi-native dropdowns appear with a visual style that does not match the product
- the login page scales too large for common desktop viewports, causing incomplete first-screen presentation

The user wants one unified dark menu language based on the visual reference represented by the canvas add-node menu in Image 1. This must apply across the full application rather than only the main creator path.

## Goals

1. Establish one menu and dropdown visual system across the full frontend.
2. Establish one global interaction model for menu opening, dismissal, and mutual exclusion.
3. Replace outdated non-canvas top-left branding with the current product logo system.
4. Correct the login page scale so the first screen is complete and legible on common desktop viewports.
5. Remove visually inconsistent dropdowns like the current workspace sort menu and align them to the same menu system.

## Non-Goals

- No product workflow changes beyond menu, dropdown, logo, and login layout behavior.
- No changes to backend APIs, auth semantics, billing logic, or canvas execution behavior.
- No unrelated visual refresh of entire pages beyond what is needed to bring menus, dropdowns, logo blocks, and login layout into spec.

## Source of Truth Visual Standard

The reference menu style is the dark floating menu shown in the canvas add-node panel from the user-provided Image 1.

This reference defines:

- dark translucent surface
- thin low-contrast outline
- large rounded corners
- soft broad shadow
- high-contrast primary labels
- smaller lower-contrast secondary labels
- consistent item height and internal padding
- clear section grouping with restrained separators
- no native browser select appearance

All touched menus and dropdowns should converge toward this language.

## User-Facing Requirements

### 1. Canvas logo menu obstruction fix

On `/projects/:projectId`, the top-left logo menu must:

- open without being covered by neighboring controls or flyouts
- remain visually anchored to the logo/title cluster
- stay within viewport bounds
- preserve a clear gap from the left floating rail and top chrome

### 2. Global logo replacement

On non-canvas pages, the top-left brand area must use the same product logo system as the canvas and brand transition work, rather than the old cyan square icon block.

This applies to:

- `/home`
- `/workspace`
- `/assets`
- `/billing`
- `/account`
- login/register/auth surfaces where the old shell logo still appears
- admin and settings shells if they reuse the shared top-left brand area

### 3. Menu and dropdown visual unification

The following UI classes must be visually unified:

- canvas logo project menu
- canvas add-node panel
- canvas image-node more menu
- canvas notification menu
- canvas tool flyouts and popovers that behave as menus
- workspace/account/user menus
- project and asset action menus
- workspace sorting/filter/view dropdowns
- admin/model-management dropdowns and selects
- any remaining major dropdowns in provider/model/account pages

Unified traits:

- shared surface treatment
- shared item spacing
- shared typography scale
- shared corner radius
- shared divider treatment
- shared hover/active states
- shared destructive-item treatment

### 4. Login page scale correction

The login page must be reduced in overall first-screen scale while preserving the current visual hierarchy.

Expected result:

- the headline, supporting copy, and login form are visible in a common desktop viewport without feeling cropped or oversized
- the right-side form card does not dominate the viewport height
- spacing is tighter but still premium

### 5. Global menu dismissal behavior

Menus and dropdowns must follow one consistent interaction model:

1. Only one menu/popover/dropdown is open at a time within the active UI scope.
2. Opening one closes previously open siblings or peers.
3. Clicking blank space closes the current menu.
4. Pressing `Escape` closes the current menu.
5. Route changes close transient menus.
6. Menus should not linger and block unrelated interactions.

This directly addresses the interference seen in the user-provided Images 6 and 7.

### 6. Eliminate inconsistent native dropdown UI

Visible product-facing dropdowns must no longer render with the mismatched native style shown in Image 8.

Wherever a dropdown is visible in the product, it should either:

- use the new shared custom dropdown component, or
- be visually wrapped strongly enough to match the shared language if replacement is temporarily impractical

For the main creator path and major admin settings pages, the preferred solution is direct replacement with shared custom dropdowns.

## Design Strategy

### A. Shared menu system

Create a reusable cross-app menu system composed of small primitives. The exact filenames can follow local conventions, but the design requires these conceptual building blocks:

- `MenuSurface`
- `MenuSection`
- `MenuItem`
- `MenuDivider`
- `MenuTrigger`
- `SelectMenu` or equivalent custom dropdown wrapper

These primitives must support:

- default and compact density
- leading icon slot
- optional trailing meta or chevron slot
- destructive variant
- optional secondary description text
- viewport-aware positioning

### B. Shared interaction controller

Introduce one shared mechanism for transient surface coordination.

It must handle:

- outside click dismissal
- `Escape` dismissal
- one-open-at-a-time behavior for overlapping menu groups
- cleanup on route change
- optional portal rendering for overflow-prone cases

This should be implemented as shared logic rather than re-creating event listeners in every component.

### C. Shared dropdown replacement path

Replace major visible `<select>` controls with custom trigger + menu list compositions wherever the current UI is visibly inconsistent.

Priority replacement targets:

1. workspace sort dropdown
2. workspace filter-related dropdowns
3. account and provider settings selects visible in regular product administration
4. AI settings and model-management selectors that are user-facing in admin workflows

## Scope by Area

### Canvas

Primary targets:

- `src/flowCanvas/canvas/FlowTopToolbar.tsx`
- add-node/flyout surfaces
- image-node more menu and related node tool menus
- notification menu
- any canvas menu/popover still using isolated ad hoc styling

Canvas-specific requirements:

- menu positioning must avoid overlap with left rail and top chrome
- all canvas menus should share typography and density
- opening a new canvas menu should close prior open canvas menus

### Shared shell and creator pages

Primary targets:

- `src/app/WorkspaceShell.tsx`
- workspace sorting/filter/view controls
- shared action menus already built from `EntityActionMenu`
- any creator-facing dropdowns on `/workspace`, `/assets`, `/billing`, `/account`

Requirements:

- replace old top-left shell mark with the current logo
- align account menu to shared menu styling
- replace mismatched dropdowns

### Auth pages

Primary target:

- `src/auth/LoginPage.tsx`

Requirements:

- reduce first-screen scale
- tighten spacing
- preserve current dark premium visual direction
- ensure common desktop viewport completeness

### Admin and model-management pages

Primary targets likely include:

- provider settings pages
- AI settings/model management pages
- template library or admin pages where dropdowns are visibly prominent

Requirements:

- move visible dropdowns toward the shared custom style
- keep page-specific business logic unchanged
- align fonts, spacing, and menu surfaces to the global standard

## Visual Spec

### Menu surface

- near-black charcoal background with slight transparency
- subtle 1px outline
- large rounded corners
- broad soft shadow
- no bright gradients or default browser chrome

### Typography

- primary menu label: bold, high-contrast, consistent across all menus
- secondary line: smaller, muted, same rhythm everywhere it appears
- no oversized random menu text on one surface and tiny system text on another

### Spacing

- shared horizontal padding for menu items
- shared item height
- shared section spacing
- shared divider inset

### States

- hover: slightly raised or brighter row background
- active/open trigger: consistent highlighted trigger state
- destructive: red text on shared surface, not a visually disconnected separate button style

## Interaction Spec

### Open/close rules

- opening trigger A closes open trigger B
- outside click closes the current menu
- `Escape` closes the current menu
- route transition closes all transient menus

### Positioning rules

- menus must remain attached to their trigger
- menus must clamp to viewport
- canvas menus must clear floating chrome
- overflow-prone menus should render through a portal when needed

### Layering rules

- shared z-index hierarchy for header, canvas flyouts, modals, and dropdowns
- menu surfaces should not appear behind persistent rails or canvas node overlays

## Acceptance Criteria

The work is complete when all of the following are true:

1. The canvas logo menu no longer shows the obstruction behavior seen in the user screenshots.
2. Non-canvas top-left branding uses the current product logo instead of the old cyan square icon block.
3. Canvas menus visibly share one typography, spacing, and surface system.
4. Major creator/admin dropdowns no longer show the mismatched native UI from Image 8.
5. Opening one menu closes others, and clicking blank space dismisses the current menu.
6. Login page first-screen composition is visibly smaller and complete on common desktop viewports.
7. The updated UI remains functional on `/workspace`, `/projects/:projectId`, and key admin/settings pages.

## Validation Plan

Implementation validation must include:

- targeted component tests for menu open/close behavior
- targeted tests for logo-trigger navigation vs menu behavior
- tests for outside-click and `Escape` dismissal where practical
- `npm run build`

Manual QA must cover:

- canvas logo menu
- canvas add-node menu
- image-node more menu
- notification menu
- account menu
- workspace sort/filter/view controls
- at least one provider/model-management page with dropdowns
- login page at a common desktop viewport

## Risks and Mitigations

### Risk: too many ad hoc menu implementations

Mitigation:

- centralize surface and behavior primitives first
- migrate highest-impact surfaces to the new system rather than skinning each one independently

### Risk: replacing native selects in admin pages causes behavior regressions

Mitigation:

- preserve existing option/state semantics
- replace trigger/rendering layer only
- validate touched pages manually after component-level tests

### Risk: canvas layering conflicts

Mitigation:

- standardize z-index tiers
- use portal rendering for surfaces likely to intersect with rails or node overlays

## Implementation Direction

The follow-up implementation plan should execute in this order:

1. shared menu/dropdown primitives and close-coordination behavior
2. non-canvas shell logo replacement
3. canvas menu unification and obstruction fixes
4. workspace and creator-page dropdown replacement
5. admin/model-management dropdown replacement
6. login page scale correction
7. validation and polish
