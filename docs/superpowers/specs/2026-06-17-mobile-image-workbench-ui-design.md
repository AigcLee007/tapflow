# Mobile Image Workbench UI Design

## Goal

Add a project-scoped image generation workbench that is comfortable on phones and efficient on desktop, while continuing to use the existing canvas backend path: authenticated projects, one primary flow, server-side drafts, workflow runs, billing, AI Gateway routes, and cloud assets.

The workbench is a new UI mode for the same project data. It is not a separate generation product and it must not bypass canvas draft persistence or billing.

## Approved Direction

Use the project-internal dual-mode approach:

- Desktop users can switch between `Workbench` and `Canvas`.
- Mobile users opening a project default to `Workbench`.
- The workbench hides canvas-node mechanics from the creator.
- Generated results still sync into the same flow draft as normal image nodes.

The approved product shape is `Creative Flow Workbench V1`.

## Route And Mode Model

The target route model should support explicit URLs:

```txt
/projects/:projectId/workbench
/projects/:projectId/canvas
```

Compatibility behavior:

```txt
/projects/:projectId
```

- On mobile or coarse-pointer devices, redirect or replace to `/projects/:projectId/workbench`.
- On desktop devices, redirect or replace to `/projects/:projectId/canvas`.
- If the URL is already explicit, respect the URL instead of re-detecting device type.

Mode switching appears as a segmented control in the top-right project header:

```txt
[ Workbench ] [ Canvas ]
```

The mode switch changes only the surface. It must not create a new project, flow, model route, or asset namespace.

## Desktop UI

Desktop uses a two-column creative workspace.

```txt
+------------------------------------------------------------------+
| Project name                              [Workbench] [Canvas]   |
+--------------------+---------------------------------------------+
| Generate panel     | Generation batch feed                       |
|                    |                                             |
| Reference cards    | Batch card                                  |
| Prompt editor      | Prompt / model / params / status / results  |
| Model / route      |                                             |
| Ratio / size       | Batch card                                  |
| Count              | Prompt / model / params / status / results  |
| Advanced params    |                                             |
|                    |                                             |
| Generate button    |                                             |
+--------------------+---------------------------------------------+
```

### Desktop Layout Rules

- Left generate panel is fixed-width, ideally `360px` to `420px`.
- Right panel is a vertical batch feed with generous image space.
- The page should be full-height and avoid nested card-in-card composition.
- The main content uses dark professional styling aligned with the current canvas.
- Images are the first visual priority; parameter metadata is secondary.
- Menus, dropdowns, and compact popovers must use the existing shared TapNow-style menu system.

### Desktop Generate Panel

The left panel contains, from top to bottom:

1. Reference image strip
2. Prompt editor
3. Model and route selector
4. Core parameters
5. Advanced parameters accordion
6. Credit estimate and generate button

Core parameters are visible by default:

- Model
- Route
- Aspect ratio
- Size or quality tier
- Quantity
- Reference images

Advanced parameters are collapsed by default:

- Output format
- Moderation strength
- Quality setting
- Model-specific options

The advanced section should use model-aware controls so Nano Banana and GPT-Image-2 can keep their different parameter semantics.

## Mobile UI

Mobile uses a generation feed plus a half-expanded bottom composer.

```txt
+------------------------+
| Project name   [mode]  |
+------------------------+
| Batch card             |
| Result images          |
|                        |
| Batch card             |
| Result images          |
|                        |
+------------------------+
| Reference cards        |
| Prompt editor          |
| Model Ratio Size Qty   |
| Credits       Generate |
+------------------------+
```

### Mobile Layout Rules

- Mobile opens in workbench mode by default.
- The generation feed scrolls behind a sticky bottom composer.
- The bottom composer starts half-expanded.
- The half-expanded state shows only frequent controls:
  - reference cards
  - prompt input
  - model summary
  - ratio summary
  - size or quality summary
  - quantity
  - credits
  - generate button
- Swiping or tapping expands the composer into full parameter mode.
- Full parameter mode shows the complete model route selector and advanced accordion.
- The generate button stays in the thumb zone and remains visually primary.
- Touch targets should be at least `44px` high.
- Avoid dense desktop-only tables on mobile.

### Mobile Result Interactions

The feed stays clean. Result cards do not show many inline action buttons.

Tapping a result image opens a bottom sheet with:

- Preview
- Download
- Use as reference
- Favorite
- Regenerate from this prompt
- View parameters

