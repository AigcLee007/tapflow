# Prompt Plaza Responsive Masonry Design

## Goal

Improve Prompt Plaza image readability by replacing the five-column wide-desktop layout with a masonry layout driven by a minimum card width of approximately 340 px.

At the current 1600 px content width, the plaza must render four columns. As the available content area becomes narrower, the browser must reduce the column count instead of compressing cards.

## Current Problem

`PromptPlazaPage` currently uses fixed responsive column counts:

```txt
1 column -> 2 columns -> 3 columns -> 4 columns -> 5 columns
```

The `2xl` five-column state makes prompt images, titles, summaries, tags, and action controls too narrow on the production desktop layout. Portrait images and detailed posters are especially difficult to inspect.

## Chosen Direction

Use CSS multi-column masonry with an ideal/minimum column width of 340 px rather than a fixed maximum-desktop column count.

The content container remains capped at 1600 px. With the existing 12 px column gap, this produces:

- four columns at the current wide-desktop layout;
- three columns when the content area cannot preserve four readable cards;
- two columns on tablet-sized content areas;
- one column on phones.

The browser calculates the exact transition points from available width. The layout therefore remains usable if the application shell, side panels, or viewport width change later.

## UI Scope

Only the masonry column sizing changes.

The following remain unchanged:

- full image aspect ratios;
- card title, summary, tags, favorite, copy, and reference actions;
- prompt detail modal behavior;
- search, category, and view filters;
- lazy loading and WebP thumbnail cache behavior;
- prompt APIs and stored data.

The listing must not hide the prompt summary or introduce a separate compact card variant.

## Implementation Boundary

Update the masonry container in `src/prompts/PromptPlazaPage.tsx` to use a 340 px column-width rule while retaining the existing gap and `break-inside-avoid` item behavior.

Do not modify `PromptCard`, backend services, database schema, or media storage.

## Validation

Update `src/prompts/PromptPlazaPage.test.tsx` so the regression test verifies:

- the masonry container uses the 340 px adaptive column-width rule;
- the former `2xl:columns-5` rule is absent;
- items continue to use `break-inside-avoid`;
- the layout remains CSS multi-column masonry rather than a fixed-height grid.

Run the focused prompt plaza test and the production frontend build. Visually inspect a 1920 px desktop viewport and a mobile viewport to confirm four readable desktop columns and a single mobile column without overlap.

## Acceptance Criteria

- The production desktop layout shown in the reported screenshot displays four columns.
- Cards are not compressed below the selected readable width merely to add another column.
- Image proportions remain complete and unchanged.
- Existing prompt actions and filtering behavior continue to work.
- No API, migration, environment, or deployment configuration changes are required.
