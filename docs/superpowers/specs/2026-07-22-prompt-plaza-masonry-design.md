# Prompt Plaza Masonry Layout Design

Date: 2026-07-22
Status: Approved design

## Summary

Change the prompt plaza list from a fixed-ratio grid to a Pinterest-style masonry layout. Prompt effect images must retain their complete original aspect ratio, including unusually tall poster images, instead of being cropped into a fixed `4:3` frame.

This change is limited to the standalone prompt plaza list. Prompt copy, favorite, reference, search, filtering, detail navigation, and media storage behavior remain unchanged.

## Layout

Use native CSS multi-column layout for the prompt list:

- one column on phones;
- two columns from the small breakpoint;
- three columns from the large breakpoint;
- four columns from the extra-large breakpoint;
- five columns on very wide screens;
- 12px horizontal and vertical spacing between cards.

Cards flow from top to bottom within a column and then continue in the next column. Each card must avoid breaking across columns.

CSS multi-column layout is preferred over JavaScript measurement or a new masonry dependency because it automatically reacts to authenticated image blob loading, preserves natural card heights, and keeps this UI-only change small.

## Card Media

The full prompt-plaza card must:

- render its effect image at `width: 100%` and `height: auto`;
- preserve the image's intrinsic aspect ratio;
- avoid `object-cover` and any fixed aspect-ratio wrapper;
- show extremely tall images in full without a maximum-height crop;
- keep the category badge overlaid at the top-left of the image;
- keep the title, description, tags, favorite, copy, and reference actions below the image.

When an image is unavailable, the existing visual placeholder keeps a stable `4:3` frame so the missing-media state remains legible.

The compact card used inside the canvas prompt panel keeps its existing fixed `4:3` cover. This prevents an unusually tall catalog image from consuming the entire narrow canvas panel.

## Scope Boundaries

The following are unchanged:

- prompt detail page gallery;
- prompt API and local-server media storage;
- image upload and publishing workflow;
- card action hierarchy and event tracking;
- pagination, search, categories, favorites, and reference behavior.

No new production dependency, database migration, API endpoint, or environment variable is required.

## Loading And Responsive Behavior

Prompt media continues to load through authenticated blob requests. As images resolve, the browser recalculates column heights without application-side height measurement.

Cards remain keyboard accessible and retain their existing buttons. Layout changes must not alter action hit targets or cause a card to split between columns.

## Verification

Add focused regression coverage that proves:

- the plaza result container uses responsive multi-column classes rather than grid column classes;
- full cards render loaded images with intrinsic height and without fixed-ratio cropping;
- compact cards retain the fixed-ratio cover behavior;
- favorite, copy, and reference remain separate actions.

Run the focused prompt tests, the production frontend build, and a browser visual check at desktop and narrow viewport widths. The browser check must include both portrait and landscape media and confirm there is no clipping, overlap, or horizontal overflow.
