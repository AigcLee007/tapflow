# 2026-07-09 Panorama 360 Toolbar and Viewer Design

## Status

- Approved in conversation on 2026-07-09
- Scope: 360 panorama generation entry, 360 panorama viewer, and the minimum supporting state/tests only
- This design supersedes the earlier "inline node mode selector + lightweight viewer" direction as the primary product UX

## Summary

Bring TapFlow's 360 feature closer to DramaClaw in product behavior while still fitting the v2 authenticated canvas architecture.

The approved direction is:

- move the primary `360 panorama` generation entry to the top canvas toolbar
- keep generation on the existing image workflow path and billing/runtime path
- require one selected image node as the source context for generation
- support panorama aspect ratios `2:1` and `21:9`
- upgrade the panorama viewer node from a simple preview into a parameterized working viewer
- add capture tools for:
  - current view capture
  - 4-view capture
  - 12-view capture

The implementation should adapt DramaClaw's UX patterns, not hard-copy DramaClaw's route structure or persistence model.

## Background

The repository already has partial panorama support:

- image generation mode support for `panorama_360`
- aspect-ratio helpers for `2:1` and `21:9`
- runtime metadata tagging for panorama assets
- automatic panorama viewer node creation
- a lightweight Photo Sphere Viewer shell

However, the current UX has two product mismatches:

1. The generation entry is buried inside the image node prompt/action area and feels incidental.
2. The panorama viewer is only a simple preview and lacks the parameter controls and capture tools expected from the reference product.

The user explicitly rejected the current inline node-level entry and asked for:

- a top-toolbar generation entry like DramaClaw
- `2:1` and `21:9` generation support
- a richer viewer with controls closer to DramaClaw
- capture actions for current view, 4 views, and 12 views

## Goals

1. Make 360 generation discoverable and intentional from the top toolbar.
2. Preserve the existing TapFlow v2 runtime, billing, draft, and asset architecture.
3. Upgrade the panorama viewer into a canvas-native working surface, not just a preview.
4. Persist capture outputs as normal assets and normal image nodes so they can re-enter the rest of the canvas workflow.
5. Keep scope tight to panorama generation/viewing and avoid unrelated refactors.

## Non-Goals

- No new dedicated backend route like DramaClaw's `/freezone/scene-360` in this phase.
- No migration of unrelated image/video generation UX.
- No redesign of the entire canvas top toolbar beyond the new panorama entry.
- No capture billing in this phase. Capture actions are viewer-side tools, not AI generation jobs.
- No background-anchor pipeline, JSON export tools, or other DramaClaw utilities that exceed the requested scope.
- No rework of unrelated node menus, add-panel behavior, or workspace navigation.

## Final Chosen Direction

## A. Generation Entry

Use a top-toolbar `360 Panorama` action as the primary entry.

Behavior:

- the toolbar button is always visible in the top-right control cluster
- it becomes actionable only when exactly one image node is selected
- clicking it opens a compact panorama generation popover
- the popover uses the selected image node as the source context
- generation always creates a new downstream image node configured for `panorama_360`
- execution continues through the existing `runBackendWorkflow({ runMode: "target_node" })` path

Why this direction:

- it matches the user's desired mental model from DramaClaw
- it stays consistent with TapFlow's canvas-first image-node workflow
- it avoids introducing a second parallel backend orchestration path

## B. Viewer

Upgrade the `panorama_viewer` node into a richer canvas-native working viewer.

Viewer layout:

- center: panorama viewport
- bottom-left overlay: viewport movement controls
- top-center floating toolbar: capture actions
- right-side collapsible panel: FOV, correction, front direction, and effect tools
- top-left small HUD: live yaw/pitch/FOV/focal-length readout

The viewer should feel closer to DramaClaw's node-level working panel while still obeying TapFlow's node sizing, canvas layering, and asset rules.

## User-Facing Requirements

### 1. Top toolbar panorama entry

The canvas top toolbar must include a `360 Panorama` action.

Rules:

- enabled only when one image node is selected
- disabled for no selection, multi-selection, or non-image selection
- tooltip/copy explains the requirement when disabled
- activation opens a compact popover anchored to the toolbar button

### 2. Panorama generation popover

The popover must provide only the controls needed for this task:

- selected source image summary
- aspect ratio selector:
  - `2:1`
  - `21:9`
- credit estimate
- primary generate button

If the selected image node has no usable generation prompt, the popover should show a clear inline explanation and keep the generate button disabled. This phase does not add a second full prompt editor into the toolbar popover.

If the selected image node cannot run panorama generation because of route capability or pricing rules, the popover should surface the same blocking reason the runtime would enforce:

- unsupported generation mode
- missing pricing
- insufficient credits

