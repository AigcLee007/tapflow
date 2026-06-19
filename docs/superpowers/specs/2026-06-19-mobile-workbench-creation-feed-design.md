# Mobile Workbench Creation Feed Design

## Goal

Rebuild the phone-width `/workbench` middle content into a single creation feed inspired by the provided reference image, while keeping the current mobile top navigation and bottom creation bar unchanged.

## Scope

This change applies only to the mobile workbench layout (`<768px`). Desktop workbench, backend generation flow, billing, temporary reference uploads, result polling, asset persistence, model catalog, and the existing mobile parameter sheet remain unchanged.

## Layout

The mobile shell keeps the current three-zone structure:

1. Fixed top header
   - Keep the current back button, brand/title block, and credit balance.
   - Do not add the reference image's top filter/folder icons in this pass.

2. Scrollable creation feed
   - Remove the current large "Current" stage card from the top of the mobile scroll area.
   - Remove separate "Current Tasks" and "Completed" section headers.
   - Render one chronological feed containing active, completed, failed, and canceled generations together.
   - Sort oldest to newest so the latest task appears closest to the bottom input bar, matching the reference image's "newest at bottom" behavior.

3. Fixed bottom creation bar
   - Keep the existing bottom creation bar behavior and visual direction.
   - Tapping it still opens the existing mobile parameter sheet.
   - The parameter sheet UI is not redesigned in this task.

## Feed Card Structure

Each generation renders as a compact task card with this order:

1. Type label
   - Display `图片生成`.
   - Use muted small text.

2. Prompt row
   - Show the generation prompt as the primary text.
   - Clamp to two lines.
   - Empty prompts fall back to `未命名创作`.

3. Parameter row
   - Show creator-facing parameters, not raw backend route keys.
   - Format: `模型名称 · 线路名称 · 比例 · 尺寸`.
   - Example: `Nano Banana Pro · 线路一 · 9:16 · 2K`.
   - Keep text compact, single-line, horizontally scroll or truncate if needed.

4. Batch image strip
   - Render a horizontal strip with one fixed cell per requested output.
   - Cell count is `max(requestedCount, results.length, batch.totalCount)`.
   - Completed cells show image thumbnails immediately.
   - Pending/running cells show a soft blurred placeholder skeleton.
   - Failed cells show a failed placeholder.
   - The strip should fit the phone width with four visible columns when possible, as in the reference.

5. Status footer
   - Show a compact status sentence:
     - Active batch: `共4张，正在生成第2张...`
     - Partial batch: `共4张，已完成2张，正在生成2张...`
     - Completed: `共4张，已完成`
     - Failed: `生成失败`
   - Use the generation's batch summary when present; otherwise derive counts from `requestedCount`, `results.length`, and status.

6. More menu
   - Keep the existing per-card more menu actions:
     - download original
     - use as reference
     - delete record
   - The menu acts on the first available result unless the user taps a specific image first.

## Image Interaction

- Tapping an image opens the existing fullscreen result preview.
- Tapping an empty pending placeholder does nothing.
- Multi-image results no longer require selecting a thumbnail before opening; each completed cell can open its own result directly.
- The result preview keeps the current batch navigation behavior.

## Data Rules

- Feed sorting uses `createdAt` ascending.
- Result ordering uses `sortOrder` ascending where available, then array order.
- Batch children use `batchIndex` ascending.
- The card must display partial results as soon as they exist.
- A generation with `requestedCount: 4` and only two available results still renders four cells: two thumbnails and two placeholders.
- A generation without `batch` still derives total cells from `requestedCount`.

## Component Plan

Modify existing mobile workbench components instead of creating a separate product path:

- `src/workbench/WorkbenchMobileShell.tsx`
  - Remove the top current-stage section from the scroll area.
  - Pass all generations into the feed.
  - Keep selected result state for fullscreen preview compatibility.

- `src/workbench/WorkbenchMobileResultFeed.tsx`
  - Change from active/completed grouped sections to one sorted feed.
  - Render an empty state only when there are no generations.

- `src/workbench/WorkbenchMobileResultCard.tsx`
  - Rebuild the visual structure around prompt, parameter row, batch strip, and footer.
  - Derive cell slots from generation and results.
  - Keep the existing action menu, adapted to the compact card.

- `src/workbench/WorkbenchPage.test.tsx`
  - Add regressions for:
    - top header remains present;
    - current-stage card no longer renders on mobile;
    - feed is a single chronological list;
    - latest task appears last;
    - partial batch renders completed thumbnails and pending placeholders;
    - active/completed section headers are absent.

## Acceptance Criteria

- On mobile width, `/workbench` shows the existing top header and bottom creation bar.
- The middle content is a single task feed with latest task at the bottom.
- There is no separate current-result large card above the feed.
- A four-image active generation appears immediately with four cells, including placeholders for unfinished images.
- Completed images in the same batch appear as soon as they exist.
- The page scrolls normally without content being blocked by the fixed bottom bar.
- Existing generation, reference, download, delete, fullscreen preview, and parameter sheet flows still work.

## Out Of Scope

- Desktop layout changes.
- New top filter/folder icons.
- Backend API changes.
- Parameter sheet redesign.
- Changing the bottom creation bar beyond spacing needed to avoid overlap.
