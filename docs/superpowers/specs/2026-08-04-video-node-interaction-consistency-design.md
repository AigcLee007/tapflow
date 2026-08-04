# Video Node Interaction Consistency Design

**Date:** 2026-08-04

## Status

Approved for implementation planning.

## Objective

Align video-node editing behavior with the established text and image node behavior while removing accidental upload and manual-resize paths.

The finished behavior must satisfy three product requirements:

1. Clicking an empty video preview only selects the node. Upload starts only from the explicit top upload button.
2. The video editor remains a stable size in screen pixels while the canvas zoom changes, using the same node-anchored inverse-zoom behavior as text and image editors.
3. Video nodes expose no corner or edge resize controls. Their size is derived from the requested ratio before media exists and from natural video dimensions after media exists.

## Current Behavior

The current `VideoNodeComponent` differs from text and image nodes in three places:

- The empty placeholder calls the hidden video file input from its `onClick`, and its drop handler uploads a dropped file.
- `VideoNodeComposer` positions itself directly inside the transformed canvas node without the `1 / zoom` compensation used by the existing `FloatingPromptBar`.
- The video node renders `NodeResizer`, including transparent corner and edge hit areas.

Text and image editor dimensions have already been tuned and are treated as compatibility constraints, not redesign targets.

## Approved Approach

Use a shared node editor surface extracted from the existing text/image `FloatingPromptBar` behavior.

The shared surface centralizes only positioning, inverse-zoom compensation, canvas-interaction isolation, and per-editor sizing tokens. It does not normalize the internal layouts of text, image, and video editors.

### Compatibility Guarantee

Text and image editor appearance must not change.

- Existing `getPromptBarDensity("text")` and `getPromptBarDensity("image")` values remain authoritative.
- Their current width, minimum height, gap, padding, border radius, font sizes, button sizes, top gap, shadow, z-index, and transform origin remain unchanged.
- The extraction must preserve the existing combined transform: node/canvas zoom multiplied by local `scale(1 / zoom)`.
- Video receives an independent variant/configuration. Video values must not alter text or image values.
- Focused regression tests and browser measurements must prove text/image screen dimensions remain unchanged across zoom levels.

## Component Design

### Shared `NodeEditorSurface`

Create a shared component for the outer editor shell. It owns:

- absolute positioning below the selected node;
- horizontal centering;
- `useViewport()` zoom lookup;
- local `scale(1 / zoom)` compensation;
- `transform-origin: top center`;
- `nodrag nopan nowheel` interaction isolation;
- common editor-layer z-index and shadow behavior;
- per-variant width, minimum height, padding, gap, radius, and top-gap tokens.

The component accepts a `variant` of `text`, `image`, or `video`. Text and image variants reproduce the current `FloatingPromptBar` output. The video variant supports the existing responsive video-composer width while keeping its final browser-pixel dimensions independent of canvas zoom.

No portal or viewport-edge avoidance is introduced. The approved behavior is the existing text/image model: the editor follows its node and remains anchored below it.

### `VideoNodeComposer`

`VideoNodeComposer` becomes editor content rather than a self-positioning canvas layer.

It continues to own:

- reference inputs;
- prompt editing;
- model and input-mode selection;
- parameter, palette, camera, and human-review controls;
- pricing summary;
- generation command state.

It no longer owns absolute node positioning, centering, or canvas zoom compensation. `VideoNodeComponent` renders it inside `NodeEditorSurface` only while the node is the single selected node.

## Upload Interaction

### Empty State

The empty video preview is a passive placeholder.

- Clicking it selects the video node through normal React Flow behavior.
- It does not call `videoInputRef.current.click()`.
- It does not upload files dropped on the placeholder.
- It does not present an upload cursor or imply that the entire card is an upload target.

The hidden `input[type="file"]` remains mounted only when no ready video asset exists. Its only trigger is the explicit top upload button.

### Upload Button

The top upload button:

- is visible only for a selected empty video node;
- stops propagation before opening the file input;
- opens the existing hidden video file input;
- preserves the existing video MIME validation, metadata extraction, durable asset upload, and preview resolution flow.

