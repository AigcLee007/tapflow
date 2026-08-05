# Video Composer Capsule Density Design

## Goal

Align the video node editor with the established image node editor while preserving video-specific controls. Compact value controls must size to their content instead of expanding into empty space.

## Scope

### In scope

- Video composer shell hierarchy and control density.
- Model and parameter capsule sizing, typography, colors, and states.
- Desktop, tablet, and mobile footer layout.
- Model-specific parameter summaries and fixed-value omission rules.
- Generate action and generation/disabled states.
- Focused component and browser smoke coverage.

### Out of scope

- Text node or image node editor dimensions, anchors, zoom behavior, or styling.
- Video model capabilities, pricing, route keys, credentials, backend APIs, or billing behavior.
- Upload/replace behavior after a video is ready.

## Layout Contract

The video editor keeps the image editor's three-zone structure:

1. Top tool row: input mode, camera movement, and palette.
2. Conditional reference row: shown only for modes consuming reference media.
3. Prompt area followed by the execution row: model, compact parameters, cost, and generate.

The execution row uses content-sized controls. The only flexible space is between the settings group and the cost/action group. The model and parameter controls must never use `flex: 1` or `width: 100%` as their normal desktop sizing.

## Capsule Tokens

### Value capsules

- Height: `40px`.
- Radius: `999px`.
- Horizontal padding: `12px`.
- Primary label: `12px`, weight `700`, line-height `1.1`.
- Secondary route label: `11px`, weight `500`, color `rgba(255,255,255,0.52)`.
- Border: `1px solid rgba(255,255,255,0.14)`.
- Model background: `#111216`.
- Parameter background: `#303036`.
- Hover background: model `#1d1f24`, parameter `#383840`.
- Focus ring: sky border with a visible 2px outline offset.
- Disabled state: `opacity: 0.45`, `cursor: not-allowed`.

### Model capsule

- `width: max-content`, with `max-width: 230px`.
- Model name and route display inline as `Model Name · 线路一`.
- Long labels truncate with `text-overflow: ellipsis`; the full label is available through `title` and the menu.
- Provider/vendor names are not shown to creators.

### Parameter capsule

- `width: max-content`, with `max-width: 320px` on desktop and `180px` on mobile.
- Summary order: aspect ratio, resolution, duration, then supported audio indicator.
- Fixed values are omitted: count is omitted when it is always `1`; audio is an icon-only non-interactive indicator when the model always generates audio.
- The button opens the existing parameter panel; the capsule itself does not expose disabled controls as interactive children.

### Generate action

- `40px x 40px` circular button, using the established light-blue video action color.
- Icon-only at rest, with an accessible label and tooltip `生成视频`.
- Generating uses a loader icon and disables request-changing controls.
- Failure uses the existing retry flow and does not restore upload/replace controls.

## Responsive Behavior

- At `>= 768px`, the execution row has two groups on one line: content-sized settings on the left and cost/action on the right.
- At `< 768px`, the execution row has exactly two intentional rows: model/parameters, then cost/generate.
- No capsule may overflow the editor or viewport. Long labels truncate within the capsule.
- The editor surface remains zoom-stable through `NodeEditorSurface`; text and image variants retain their current density values.

## State Behavior

- Text-to-video has no empty reference row.
- Reference modes show the reference row and disable mutations during generation.
- Catalog loading, catalog errors, or blocked models disable Generate fail-closed while preserving model-menu retry access where applicable.
- A generation transition immediately shows the existing submitting/generating preview feedback. Feedback remains visible if the node is unselected.
- Reduced-motion users receive a static indicator with no looping animation.

## Acceptance Criteria

- No blank flex-expanded region appears inside the parameter capsule.
- Model and parameter capsules resize when their content changes.
- Desktop and tablet screenshots show a single compact execution row; mobile shows two deliberate groups.
- Model labels are creator-facing, truncated safely, and never expose provider secrets.
- Existing image/text editor size and zoom regression tests remain unchanged and pass.
- Focused tests cover capsule geometry classes, disabled mutation behavior, and responsive browser smoke at 1440, 1024, 768, and 390 pixels.