Long press may be supported in a future iteration, but V1 should not depend on hidden long-press discovery.

## Generation Batch Feed

Results are grouped by generation batch, not as a pure image waterfall.

Each batch card represents one generate click and contains:

- Prompt preview
- Model display name
- Route label
- Aspect ratio
- Size or quality tier
- Quantity
- Estimated or charged credits
- Status
- Result image group
- Error message if failed

The workbench does not display canvas node IDs, node handles, or graph edges. The user should feel they are using a focused image generation tool.

Generated results still create or update canvas image nodes behind the scenes so canvas mode can show the same project state.

## Reference Images

Reference images appear as small cards above the prompt.

Reference sources:

- Select from cloud assets
- Upload
- Use a previous result as reference

Reference cards show:

- Thumbnail
- Remove action
- Optional short label

Reference cards should map to existing node fields such as `referenceAssetItemIds` and `referenceOrder` instead of embedding image bytes or signed URLs into draft JSON.

## Visual Style

Use a dark professional creative-studio style:

- Background: deep neutral black/gray
- Panels: quiet dark surfaces with restrained borders
- Primary accent: reuse current project accent rather than introducing a new palette
- Cards: compact, image-forward, not decorative
- Typography: clear, compact, no oversized hero type inside tool surfaces
- Menus: existing shared menu density baseline
- Buttons: icon-first where familiar icons exist

Do not introduce a marketing-style landing page, decorative background blobs, or one-off menu typography.

## Backend Integration Requirements

The workbench must reuse the existing backend flow:

1. Load the project with the same project/flow/draft APIs used by the canvas.
2. Create or update normal image nodes in the shared canvas store.
3. Save the latest graph to `flow_drafts` before running.
4. Launch `target_node` workflow runs for the generated image node.
5. Let existing worker, billing, AI Gateway, and asset persistence handle execution.
6. Render completed assets from workflow node output and asset URLs.

The workbench must not:

- Store generated media as base64, blob URLs, or data URLs in draft JSON.
- Add a parallel billing flow.
- Add a frontend-only generation path.
- Expose provider credentials.
- Create an isolated asset library.

## State Model

V1 can derive batch feed items from:

- Current image nodes created by workbench
- `lastGenerationSnapshot`
- `generatedResults`
- `nodeOutputByNodeId`
- `nodeRunStatusByNodeId`
- `workflowRunIdByNodeId`

Workbench-created nodes should include a small metadata marker in node data, for example:

```ts
{
  workbench: {
    source: "image-workbench",
    batchId: string,
    createdAt: number
  }
}
```

This marker is UI metadata only. It must not replace workflow run records or asset records as the source of truth.

## Error Handling

Errors should be shown at batch level:

- Insufficient credits
- Missing pricing
- Missing route
- Workflow launch failed
- Provider failure
- Asset preview unavailable

Mobile errors appear inline in the batch card and can also show a short toast. The UI should keep the prompt and parameters available for retry.

## Responsiveness

Recommended breakpoints:

- Desktop: `>= 1024px`
- Tablet: `768px - 1023px`
- Mobile: `< 768px` or coarse pointer

Tablet can use a hybrid layout:

- Generate panel becomes a collapsible side sheet.
- Batch feed remains the primary area.

## V1 Scope

V1 includes:

- Project workbench route and mode switch
- Mobile default to workbench
- Desktop two-column layout
- Mobile bottom composer
- Text-to-image generation
- Model/route selection
- Core image parameters
- Advanced parameter accordion
- Reference image strip UI
- Batch feed
- Result image detail bottom sheet on mobile
- Same backend generation and asset persistence path as canvas

V1 excludes:

- A new backend generation API
- A new project data model
- Full image editing tools inside the workbench
- Agent planning workflows
- Batch prompt CSV upload
- Advanced history search

These can be added in later phases after the main generation loop feels right.

## Acceptance Criteria

- On mobile, opening a project defaults to workbench mode.
- On desktop, opening a project defaults to canvas mode unless the URL explicitly requests workbench.
- Workbench and canvas use the same project and flow.
- A workbench text-to-image generation creates a normal image node in the shared draft.
- Generated images appear in the workbench batch feed and in canvas mode.
- Generated assets appear in `/assets`.
- Billing reserve/settle/refund remains server-side.
- The workbench does not expose provider secrets.
- Menus and dropdowns follow shared project menu styling.
- Mobile generation can be completed with one hand without needing canvas gestures.
