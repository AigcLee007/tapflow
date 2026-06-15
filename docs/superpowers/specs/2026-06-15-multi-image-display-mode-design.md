# Multi-Image Display Mode Design

Date: 2026-06-15
Status: approved in conversation
Scope: image node multi-result presentation on canvas

## Summary

When an image node generates more than one image (`2x / 3x / 4x`), the canvas should let the user choose how those results appear:

- `合并显示`
- `多节点显示`

This choice appears inline next to the existing batch-count selector and is only shown when the selected batch count is greater than `1`.

The approved behavior is:

- `1x`: no display-mode control shown
- `2x / 3x / 4x`: show a compact inline display-mode switch
- default mode: `合并显示`
- if `多节点显示` is selected:
  - keep the current image node
  - treat the current node as the parent control node
  - automatically create one result child node per generated image
  - do not also show the same batch inside the parent's result strip

## Product Goals

- keep the current simple flow unchanged for single-image generation
- preserve current combined-result comparison behavior for users who prefer it
- give advanced users a fast way to fan out multiple results into individually editable canvas nodes
- avoid duplicate expression of the same batch result in both a filmstrip and separate child nodes

## Approved UX

## 1. Control visibility

The new display-mode control is hidden when:

- `batchCount` is absent
- `batchCount === 1`

The control is shown when:

- `batchCount > 1`

Placement:

- inline on the image prompt bar
- adjacent to the existing `1x / 2x / 3x / 4x` count control
- use the shared compact dark menu / segmented-control language already used across the canvas

## 2. Control shape

Use a compact two-option segmented control:

- `合并显示`
- `多节点显示`

Requirements:

- same density family as current prompt-bar controls
- no native `<select>`
- stable width so text changes do not shift the prompt row

## 3. Runtime behavior

### 合并显示

Keep current behavior:

- generated outputs stay attached to the current image node
- result count badge and expandable result strip remain the main representation
- `设为主图` and result favorite/download/apply actions continue to work as they do now

### 多节点显示

After a multi-image generation succeeds:

- the parent image node remains in place
- create one child image node per generated result
- each child node contains one image only
- each child node is connected from the parent image node
- child nodes are laid out to the right of the parent with consistent spacing
- the parent node should not show the same batch in the generated result strip for that run

Parent node role:

- keeps prompt, model, route, ratio, quality, and batch controls
- acts as the reusable generation source for future reruns
- visually remains the source of the generated children

Child node role:

- represents one concrete result image
- supports downstream editing, linking, reuse, and independent selection

## 4. Layout behavior for 多节点显示

Initial child layout should be deterministic and simple:

- place the first child to the right of the parent
- place additional children in a vertical stack or short wrapped row based on current node height and result count
- maintain enough gap to prevent overlap with the parent and between children

Recommended first implementation:

- horizontal fan-out anchor from parent right edge
- children stacked vertically with a fixed gap

Reason:

- easiest to implement safely with current graph model
- easiest to understand visually
- avoids needing a more complex grid auto-layout pass in v1

## 5. Persistence model

Persist the chosen display mode in image node data.

Add a new image-node field:

`multiImageDisplayMode: "combined" | "split_nodes"`

Rules:

- default to `"combined"` when missing
- only meaningful for image nodes
- store in graph JSON as normal node data

## 6. Runtime output handling

Current runtime behavior already stores multi-image outputs on the node and exposes them through:

- `generatedResults`
- runtime node assets / result items
- active result / cover result fields

For `split_nodes` mode:

- use the successful run outputs as the source for child-node creation
- create child nodes from the resolved runtime results after generation success
- parent node should still retain enough result metadata to support recoverability if needed, but the visible filmstrip for that batch should be suppressed

Implementation preference:

- keep server/runtime contract unchanged in v1
- branch at the frontend post-success handling layer
- avoid backend schema changes unless they become necessary

## 7. Non-goals for v1

Do not add in this iteration:

- per-run mixed modes
- retroactive bulk conversion of old combined-result nodes into split child nodes
- user-global remembered preference
- dedicated parent-child grouping container
- advanced auto-layout collision avoidance across the whole canvas

## 8. Affected areas

Likely touched frontend surfaces:

- `src/flowCanvas/types.ts`
- `src/flowCanvas/nodes/FlowNodes.tsx`
- `src/flowCanvas/runtime/v2WorkflowRunner.ts`
- `src/flowCanvas/store/flowCanvasStore.ts`
- `src/flowCanvas/utils/nodeFactory.ts`

Potential helper extraction:

- compact prompt-bar display-mode segmented control
- child-node spawn helper for generated image batches

## 9. Behavioral rules

- changing from `1x` to `2x+` should reveal the mode control immediately
- changing back to `1x` hides the mode control but should not destructively clear the saved mode
- rerunning the same parent node uses the currently selected mode
- `split_nodes` applies only to newly completed generations, not historical result strips already on the node
- if child-node creation partially fails on the client, fail safely and keep the parent node result available rather than losing outputs entirely

## 10. Error handling

If `split_nodes` is selected and child-node fan-out cannot complete:

- keep the parent node's generated outputs intact
- surface a visible non-blocking error toast or node error state
- do not silently drop generated outputs

This ensures the generation itself is never lost just because the canvas fan-out step failed.

## 11. Testing

Add focused regression coverage for:

- control visibility at `1x` vs `2x+`
- mode value persistence in node data
- combined mode keeps current strip behavior
- split mode creates one child image node per output
- split mode suppresses duplicate parent result-strip rendering for that batch
- rerun behavior uses latest selected mode

## 12. Recommended implementation sequence

1. add new node-data field and defaults
2. add prompt-bar UI control and visibility rules
3. extract helper to spawn generated result child nodes from runtime outputs
4. branch current post-generation result handling by display mode
5. suppress duplicate filmstrip rendering when split mode was used for the latest batch
6. add focused tests

## 13. Acceptance criteria

The feature is done when:

- choosing `2x / 3x / 4x` reveals a compact inline display-mode switch
- `合并显示` preserves current behavior
- `多节点显示` keeps the parent node and creates one child node per generated image
- split results do not also appear as a duplicate parent filmstrip for that same batch
- canvas save/load preserves the chosen mode
- `npm run build` passes