The popover should not start a new custom workflow path. It is an intent surface for creating a properly configured image node and launching the existing target-node run flow.

### 3. Panorama viewer controls

The upgraded viewer must support:

- zoom in / zoom out
- rotate left / right / up / down
- fullscreen
- FOV slider
- FOV presets:
  - `20`
  - `35`
  - `50`
  - `70`
  - `90`
  - `120`
  - `150`
- sphere correction:
  - `roll`
  - `pitch`
  - `yaw`
  - reset
  - lock current view
- front direction:
  - editable `frontYaw`
  - set from current view
  - jump to `front`, `right`, `back`, `left`, `seam`

### 4. Capture tools

The viewer must expose a floating capture toolbar similar in role to DramaClaw's.

Actions:

- current view capture
- 4-view capture
- 12-view capture
- reset view

Capture behavior:

- capture outputs are persisted as standard assets
- each capture output becomes a normal image node on the canvas
- multi-capture results are laid out in a deterministic grid
- 4-view and 12-view capture results are wrapped in a new group node labeled as a panorama capture set

The target output behavior is:

- current view capture -> 1 image asset + 1 image node
- 4-view capture -> 4 image assets + 4 image nodes
- 12-view capture -> 12 image assets + 12 image nodes

These captures are not AI jobs and should not reserve or settle credits.

## Architecture Fit

## A. Generation path

Do not introduce a new backend panorama task entrypoint in this phase.

Instead:

1. read the currently selected image node
2. create a downstream image node configured with:
   - `generationMode: "panorama_360"`
   - selected panorama ratio
3. connect it to the source node when reference context is needed
4. launch the existing target-node workflow runner
5. let the current runtime/worker/asset pipeline:
   - preflight route capability
   - preflight pricing
   - reserve credits
   - execute generation
   - persist output as an asset
   - settle/refund billing
6. reuse the existing auto-viewer creation behavior after successful panorama generation

This keeps billing, persistence, and worker orchestration aligned with v2 rules.

## B. Capture path

Capture actions are local viewer tools and do not go through the workflow runner.

Instead:

1. render from the live Photo Sphere Viewer canvas
2. capture the relevant frame(s)
3. crop/normalize to the chosen output framing for standard image nodes
4. upload each frame through the existing asset upload path
5. create standard image nodes from the uploaded assets
6. if more than one frame is produced, wrap the created nodes in a group node

This keeps capture outputs recoverable through `assetId` and visible in `/assets`.

## Interaction Design

## A. Toolbar button

Placement:

- inside `FlowTopToolbar`
- visually grouped with the existing right-side utility pills
- uses the same dark premium toolbar language as the rest of the canvas chrome

States:

- default enabled state when exactly one image node is selected
- disabled with explanatory tooltip otherwise
- busy state while the popover is submitting a panorama generation intent

## B. Popover

The popover should stay compact and purpose-built.

Recommended structure:

- header label: `360 Panorama`
- source summary row
- aspect ratio segmented selector or menu
- credit estimate row
- primary generate button

This should feel closer to DramaClaw's compact panorama trigger than to TapFlow's larger inline prompt composer.

## C. Viewer

The viewer should remain a normal node on the canvas, not a separate route or modal-only experience.

Important behavior:

- double-click or explicit fullscreen control opens a larger fullscreen viewing state
- the node itself remains resizable
- the right control panel is collapsible
- control overlays should stop propagation so they do not fight with canvas pan/zoom
- the viewer should keep working both in node mode and in fullscreen mode

## Data Model Expectations

## A. Panorama generation node data

Panorama generation remains an `image` node with explicit panorama mode metadata.

The new top-toolbar flow should end with an image node carrying data equivalent to:

```ts
{
  kind: "image",
  generationMode: "panorama_360",
  params: {
    generationMode: "panorama_360",
    aspectRatio: "2:1" | "21:9",
    panorama: {
      aspectRatio: "2:1" | "21:9"
    }
  }
}
```

Exact nesting can follow current TapFlow helpers, but the persisted intent must clearly identify this as panorama generation.

## B. Panorama viewer node data

The viewer node should persist enough state to preserve a user's working view.

Expected persisted fields:

```ts
{
  kind: "panorama_viewer",
  panoramaSourceNodeId?: string,
  fovDeg: number,
  frontYawDeg: number,
  sphereCorrectionDeg: {
    roll: number,
    pitch: number,
    yaw: number
  },
  panelOpen?: boolean
}
```

Live transient drag state should stay in React state where possible, but durable viewer settings should be saved in node data.

## C. Capture output nodes

Capture outputs are ordinary image nodes backed by assets.

They should:

- store `assetId`
- resolve preview/download URLs through normal asset APIs
- optionally include metadata linking them back to the panorama source viewer/node for traceability

