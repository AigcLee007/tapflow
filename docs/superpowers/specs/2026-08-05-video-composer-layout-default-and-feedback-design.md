# Video Composer Layout, Default Model, and Generation Feedback Design

Date: 2026-08-05
Status: Approved for implementation planning

## Context

The video node composer currently has three related usability problems:

1. Selecting a model can make the bottom control row wrap into two rows. The model label and estimated cost appear after selection, while mode and palette controls also compete for the same width.
2. A newly created video node has no default model even when a fully usable video model is available.
3. After generation starts, the video node often appears unchanged. The current two-pixel progress bar depends on provider progress, and a zero or unavailable progress value makes it effectively invisible.

The existing text and image editor dimensions are already tuned and are outside this change. Video route keys, provider routing, capability validation, pricing, and billing semantics must also remain unchanged.

## Goals

- Keep the desktop and tablet video composer stable after model selection.
- Move input mode and palette into the upper tool group beside camera movement.
- Give reference inputs a dedicated conditional row.
- Select a deterministic, fully usable default model for new unconfigured video nodes.
- Give immediate, persistent, and accessible feedback throughout video generation.
- Preserve saved model choices and all current fail-closed pricing behavior.

## Non-Goals

- Redesigning text-node or image-node editors.
- Changing video provider adapters, route keys, model capabilities, pricing values, or billing workflows.
- Adding provider progress polling or displaying an estimated percentage.
- Allowing video upload or replacement after generated video exists.
- Changing the database schema.

## Chosen Layout

The selected video node editor uses the following structure:

```text
First row:   [Input mode] [Camera movement] [Palette]
Second row:  [Reference inputs...]                    conditional
Prompt area
Bottom row:  [Model] [Parameter summary] [Human review] [Estimated cost] [Generate]
```

Input mode, camera movement, and palette are conceptually prompt-shaping tools, so they belong in one stable upper row. Reference inputs vary significantly by mode and receive a separate row instead of competing with either the tool row or the action row.

The reference row is omitted entirely for text-to-video. It is rendered only when the selected mode accepts reference media. Existing mode capability rules remain authoritative for which image, video, or audio controls appear.

The bottom row contains only execution-related controls. Model labels have a bounded width with truncation; the model menu and tooltip expose the complete display name. Estimated cost occupies a reserved region near the Generate button rather than using a flexible auto margin that can unexpectedly force wrapping.

At widths of 768 pixels and above, the bottom row remains a single compact row. Below 768 pixels, it splits into exactly two deliberate groups: model, parameter summary, and human review first; estimated cost and Generate second. This responsive split must not depend on incidental text wrapping.

The video composer continues using the shared zoom-stable editor surface. This change does not modify shared surface dimensions or any text/image node styles.

## Default Model Resolution

The node factory continues creating video nodes without a hardcoded database model ID. Default selection happens only after the video catalog is available because catalog model IDs are database records and usability depends on live route and pricing data.

Add a pure resolver with behavior equivalent to:

```ts
resolveDefaultVideoModel(models): VideoModelOption | null
```

A model is eligible only when all existing catalog checks consider it usable for generation: it is active, has a valid generation route, has route-confirmed capabilities, and has exact pricing. The existing catalog `blocker` result is the source of truth; the resolver must not duplicate a weaker definition of usability.

Resolution order:

1. Return the eligible model whose `modelKey` is exactly `gemini-omni-flash`.
2. If Gemini is ineligible or absent, return the first eligible model in the catalog's existing sorted order.
3. Return `null` when no model is eligible.

Hydration belongs in the always-mounted video node component, not the selected-only composer. Once catalog loading succeeds, it writes the resolved model and route only when the node has no `modelId`. It never overwrites a saved or user-selected model. Repeated catalog updates must be idempotent and must not cause repeated node writes.

Catalog states are explicit:

- Loading: show a non-interactive model loading placeholder and do not mutate the node.
- Loaded with eligible models: hydrate an unconfigured node using the resolver.
- Loaded with no eligible models: show `选择模型`, keep Generate disabled, and preserve fail-closed behavior.
- Failed: show `模型加载失败` with a catalog retry action; do not choose a partial or stale fallback.

The selection write must reuse the existing model-selection path so model ID, route key, capabilities, defaults, and dependent parameter normalization remain consistent.

## Generation Feedback

Generation feedback belongs in the video preview area, not inside the floating editor. It therefore remains visible when the node is no longer selected.

State mapping:

| Runtime state | Preview feedback | Composer action |
| --- | --- | --- |
| `pending` | `正在提交任务` | Generate shows `生成中` and is disabled |
| `running` | `正在生成视频` | Generate shows `生成中` and is disabled |
| `waiting_provider` | `正在生成视频` | Generate shows `生成中` and is disabled |
| success | Render the generated video | Normal controls resume |
| failure | Render a concise error state and retry action | Normal controls resume |

When a detailed runtime state is unavailable, the existing `generationStatus === "generating"` compatibility signal enters the generating presentation with `正在生成视频`.

The feedback uses an indeterminate animation because providers do not consistently report real progress. It must not synthesize a percentage from elapsed time. If a real progress value already exists, it may be used as secondary visual progress, but the state message remains authoritative and the feedback must still be visible at zero percent.

