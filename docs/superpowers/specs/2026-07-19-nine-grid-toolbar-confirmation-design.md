# Nine-grid toolbar and confirmation flow design

## Goal

Move the image nine-grid template tools out of the More menu and expose them as a standalone action in the selected image node's top toolbar. Choosing a template must prepare an editable downstream image node and must not start generation until the user confirms the model and parameters and clicks the generate button.

## Scope

- Applies to all entries in `FLOW_IMAGE_TEMPLATE_EDIT_ACTIONS`.
- Applies to the floating toolbar shown for a selected image node with an available image.
- Reuses the existing image prompt editor, model/route picker, parameter controls, quantity control, and generate button.
- Preserves the existing source-to-derived-node canvas relationship.
- Does not change template prompts, template labels, billing behavior, workflow execution, or backend APIs.

## Toolbar and menus

Add a standalone `Grid3X3` button immediately before the More button in the selected image node toolbar. The button uses the same dimensions, tooltip behavior, active styling, menu positioning, z-index, and dismissible-layer behavior as the other image toolbar actions.

Clicking the standalone button opens the template action list directly. The More menu no longer contains the Nine-grid Tools row or its nested template panel. Quick Split remains in the More menu because it is a local image split operation, not an AI template generation action.

Opening the nine-grid menu closes the More menu and other mutually exclusive toolbar menus. Clicking outside, pressing Escape, selecting a template, or switching the active toolbar menu closes it.

## Template preparation flow

Template selection performs a preparation operation with the following behavior:

1. Validate that the source image has a workflow-usable asset reference.
2. Resolve the selected template prompt, output aspect ratio, title, model, route, and source parameters using the current template helpers.
3. Create a downstream image node and connect the source node to it.
4. Store the template metadata needed by the normal image generation path.
5. Leave the node idle and editable. Do not mark it `running` or `generating`, do not set progress to a running value, and do not call `runBackendWorkflow`.
6. Select the new node so its existing image prompt editor opens immediately.

The prepared node inherits the source image node's current model, route, size, and compatible parameters. Template-specific aspect-ratio rules still override the inherited ratio where required. The prompt editor contains the resolved template prompt and the source image is available through the upstream connection.

## Submission flow

The user can review and modify the prompt, model, route, aspect ratio, size, quality, quantity, and any model-specific parameters supported by the existing image editor. Generation starts only when the user clicks the existing generate button on the prepared node.

That click uses the normal image-node generation path, including validation, pricing, billing reservation, workflow launch, status updates, persistence, and error handling. No second template-specific submission path is introduced.

## Code boundaries

- Add a focused nine-grid template menu component rather than retaining hidden panel state inside `ImageMoreMenu`.
- Keep `ImageMoreMenu` responsible only for More-menu actions.
- Introduce a preparation-oriented graph helper with a name that does not imply execution. Do not overload `runImageTemplateEdit` with an `autoStart` flag.
- Reuse template prompt and aspect-ratio helpers from `imageTemplateEditActions.ts`.
- Keep selection and toolbar-layer coordination in the image node UI where those concerns already live.

## Error handling

If the source node has no backend-usable asset, show the existing error message on the source node and create no downstream node. A preparation failure must not launch a workflow or leave a node in a generating state.

If manual submission later fails validation or launch, the prepared node follows the existing image generation error behavior and remains editable for retry.

## Tests

Add focused regression tests before implementation:

- The More menu no longer renders Nine-grid Tools.
- The standalone nine-grid menu renders all template actions and emits the selected key.
- The toolbar exposes the standalone nine-grid button and coordinates mutually exclusive menus.
- Preparing a template creates and connects a downstream image node with the resolved prompt and inherited model/route/parameters.
- A prepared node is idle, has no running progress, and does not trigger backend workflow submission.
- The new downstream node becomes selected so the existing confirmation editor is displayed.
- Missing source assets produce the existing validation error without creating a node.

Run the focused tests, the broader relevant frontend/runtime tests, and `npm run build`. Update `PROJECT_RECORD.md` after implementation and verification.

## Acceptance criteria

- Nine-grid Tools is absent from More and visible as a standalone selected-image toolbar action.
- Selecting any nine-grid template opens a newly selected downstream image node with the confirmation editor visible.
- The node inherits the source model, route, and compatible parameters, with template ratio rules applied.
- No workflow or billing action begins before the user clicks generate.
- Manual generation uses the existing image generation workflow and status handling.
- Menu density, dismissal, and z-index remain consistent with shared image menu rules.
