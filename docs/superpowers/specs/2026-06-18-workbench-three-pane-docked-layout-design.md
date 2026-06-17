# Workbench Three-Pane Docked Layout Design

Date: 2026-06-18

## Decision

Adopt the approved three-pane docked desktop workbench layout with a fixed proportional structure:

```txt
left : center : right = 3 : 5 : 2
```

This replaces the current fullscreen studio balance for desktop workbench. The new target is not a flexible content page. It is a deterministic production workstation with left and right dock panels and a tightly controlled middle task stage.

The approved direction corresponds to the recommended visual direction previously labeled `方案 C`.

## Why This Change

The current desktop workbench still has structural problems:

- the center area is visually large but functionally under-planned
- the right history area feels squeezed and partially off-balance on some screens
- the left parameter area can force the user to scroll before reaching the primary generate action
- scrolling behavior is unclear because the page behaves too much like a normal long content page

The user requirement is to stop treating this like a fluid page layout and instead lock it into a stable three-pane workstation that behaves consistently across desktop screens.

## Goals

- Guarantee a stable `3:5:2` desktop workbench layout.
- Keep the existing left parameter panel UI language and control design.
- Ensure the full primary left-side creation flow is visible at `100%` zoom without requiring the user to scroll down to find the generate button.
- Make the middle column the single source of truth for current in-progress work and the latest recently finished work.
- Limit the middle column to a focused set of at most `8` task entries.
- Restrict the right column to completed tasks only.
- Make left and right columns dock to screen edges and support inward collapse.
- Eliminate whole-page desktop scrolling in favor of independent pane scrolling.

## Non-Goals

- Do not redesign the internal visual language of the left parameter composer.
- Do not change backend generation, billing, result persistence, temporary reference upload, or send-to-project behavior.
- Do not change mobile workbench information architecture in this task.
- Do not reintroduce project coupling into the workbench.

## Desktop Shell Model

Desktop workbench becomes a full-height docked shell:

```txt
+--------------------------------------------------------------------------------------+
| top bar                                                                              |
+----------------------+------------------------------------------+--------------------+
| left dock            | center task stage                        | right dock         |
| parameters           | current task + recent task window        | completed history   |
| fixed to left edge   | max 8 items                              | fixed to right edge |
+----------------------+------------------------------------------+--------------------+
```

Rules:

- The shell occupies the full desktop viewport height below the workbench top bar.
- The page itself should not become a vertically scrolling document on desktop.
- Each pane manages its own internal overflow.
- The left dock is pinned to the left edge of the available workbench surface.
- The right dock is pinned to the right edge of the available workbench surface.

## Column Proportions

Desktop proportions are fixed at:

```txt
3 : 5 : 2
```

Implementation intent:

- left column: `30%`
- center column: `50%`
- right column: `20%`

The layout must preserve the relative ratio rather than drifting into the current ad hoc widths. Small pixel adjustments are acceptable for gutters, borders, and collapsed states, but the resting desktop proportions must visually read as `3:5:2`.

## Left Dock: Parameter Panel

The left dock keeps the existing workbench parameter panel UI and interaction language. It should feel like the current composer, not a redesigned settings form.

What stays the same:

- reference image area
- prompt area
- model selector
- route selector
- ratio, quality/size, quantity controls
- GPT-Image-2 conditional parameters
- multi-image display mode controls
- current pricing summary card
- generate button visual style

What changes:

- the left dock becomes a fixed workstation column instead of a page section
- it docks flush to the left side
- it can collapse inward from the left edge
- its internal layout must guarantee that the cost card and primary generate button remain visible at `100%` zoom on standard desktop heights

### Left Dock Visibility Rule

At `100%` browser zoom on standard laptop and desktop heights, the user must be able to:

1. finish the prompt and parameter setup
2. see the pricing summary
3. click generate

without having to scroll downward to discover the action area.

### Left Dock Scrolling Rule

The left dock may use internal scroll only for overflow inside its parameter body, but the primary bottom action area must remain pinned.

Recommended structure:

- top content region: independently scrollable when necessary
- bottom action region: sticky or docked within the panel
  - pricing summary card
  - generate button

This ensures the action area remains reachable even if the parameter body becomes long.

### Left Dock Collapse Rule

The left dock supports a collapse control anchored to its inner edge.

Collapsed state behavior:

- collapses toward the left screen edge
- keeps a narrow visible rail
- retains a one-click restore affordance
- does not overlay the center task stage with a floating full panel unless explicitly reopened

## Center Pane: Task Stage

The center pane is the main operational stage. It must no longer act as a loosely defined large image area.

Its job is:

- show what is currently generating
- if nothing is generating, show the most recently completed task in the primary stage
- keep the latest task window tight and relevant
- present at most `8` visible tasks total in this pane

### Center Pane Structure

Recommended structure:

1. `Current Task Stage`
2. `Recent Task Window`

#### Current Task Stage

The upper section of the center pane shows one primary task:

- if any task is `pending`, `queued`, `running`, or `waiting_provider`, show the newest active task
- otherwise show the newest completed task