During generation, controls that can change the request are locked: model, input mode, camera movement, palette, parameters, reference media, prompt, and human review. The node can still be selected, moved, and inspected, and normal canvas navigation remains available.

On success, the preview feedback is replaced by the generated video. On failure, the editor becomes editable again and the preview area shows the existing provider-safe error message plus `重试`. Retry submits the node's current persisted parameters through the normal generation command; it must not bypass validation, pricing lookup, reserve/settle/refund handling, or route selection.

Animation respects `prefers-reduced-motion`. Reduced-motion mode uses a static status treatment without looping movement.

## Component Boundaries

The implementation should preserve focused responsibilities:

- `videoModelCatalog`: owns the pure eligible-default resolver and its tests.
- Always-mounted video node component: owns one-time default hydration after catalog resolution.
- `VideoNodeComposer`: owns the reorganized control layout and generation-time control disabling.
- A focused video generation feedback component: maps runtime state to preview presentation, reduced-motion behavior, error display, and retry intent.
- Existing workflow-generation handlers: remain responsible for request validation, billing, enqueueing, and retry execution.

The feedback component receives normalized state and callbacks. It does not query routes, compute pricing, mutate billing state, or write media URLs into node data.

## Error Handling

- Catalog failure never silently selects a model and never enables generation.
- Missing route, capabilities, or exact pricing makes a model ineligible; missing pricing remains `PRICING_NOT_FOUND` and fails closed.
- A default-model hydration failure leaves the node unconfigured and exposes the existing model-selection recovery path.
- Generation failure removes the generating animation, unlocks editing, and exposes retry without discarding the node's prompt or inputs.
- Provider errors shown in the node must use the existing sanitized frontend error path and must not reveal credentials, authorization headers, or raw upstream payloads.
- If a node already has a saved model that later becomes unavailable, it is not silently replaced. The existing unavailable-model warning and explicit user selection behavior remain authoritative.

## Accessibility and Interaction

- Icon controls retain accessible names and tooltips.
- Disabled generation controls expose their disabled state semantically, not only visually.
- Status text is readable without relying on animation or color.
- Generation state changes use the existing non-disruptive status semantics; focus is not moved automatically.
- Popovers continue using shared menu surfaces and dismissal behavior.

## Automated Tests

### Default resolver

- Prefers eligible `gemini-omni-flash`.
- Falls back to the first sorted eligible model when Gemini is unavailable.
- Rejects models blocked by inactive status, invalid routes, missing confirmed capabilities, or missing exact pricing.
- Returns `null` when no eligible model exists.

### Node hydration

- Hydrates only a video node with no `modelId` after successful catalog loading.
- Does not overwrite an existing or user-selected model.
- Does not write during loading or catalog failure.
- Does not issue duplicate writes on equivalent catalog refreshes.
- Reuses normal model selection so route and parameters remain aligned.

### Composer layout

- Input mode and palette no longer render in the bottom action row.
- Input mode, camera movement, and palette render in the first row.
- Reference controls render in their own row only for reference-capable modes.
- Text-to-video renders no empty reference row.
- Long model names do not trigger incidental desktop bottom-row wrapping.
- The deliberate mobile grouping activates below 768 pixels.

### Generation feedback

- `pending`, `running`, and `waiting_provider` render the specified messages.
- Compatibility generating status also produces visible feedback at zero progress.
- Generation-sensitive controls are disabled while generating.
- Success replaces feedback with the video preview.
- Failure unlocks controls and exposes retry.
- Retry uses the normal generation handler.
- Reduced-motion mode does not run looping animation.

## Manual Acceptance

Verify in a real browser with:

- A newly created blank video node.
- Gemini, Sora, and Veo selections.
- Text-to-video and each supported reference-input mode.
- Viewport widths of 1440, 1024, 768, and 390 pixels.
- Canvas zoom values of 50%, 100%, and 150%.
- Generating nodes in selected and unselected states.
- The most crowded valid bottom row: long model display name, parameter summary, human review, estimated cost, and Generate action.
- Catalog loading, empty, and failure states.
- Generation success, provider wait, failure, and retry.

Acceptance requires all of the following:

1. New unconfigured nodes resolve to Gemini when it is fully usable, otherwise to the first fully usable sorted model.
2. Existing model choices are never overwritten.
3. Desktop and tablet bottom controls remain one row after any model selection.
4. Input mode and palette stay beside camera movement, while reference inputs use a dedicated conditional row.
5. Generation feedback appears immediately in the preview and stays visible when the node is unselected.
6. No fake percentage is shown, and reduced-motion preference is honored.
7. Success and failure transition cleanly to video preview or error/retry state.
8. Text-node and image-node editor dimensions and interactions remain unchanged.

## Validation

Implementation validation must include focused frontend tests and:

```bash
npm run build
```

Existing text-node and image-node editor regression tests must also run to confirm that the shared editor surface was not changed. Browser validation is required because the primary defect is responsive visual behavior.

## Rollout and Compatibility

No database migration or server environment change is required. Existing saved nodes keep their model selection. Unconfigured saved nodes receive the same default hydration as newly created nodes after the catalog loads. Rollback consists of reverting the frontend changes; no persisted schema conversion is involved.
