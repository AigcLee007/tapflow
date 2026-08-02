# Text GPT White Icon Design

Date: 2026-08-02
Status: approved

## Goal

Make GPT/OpenAI logos legible as white marks in the dark text-model picker.

## Design

Keep the shared `openai-icon.svg` unchanged. Add a small text-picker-only style helper in `FlowNodes.tsx` that recognizes OpenAI/GPT logo keys and applies `brightness(0) invert(1)`. Merge that style into the existing menu logo and selected-model trigger logo styles.

Gemini and Claude logo styles remain unchanged. The helper affects presentation only; model keys, routes, selection, and catalog data are not changed.

## Validation

Extend the existing text-model picker rendering test. After opening the picker, assert every rendered OpenAI SVG image has the white filter, then run the focused test and production frontend build.
