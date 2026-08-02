# Text Node Default Terra Design

Date: 2026-08-02
Status: approved

## Goal

Configure newly created text nodes to use GPT-5.6-terra without changing
existing nodes or preventing later model selection.

## Design

`createFlowNode` is the single creation path used by the canvas store. For a
`text` node, it will initialize `modelId` with `gpt-5.6-terra` and `routeKey`
with `text.gpt-5-6-terra`. The values are product identifiers already
published by the Aittco text relay plugin, not upstream provider identifiers.

The node factory continues to merge explicit caller overrides after defaults,
so templates, imports, and user-selected values retain precedence. Existing
saved canvas nodes are not migrated or modified.

## Failure Behavior

The default is intentionally explicit rather than choosing the first loaded
catalog entry. If an administrator disables the Terra model or its route,
the normal text generation validation reports that no valid configured route
is available; it does not silently send a request through a different model.

## Validation

Add a node-factory regression test asserting new text nodes receive both
Terra identifiers and that explicit overrides win. Run the focused test and
the production build.