This section can include:

- result preview when available
- status
- progress/state text
- prompt summary
- lightweight retry/open details actions when relevant

This area is the visual focus of the desktop workbench.

#### Recent Task Window

Below the primary stage is a fixed recent-task list for the same desktop session/history feed.

Rules:

- total visible entries in the center pane must not exceed `8`
- the list contains active tasks first, then newest recently completed tasks
- failed tasks may appear here if they are still among the newest relevant tasks
- completed tasks shown here are only the most recent slice, not the full archive

Suggested ordering:

1. active tasks, newest first
2. most recently completed tasks, newest first

until the pane reaches `8` visible entries including the staged primary task context

### Center Pane Scroll Rule

The center pane owns its own vertical scroll when the recent task window exceeds available height.

The page itself should not scroll.

## Right Dock: Completed History

The right dock is a clean completed-history rail.

It exists to answer:

- what has already finished
- what can I quickly reopen, reuse, or inspect later

### Right Dock Content Rule

Only completed tasks belong in the right dock.

Tasks with these states must not appear here:

- `pending`
- `queued`
- `running`
- `waiting_provider`

Failed tasks should stay out of the completed dock unless product later adds a dedicated archived/error section. For this phase, the right dock should read as a clean finished-results history.

### Right Dock Behavior

- pinned to the right screen edge
- independently scrollable
- can collapse inward toward the right edge
- no active generation cards
- no queue-state noise

The right dock should feel calmer than the center pane because it is archive-oriented, not live-status-oriented.

## Data Partition Rules Between Center And Right

To avoid duplication and confusion, the task streams are partitioned as follows:

### Center Pane Includes

- current active task
- active tasks in the recent window
- newest recently completed tasks
- newest failed tasks only when needed for immediate operational awareness

### Right Dock Includes

- completed tasks only
- newest first
- no active tasks
- no queue tasks

### Duplication Policy

A task may appear in the center recent window and the right completed history at the same time if it is newly completed and still part of the most recent `8` center items. This is acceptable because the two panes serve different purposes:

- center = operational recency
- right = completed archive rail

## Top Bar

The desktop workbench top bar remains compact and tool-like.

It should continue to own:

- back/home/workspace escape path
- brand mark
- workbench title
- credit display
- compact utility actions

It should not expand into a large page-heading band.

## Responsive Desktop Behavior

This spec focuses on desktop and large tablet landscape behavior.

Desktop expectations:

- the three-pane layout is the default experience
- the columns remain simultaneously visible
- the left and right docks collapse instead of dropping below the center pane

If available horizontal space becomes too small for usable `3:5:2`, a separate responsive mode may be used, but that is outside this spec. This redesign is for the normal desktop workbench experience, where all three columns should be visible and complete.

## Interaction States

### Empty State

If there are no generations:

- center primary stage shows a clean first-action prompt
- center recent window is empty
- right completed history is empty

The left dock still remains fully operable.

### Active Generation State

When generation starts:

- the center primary stage immediately switches to the newest active task
- the task appears in the center recent window
- it does not appear in the right dock

### Completion State

When a task completes:

- the center stage may continue showing it if it is still the most recent relevant task
- the completed task becomes eligible for the right dock
- the right dock updates without waiting for a full page refresh

## Error Handling

Failed tasks should remain operationally visible in the center pane if they are among the newest tasks, because the user may want to retry or inspect them immediately.

The right dock should remain reserved for successful completed results in this phase to keep it clean and visually stable.

## Implementation Guidance

Expected implementation direction:

- adjust `WorkbenchPage` layout framing
- keep `WorkbenchComposer` visual internals intact as much as possible
- separate active/recent task derivation from completed-history derivation
- replace the current single history column with:
  - center-pane recent task section
  - right completed-only dock
- make pane overflow independent
- introduce left and right collapse state

The implementation should prefer deterministic layout tokens over content-driven width drift.

## Validation

Minimum validation after implementation:

```bash
npm run test -- src/workbench/WorkbenchPage.test.tsx
npm run build
```

Manual validation checklist:

- desktop layout visibly reads as `3:5:2`
- left dock is flush to the left side
- right dock is flush to the right side
- left dock can collapse inward
- right dock can collapse inward
- left parameter area remains visually consistent with the current workbench UI
- at `100%` zoom, the generate button is visible without downward page scrolling
- scrolling the center or right task areas does not move the left parameter dock
- center pane shows current task or most recent completed task
- center pane shows only a focused recent task window with at most `8` items
- right dock contains completed tasks only
- active tasks never appear in the right dock

## Acceptance Criteria

- The desktop workbench uses a fixed three-pane docked layout.
- The pane proportion is visually locked to `3:5:2`.
- The left parameter area stays complete and actionable at `100%` zoom.
- The generate action is always reachable without the user hunting for it below the fold.
- The center pane becomes the single operational stage for current and recent work.
- The center pane shows at most `8` tasks.
- The right dock shows completed tasks only.
- Whole-page desktop scrolling is removed in favor of pane-level scrolling.
- Left and right docks can collapse inward from the screen edges.

