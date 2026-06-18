# Workbench Two-Column Results Rail Design

Date: 2026-06-18

## Decision

Replace the current desktop three-pane workbench with a two-column layout.

The desktop workbench should no longer spend screen width on a separate middle current-task stage. That area is not providing enough value compared with the space it consumes. The desktop experience should instead become:

- left parameter dock
- right unified results workspace

The approved desktop ratio is:

- left: `3`
- right: `7`

The left parameter dock must keep the existing workbench composer design, interactions, spacing, and pinned footer behavior. The right side becomes the only output surface and must internally scroll without moving the left dock.

## Goals

- Remove the low-value dedicated current-task stage from the desktop workbench.
- Keep the existing parameter workflow unchanged on the left.
- Reclaim the removed center width for a more useful results workspace.
- Make the right side feel like a practical image-generation console instead of a fragmented dashboard.
- Keep status visibility for in-flight generations without sacrificing result browsing space.

## Non-Goals

- Do not redesign the left parameter composer.
- Do not change workbench backend APIs, billing flow, queue flow, or generation persistence.
- Do not change mobile workbench layout in this task.
- Do not reintroduce project coupling into workbench.

## Layout Decision

Desktop `/workbench` must use a fixed two-column shell:

- left dock: `3fr`
- right workspace: `7fr`

The old three-pane desktop layout is explicitly retired:

- no center current-task hero panel
- no separate center recent-task list
- no separate narrow right completed-history dock

Instead, the right side is one continuous workspace with two vertical sections.

## Left Dock

The left dock keeps the existing implementation baseline:

- same `WorkbenchComposer`
- same reference image strip
- same prompt area
- same model, route, ratio, size, quantity, and GPT-image-2 parameter controls
- same multi-image display mode controls
- same pinned summary card and generate button footer

The left dock may remain collapsible if the existing shell already supports it, but collapse behavior is secondary. The main requirement is that the visible left dock remains unchanged in design language and does not scroll with the page.

## Right Workspace Structure

The right workspace is a single rounded container with internal scrolling.

It is split into:

1. top status band
2. completed results rail

### Top Status Band

Purpose:

- keep in-progress work visible
- avoid hiding active tasks completely
- consume minimal height

Behavior:

- shows only `pending`, `queued`, `running`, `waiting_provider`, and `succeeded-without-results` generations
- rendered as a compact stacked strip near the top of the right workspace
- should show a small count badge
- should remain visually lighter than the completed-results area
- can stay inside the same internal scroll container; no separate sticky requirement for this task

Visual form:

- compact horizontal result/status cards
- small preview thumbnail if available
- concise prompt/status text
- retry/reuse actions where already supported

The status band should not dominate the page. It is a utility strip, not the primary content.

### Completed Results Rail

Purpose:

- become the main desktop output surface
- prioritize browsing finished results and taking actions on them

Behavior:

- shows only completed generations with usable results
- ordered newest first
- newly completed work should appear at the top
- generations that are still active must not appear in this section until they are complete

Visual form:

- single-column horizontal result cards
- left side: image preview
- right side: prompt, status/meta, credit info, and action buttons

Required actions:

- retry
- reuse parameters
- open/select result
- existing send-to-project flow remains reachable from result detail flow

The completed results rail is the dominant visual region on the desktop workbench.

## Scroll Behavior

The right workspace must scroll internally.

Rules:

- page-level desktop scrolling should not be the primary interaction
- left parameter dock stays visually fixed while the user browses history/results
- the right workspace holds both the top status band and the completed-results rail
- when content exceeds available height, scrolling happens inside the right workspace

This preserves the “parameter input stays ready while browsing output” workflow.

## Generation Partition Rules

Desktop derivation logic should be simplified from the earlier three-pane model.

Required derived collections:

- `activeGenerations`
- `completedGenerations`

Definitions:

- active:
  - `pending`
  - `queued`
  - `running`
  - `waiting_provider`
  - `succeeded` with zero results
- completed:
  - `succeeded` with at least one result

No separate desktop “primary stage” concept is required after this redesign.

## Empty States

Right workspace empty state behavior:

- if there are active generations but no completed generations:
  - show the status band populated
  - show an empty completed-results area with brief guidance
- if there are no generations at all:
  - show a lightweight empty state in the completed-results section
  - do not revive the large current-task hero copy

The empty state should remain compact and workbench-like.

## Error States

- route-level errors remain compact inline alerts near the top of the page
- failed generations should not be grouped into the active status band
- failed generations may either stay visible in the completed rail as failed horizontal cards or remain excluded if the current code path already treats them separately; for this task, the preferred behavior is to keep failure visibility in the right workspace rather than recreating a dedicated stage

## Component Direction

Expected code direction:

- `WorkbenchPage`
  - own the new two-column desktop shell
  - remove center-stage rendering path from desktop
- `WorkbenchComposer`
  - unchanged visual baseline
- desktop layout helper module
  - simplify from stage/history partitioning to active/completed partitioning
- right-side desktop components
  - status band component
  - completed rail component
  - horizontal completed-result card component

Large homepage-like explanatory copy must not be reintroduced.

## Validation

Minimum validation after implementation:

```bash
npx vitest run src/workbench/workbenchDesktopLayout.test.ts src/workbench/WorkbenchPage.test.tsx
npm run build
```

Manual desktop checks:

- `/workbench` uses two columns, not three
- left/right ratio reads visually as `3:7`
- left parameter dock remains unchanged in look and usage
- right side is the only output workspace
- right side internally scrolls
- active tasks appear in the top status band
- completed tasks appear in the single-column horizontal results rail
- new completed items land at the top of the completed rail
