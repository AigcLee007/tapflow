# Reference Video Status Refresh Fix

Date: 2026-08-15

## Problem

The canvas stores an initial `referenceVideoVariantStatus` value on a video input. When that value is `pending`, `useCanvasInputAssets` currently prefers the stored input value over the latest asset metadata returned by polling. As a result, a server transition from `pending` to `ready` or `failed` never reaches generation preflight and the UI can remain blocked indefinitely.

## Design

Keep the existing upload, Worker queue, FFmpeg processing, and two-second asset polling flow unchanged. Change only the final input projection so that a valid status from freshly resolved asset metadata takes precedence over the status snapshot already present on the canvas input. The input snapshot remains a fallback when metadata resolution has not completed or fails.

State behavior:

- `pending -> ready`: stop status polling, clear the processing blocker, and allow H3video generation.
- `pending -> failed`: stop status polling and show the existing re-upload message.
- metadata unavailable: retain the input snapshot so the UI remains fail-closed.
- compliant videos: preserve the current immediate-generation behavior.

No compression setting or resolution selector is added.

## Testing

Add a hook regression test with an input snapshot set to `pending` while the asset API returns `ready`. The resolved canvas input must expose `ready`. Keep the existing pending, failed, compliant-video, and polling tests unchanged, then run the focused frontend tests and production build.

## Scope

This fix does not change the backend transcoding implementation, queue configuration, billing behavior, persisted asset schema, or H3video resolution constraints.
