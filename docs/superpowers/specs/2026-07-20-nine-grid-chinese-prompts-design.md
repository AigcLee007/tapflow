# Nine-grid Chinese prompts design

## Goal

Convert the nine image-template tool prompts shown in the canvas confirmation editor from English natural-language instructions to clear Chinese instructions, while preserving technical tokens that carry stable shot, timing, grid, and runtime semantics.

## Scope

- Translate the natural-language content of all nine `promptTemplate` values in `FLOW_IMAGE_TEMPLATE_EDIT_ACTIONS`.
- Change the appended user-content heading from `User prompt:` to `用户补充要求：`.
- Preserve template keys, modes, labels, descriptions, title prefixes, aspect-ratio policies, ordering, and prompt composition behavior.
- Preserve model, route, parameter inheritance, node preparation, workflow submission, billing, and backend behavior.

## Translation rules

Use concise production-oriented Chinese rather than word-for-word machine translation. Each template must continue to express every existing positive requirement, prohibition, continuity constraint, layout requirement, and output-format constraint.

Keep the following technical tokens unchanged where they occur:

- Grid and ratio notation such as `2x2`, `3x3`, `5x5`, `3:2`, and `16:9`.
- Keyframe labels and timing such as `KF1`, `KF2`, and `3s`.
- Shot abbreviations such as `ELS`, `LS`, `MLS`, `MS`, `MCU`, `CU`, `ECU`, and `OTS`.
- Interface and production abbreviations such as `UI`.

English descriptive text attached to a technical token should be translated. For example, `[KF1 | 3s | ELS] extreme long shot / full environment` becomes `[KF1 | 3s | ELS] 大远景 / 完整环境`.

## Prompt composition

`buildImageTemplateEditPrompt` continues to return the selected template text unchanged when no user text is supplied. When user text is supplied, append it after a blank line using this format:

```text
用户补充要求：
<用户内容>
```

No runtime translation, language detection, bilingual duplication, or provider-specific prompt branching is introduced.

## Tests

Update focused utility tests before implementation to prove:

- All nine prompt templates contain Chinese natural-language instructions.
- No template retains the English section heading `Output requirements:`.
- The multi-camera prompt preserves `3x3`, `KF1`, `ELS`, and the required nine-shot structure.
- The 25-grid prompt preserves `5x5` and `OTS`.
- Appended user text uses `用户补充要求：` and no longer uses `User prompt:`.
- Existing aspect-ratio and mode behavior remains unchanged.

Run the focused prompt utility test and `npm run build`. Update `PROJECT_RECORD.md` after successful implementation and verification.

## Acceptance criteria

- Selecting any of the nine tools opens a confirmation node whose preset prompt is readable Chinese.
- Every existing instruction and prohibition remains represented in the Chinese prompt.
- Stable technical tokens remain unchanged.
- User-added text appears under the Chinese heading.
- Template identities, ratios, parameters, node preparation, and generation behavior do not change.
