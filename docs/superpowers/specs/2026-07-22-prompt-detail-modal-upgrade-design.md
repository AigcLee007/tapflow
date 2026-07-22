# Prompt Detail Modal Upgrade Design

Date: 2026-07-22
Status: Approved for implementation

## Summary

Replace the standalone prompt detail page and its fixed four-slot square gallery with a prompt detail modal opened over the existing prompt plaza. The modal keeps `/prompts/:promptId` as a shareable URL while preserving the plaza's search, filters, loaded cards, and scroll position behind it.

Prompt catalog entries usually contain one effect image. The upgraded media viewer therefore optimizes for one image and adapts only when additional real media exists. It never creates empty gallery slots.

## User Flow And URL Behavior

- Clicking a prompt card keeps the prompt plaza mounted and pushes `/prompts/:promptId` with the current query, category, and view parameters.
- The corresponding detail modal opens over the plaza.
- Closing with the close icon, backdrop, or Escape returns to the same plaza state and restores focus to the originating card.
- Browser Back closes a modal opened from the plaza before navigating away from the plaza.
- Directly opening or refreshing `/prompts/:promptId` loads the plaza as the background and opens the requested modal. Closing a direct-link modal replaces the URL with `/prompts` plus preserved filters.
- Opening the project picker places it above the detail modal. Cancelling the picker returns to the detail modal; selecting a project continues the existing prompt-reference flow.

The prompt route family must render one stable `PromptPlazaPage` instance for both `/prompts` and `/prompts/:promptId`. The route transition key must also normalize prompt paths to `/prompts` so changing only the selected prompt does not remount the plaza.

## Desktop Modal Layout

The modal uses the current dark TapFlow workbench visual language:

- centered shell with a maximum width near 1280px and a maximum height near 92vh;
- restrained radius of 8px or less;
- dark translucent backdrop with light blur;
- sticky header containing title, `官方精选 · 分类`, tags, favorite action, and an icon-only close action;
- body split approximately `62% / 38%` between media and prompt information;
- prompt information includes description, full main prompt, optional negative prompt, feedback, and the existing actions;
- `引用到画布` remains the primary action, `复制提示词` remains secondary, and favorite remains an icon action.

The modal content can scroll vertically. The right action area remains reachable while long media or prompt text is read.

## Media Viewer

The viewer displays real media only:

- one image: one full-width main image and no thumbnail rail;
- two to four images: first image is selected initially, and one thumbnail per real image appears below the main image;
- selecting a thumbnail changes the main image without refetching the prompt;
- loaded images render at `width: 100%` and `height: auto` with their complete intrinsic aspect ratio;
- no `object-cover`, square crop, maximum-height crop, or synthetic placeholder slot is used for loaded media;
- unusually tall images remain complete and are reached through modal scrolling;
- clicking the main image opens an image-only zoom preview;
- closing the zoom preview returns to the same selected media item.

If the prompt has no readable media, the viewer shows one explicit `暂无效果图` state. If an individual media request fails, its thumbnail and selected main state show `图片加载失败`; the UI does not create additional missing slots.

## Mobile Layout

At narrow widths the modal becomes a full-screen sheet:

- one vertical column with image first and prompt information second;
- title and close action remain in a sticky top bar;
- copy and reference actions remain in a sticky bottom action bar;
- images retain their intrinsic ratio and never cause horizontal overflow;
- thumbnail rail scrolls horizontally when more than one image exists.

## Component Boundaries

### `PromptPlazaPage`

- owns list search, filters, loaded card media, scroll state, and the originating card focus target;
- receives the selected `promptId` from the current route;
- opens and closes the modal by updating browser history;
- keeps the project picker and detail modal ordering coherent.

### `PromptDetailModal`

- fetches one prompt by id;
- loads and releases authenticated prompt-media object URLs;
- owns selected media, zoom state, favorite state, copy feedback, and project-picker visibility;
- renders loading, missing, unpublished, and media-error states without replacing the plaza.

### Routing

`AppRouter` maps both prompt paths to `PromptPlazaPage` and supplies an optional detail id. Other product routes retain their existing transition behavior.

## Accessibility And Dismissal

- modal shell uses `role="dialog"`, `aria-modal="true"`, and a title relationship;
- opening the modal moves focus into it and locks background scrolling;
- Tab and Shift+Tab remain inside the active modal layer;
- Escape closes the topmost layer first: image zoom, then project picker, then prompt detail;
- backdrop click closes only when the backdrop itself is clicked;
- closing restores focus to the prompt card that opened the modal when it still exists;
- icon-only favorite, close, and image-zoom controls have accessible labels and tooltips.

## Loading And Error States

- detail loading uses a modal-local skeleton while the plaza remains visible;
- missing, archived, or unpublished prompts show an error panel with a close action inside the modal;
- a failed image request does not hide prompt text or actions;
- favorite updates remain optimistic and roll back on API failure;
- clipboard failures retain selectable prompt text and show the existing manual-copy feedback;
- project-reference behavior and request idempotency remain unchanged.

## Scope Boundaries

This upgrade changes only prompt discovery detail presentation and routing. It does not change:

- prompt database schema, API contracts, media storage, upload limits, or publishing rules;
- prompt copy, favorite, interaction recording, or project-reference semantics;
- canvas prompt panel behavior;
- prompt plaza masonry card layout.

No production dependency, migration, API endpoint, or environment variable is required.

## Verification

Focused tests must prove:

- one media item produces one main image and no thumbnail rail or empty gallery slots;
- multiple media items produce an exact thumbnail count and can switch the selected main image;
- loaded media uses intrinsic sizing without fixed-square or cover cropping;
- opening, direct linking, Back, close, query preservation, and stable plaza mounting work as designed;
- modal loading and prompt/media failures remain local to the modal;
- Escape/backdrop dismissal, focus restoration, scroll lock, and dialog semantics work;
- copy, favorite, project picker, and reference actions retain their existing behavior;
- desktop and mobile class contracts preserve the intended split and sticky actions.

Run focused prompt tests, `npm run build`, and browser visual checks at desktop and narrow viewports using one-image and multi-image prompts. Verify no synthetic empty cells, image clipping, overlap, horizontal overflow, inaccessible controls, or console errors.
