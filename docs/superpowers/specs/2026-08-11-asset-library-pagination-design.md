# Asset Library Media Pagination Design

## Problem

The asset library requests only page 1 with a page size of 30 without sending a
media `kind`. The API therefore returns the newest 30 mixed assets. The client
then filters those 30 records by the selected media tab while the tab counts
come from a separate summary of the full library. This can show a count such as
125 images while rendering only the images present in the first mixed page.

## Selected Approach

Use server-side media filtering together with numbered server-side pagination.
Each media tab owns a logical result set, and each page contains at most 30
assets of that media kind.

Alternatives considered:

- Increasing `pageSize` would only postpone the bug and would exceed the API's
  maximum once a library grows past 100 assets.
- Paginating the mixed result set would make image and video pages contain
  unpredictable item counts and would not match the counts displayed on tabs.
- Loading every page automatically would increase signed URL generation,
  network traffic, and initial rendering cost.

Server-side media pagination matches the user's mental model and uses the
existing API contract.

## Data Flow

`useAssetLibrary` will send these list parameters:

```ts
{
  favorite,
  folderId,
  includePreviewUrls: true,
  kind: selectedMediaTab,
  page,
  pageSize: 30,
  previewExpiresInSeconds: 900,
  query,
}
```

The selected tab is always one of `image`, `video`, or `audio`, so the list
request always includes `kind`. The API already applies `kind` before its count,
ordering, `LIMIT`, and `OFFSET`, so its returned `total` is the total for the
selected media result set.

The hook will expose `page`, `pageSize`, `total`, `totalPages`, and `setPage`.
The page result replaces the current asset array rather than appending to it.
The existing request sequence guard continues to prevent stale responses from
overwriting a newer tab, filter, or page selection.

## State Transitions

- Selecting another media tab resets the page to 1 and requests that kind.
- Changing the search query resets the page to 1.
- Selecting a folder or changing the favorite filter resets the page to 1.
- Refresh keeps the current valid page.
- Deleting the last item on a page refreshes the previous page when the current
  page is no longer valid.
- Auth identity changes continue to isolate cached asset results.

The session cache key includes media kind and page, preventing one tab or page
from displaying another tab or page's cached items.

## Pagination UI

A compact pagination row appears below the asset grid only when `totalPages` is
greater than 1. It contains:

- A previous-page icon button, disabled on page 1.
- Numbered page buttons with the current page visibly selected.
- A next-page icon button, disabled on the last page.
- A compact `current / total pages` status for accessibility and narrow screens.

Changing pages scrolls the asset library heading into view so the next page is
not opened at the bottom of the previous grid. Buttons use Lucide chevrons,
stable 36 px dimensions, visible focus styles, and accessible labels. The
numbered range stays bounded when the library has many pages and uses ellipses
between the first, nearby, and last page numbers.

## Error And Loading Behavior

Changing pages uses the existing loading state and skeleton. If a request
fails, the existing error surface is shown and the selected page remains
available for retry through refresh or another page selection. Disabled
pagination buttons cannot issue invalid page requests.

## Files

- `src/assets/useAssetLibrary.ts`: media-kind query, page transitions, derived
  total pages, cache isolation, and page correction.
- `src/assets/AssetLibraryPage.tsx`: pagination controls and page-change scroll.
- `src/assets/useAssetLibrary.test.tsx`: hook request and transition coverage.
- `src/assets/AssetLibraryPage.test.tsx`: rendered pagination behavior.
- `PROJECT_RECORD.md`: completed product change and validation record.

No backend or database change is required because `/api/v2/assets` already
supports the needed filters and offset pagination.

## Acceptance Criteria

- The image tab requests `kind=image&page=1&pageSize=30` and displays up to 30
  images from the complete image result set.
- With 125 images, the pagination reports 5 pages and page 5 can display the
  remaining 5 images.
- The video and audio tabs paginate their own result sets independently.
- Page controls request the selected page and replace the previous page's
  cards.
- Tab, search, folder, and favorite changes reset to page 1.
- Previous and next controls are disabled at their boundaries.
- Stale responses cannot overwrite the active tab or page.
- Focused frontend tests and `npm run build` pass.