## Error Handling

### 1. Generation blockers

The toolbar popover and the runtime must stay aligned on blocking conditions:

- no selected image node
- selected image node has no usable prompt
- selected node is not runnable for panorama mode
- selected route does not support `panorama_360`
- pricing missing for the selected route/mode
- insufficient credits

The UI should not silently create unusable panorama jobs.

### 2. Viewer loading failures

The viewer must keep clear states for:

- loading
- ready
- failed to load panorama

If the underlying panorama asset URL cannot be resolved, the viewer node should show a readable fallback instead of an empty black shell.

### 3. Capture failures

Capture flows must surface clear errors for:

- missing viewer canvas
- cross-origin or tainted canvas capture failure
- upload failure

Partial multi-capture failure should not corrupt existing nodes. It is acceptable to fail the capture set as one operation in this phase, as long as the failure is explicit.

## Likely File Changes

Expected primary touches:

- modify `src/flowCanvas/canvas/FlowTopToolbar.tsx`
- modify `src/flowCanvas/FlowCanvasPage.tsx`
- modify `src/flowCanvas/canvas/AiFlowCanvas.tsx`
- modify `src/flowCanvas/store/flowCanvasStore.ts`
- modify `src/flowCanvas/nodes/PanoramaViewerNode.tsx`
- modify `src/flowCanvas/panorama/PanoramaViewer.tsx`
- modify `src/flowCanvas/types.ts`
- add `src/flowCanvas/panorama/PanoramaGeneratePopover.tsx`
- add supporting capture helpers under `src/flowCanvas/panorama/`
- update targeted tests around toolbar entry, viewer state, and capture behavior

Deletion is not required. Existing inline panorama mode support may remain as an internal fallback, but the top-toolbar path becomes the primary user-facing entry.

## Validation Plan

Implementation validation must include at least:

- focused tests for the top-toolbar panorama entry visibility and enable/disable behavior
- focused tests for ratio selection `2:1` and `21:9`
- focused tests that the generated node is configured for `panorama_360`
- focused tests for panorama viewer control rendering/state persistence
- focused tests for current-view and multi-view capture orchestration
- `npm run build`

Manual QA should cover:

1. select one image node, open the toolbar panorama popover, and generate a `2:1` panorama
2. repeat for `21:9`
3. verify runtime billing preflight still blocks unsupported routes or missing pricing
4. verify the successful output auto-links to a panorama viewer node
5. verify FOV/correction/front direction controls persist after node deselect/reselect
6. verify current-view capture creates one asset-backed image node
7. verify 4-view capture creates four cleanly arranged asset-backed image nodes
8. verify 12-view capture creates twelve cleanly arranged asset-backed image nodes
9. verify the viewer remains usable in fullscreen

## Risks And Mitigations

### Risk 1: Canvas capture is tainted by cross-origin rendering

Mitigation:

- prefer same-origin preview URLs from the asset API
- keep Photo Sphere Viewer configured for capture compatibility
- fail clearly if a capture cannot be serialized

### Risk 2: Multi-capture floods the canvas with messy output

Mitigation:

- deterministic placement grid
- automatic grouping using the existing group-node capability
- stable naming for capture outputs

### Risk 3: Viewer state breaks older panorama drafts

Mitigation:

- keep viewer node defaults backward compatible
- treat missing viewer settings as normal defaults

### Risk 4: Toolbar entry and existing inline controls become inconsistent

Mitigation:

- define the toolbar as the primary entry
- keep mode helpers shared so both surfaces, if both remain, resolve the same panorama ratios and generation mode patching

## Acceptance Criteria

The feature is ready for implementation when this design is followed and the resulting work satisfies all of the following:

1. The primary 360 generation entry lives in the top toolbar, not only inside the image node prompt bar.
2. The top-toolbar panorama flow supports `2:1` and `21:9`.
3. Panorama generation still runs through the existing v2 workflow/billing/asset path.
4. The panorama viewer exposes FOV, correction, front-direction, viewport navigation, and fullscreen controls.
5. The viewer includes capture actions for current view, 4 views, and 12 views.
6. Capture outputs are persisted as assets and appear as normal image nodes on the canvas.
7. No unrelated image/video/node workflow is refactored as part of this task.
8. Focused tests and `npm run build` are part of implementation verification.

## Recommendation To Planning Phase

The implementation plan should proceed in this order:

1. add the top-toolbar panorama intent surface and selection-state plumbing
2. wire the toolbar flow into panorama-configured image-node creation and the existing workflow runner
3. upgrade the panorama viewer state model and parameter controls
4. add the capture toolbar and asset-backed capture upload flow
5. add focused tests and run build verification