Canceling the file picker does not change node state. Uploaded and generated ready states continue to omit upload and replace controls.

## Node Sizing And Resize Controls

Remove `NodeResizer` from `VideoNodeComponent` completely.

This applies to every video-node state:

- empty;
- generating;
- uploaded;
- generated;
- failed with or without a retained ready asset.

No transparent corner or edge resize hit areas may remain. Connection handles remain unchanged.

Video-node dimensions have only two authoritative sources:

1. Before a ready video asset exists, derive width and height from the selected requested aspect ratio.
2. After upload or generation provides natural media dimensions, derive the fitted node size from those dimensions.

The existing ratio synchronization and generated/uploaded metadata flow remain authoritative. Manual width/height edits are not reintroduced elsewhere.

## State And Data Boundaries

This is a frontend interaction change. It does not change:

- workflow request contracts;
- model capability or pricing data;
- route selection;
- billing reserve/settle/refund behavior;
- asset persistence;
- video output metadata;
- flow draft storage contracts.

Upload continues to persist asset IDs and stable media metadata only. Blob URLs, data URLs, transient signed URLs, `File`, and `Blob` values must not enter node data or flow drafts.

## Error Handling

- Clicking the placeholder, canceling the file picker, selecting another node, or changing canvas zoom produces no upload error.
- Non-video files continue to produce `VIDEO_FILE_REQUIRED`.
- Metadata, asset upload, and preview-signing behavior retain the existing safe error handling.
- An existing durable asset is not removed if preview signing fails.
- Generation progress, generation-button disabling, provider errors, and billing behavior are unchanged.
- Removing resize controls must not remove or enlarge connection-handle hit areas.

## Test Strategy

### Focused Component Tests

Add or update tests proving:

- clicking the empty video placeholder does not click the hidden input and does not call the upload API;
- dropping a video on the placeholder does not call the upload API;
- clicking the top upload button is the only path that opens the file picker;
- uploaded and generated ready states contain no upload or replace entry;
- selected video nodes do not render `NodeResizer` handles or lines;
- requested-ratio sizing and natural-media sizing continue to update node dimensions;
- video editor controls retain `nodrag nopan nowheel` behavior.

### Shared Surface Tests

Test zoom values `0.25`, `0.5`, `1`, and `2`, verifying the corresponding inverse scales `4`, `2`, `1`, and `0.5`.

Assert that text and image variants preserve their current density tokens and positioning values. Assert that video uses an independent variant and cannot mutate or override text/image configuration.

### Browser Smoke

Across desktop, narrow, and mobile contexts:

- click an empty video preview and confirm it only selects the node;
- click the top upload button and confirm the file input is invoked;
- verify no visible or transparent resize controls exist around the video node;
- measure editor screen width and height at multiple canvas zoom levels and confirm stable dimensions within browser rounding tolerance;
- move the selected node and confirm the editor remains anchored below it;
- compare text and image editor measurements before and after the extraction to prove no visual-size regression.

### Required Verification

Run focused Vitest suites for `FlowNodes`, the shared editor surface, prompt-bar density, video sizing, upload behavior, and existing video-node browser smoke. Finish with `npm run build`.

## Acceptance Criteria

The design is complete when all of the following are true:

- Empty video placeholder clicks never open a file picker or upload a file.
- Dropping a file on the empty placeholder never uploads it.
- Only the top upload button can initiate empty-node upload.
- Video editor browser-pixel dimensions remain stable while canvas zoom changes.
- Video editor follows the selected video node and remains anchored below it.
- Text and image editor dimensions and visual density remain unchanged.
- Video nodes expose no manual resize handles or hidden resize hit areas in any state.
- Automatic requested-ratio and natural-media sizing continue to work.
- Existing ready-state, generation, asset, billing, and draft-safety behavior remains unchanged.

## Out Of Scope

- Redesigning text or image editor dimensions.
- Moving editors to a viewport-fixed bottom dock.
- Portal-based editor positioning or viewport collision avoidance.
- Reintroducing drag-and-drop upload elsewhere on the video node.
- Adding video replacement after a ready asset exists.
- Changing video model capabilities, provider routes, API keys, pricing, or generation contracts.
