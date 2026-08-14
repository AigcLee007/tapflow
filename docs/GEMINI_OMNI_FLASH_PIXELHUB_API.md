# Gemini Omni Flash via PixelHub API

## Purpose

This document defines the provider request contract that TapFlow must use for
PixelHub model `gemini-omni-flash`.

The contract is based on controlled live calls performed on 2026-08-14. The
only request that preserved both the reference-image subject and the source
video motion/environment used these fields:

```json
{
  "image_urls": ["https://storage.example/reference.png"],
  "video_urls": ["https://storage.example/source.mp4"]
}
```

For this model, do not substitute `reference_videos` for `video_urls`.

## Endpoint And Authentication

Create a task:

```http
POST {PIXELHUB_BASE_URL}/v1/videos
Authorization: Bearer {PIXELHUB_API_KEY}
Content-Type: application/json
```

Poll a task:

```http
GET {PIXELHUB_BASE_URL}/v1/videos/{task_id}
Authorization: Bearer {PIXELHUB_API_KEY}
```

Keep the API key in CredentialVault. Never send it to the frontend or include
it in node data, drafts, logs, screenshots, or repository files.

## Verified Request Contract

### Text To Video

```json
{
  "model": "gemini-omni-flash",
  "prompt": "A continuous cinematic shot of a kitten walking through a sunlit room.",
  "aspect_ratio": "16:9",
  "duration": 4,
  "resolution": "720p"
}
```

### Image To Video

Always send the image list with `image_urls`, including when there is only one
image:

```json
{
  "model": "gemini-omni-flash",
  "prompt": "Animate the kitten naturally in a single continuous shot.",
  "aspect_ratio": "16:9",
  "duration": 4,
  "resolution": "720p",
  "image_urls": [
    "https://storage.example/reference.png"
  ]
}
```

### Image And Source Video

Use `image_urls` for subject/style images and `video_urls` for the source video:

```json
{
  "model": "gemini-omni-flash",
  "prompt": "Use the source video as the exact motion, camera, timing, lighting, and environment guide. Replace only the kitten in that video with the kitten from the reference image. Keep the replacement kitten visually faithful to the reference image. Preserve the original kitten actions, scene composition, background, and realism. Do not introduce new subjects, locations, or camera motion.",
  "aspect_ratio": "16:9",
  "duration": 4,
  "resolution": "720p",
  "image_urls": [
    "https://storage.example/reference.png"
  ],
  "video_urls": [
    "https://storage.example/source.mp4"
  ]
}
```

Do not send the same media under multiple aliases in one request. In
particular, do not add `reference_videos` alongside `video_urls`.

## Supported Values

| Field | Supported values | Notes |
| --- | --- | --- |
| `model` | `gemini-omni-flash` | Required. |
| `prompt` | Non-empty string | Required. English is the verified prompt language. |
| `aspect_ratio` | `16:9`, `9:16` | Required by TapFlow's structured contract. |
| `duration` | `4`, `6`, `8`, `10` | Seconds. |
| `resolution` | `720p`, `1080p` | Provider payload uses lowercase values. |
| `image_urls` | Array of HTTPS URLs | Up to five images according to the route capability. |
| `video_urls` | Array containing at most one HTTPS URL | Source video for the image-plus-video workflow. |

Gemini audio generation is implicit on this PixelHub route. TapFlow must not
send a user-controlled `generate_audio` value for this model.

## Media URL Requirements

- Use externally reachable HTTPS URLs.
- Do not send `data:`, `blob:`, localhost, or private-network URLs.
- The URL must remain valid while PixelHub fetches and starts the task.
- The object must return the correct media content type on GET.
- Canvas drafts retain only asset IDs. The Worker hydrates assets into
  short-lived signed URLs immediately before the provider call.
- Do not write signed URLs into provider summaries or application logs.

## Task Responses

Queued response:

```json
{
  "task_id": "task_xxx",
  "model": "gemini-omni",
  "status": "queued",
  "progress": 0,
  "created_at": 1786674191
}
```

PixelHub may return its internal model alias `gemini-omni`. Treat the selected
route and submitted `model` field as the product-model identity; do not reject
a task only because the response uses this alias.

Completed response:

```json
{
  "task_id": "provider_task_id",
  "model": "gemini-omni",
  "status": "completed",
  "progress": 100,
  "video_url": "https://provider.example/generated.mp4",
  "error": null
}
```

Poll every 12 seconds and retain the existing 30-minute provider deadline.
Persist a successful output as a tenant-owned asset before completing billing
settlement.

## Controlled Live Evidence

The following requests used the same prompt, image, video, duration, ratio,
and resolution. Only the field aliases changed.

| Image field | Video field | Observed result |
| --- | --- | --- |
| `image_url` | `reference_video` | Neither reference was followed. |
| `image_urls` | `reference_videos` | The image subject was followed; source-video motion/environment was not. |
| `image_urls` | `video_urls` | Both the image subject and source-video motion/environment were followed. |

This live evidence takes precedence over earlier generic alias assumptions for
the `gemini-omni-flash` route.

## TapFlow Adapter Repair

The repair belongs in:

```txt
packages/ai-gateway-core/src/pixelhub-video-adapter.ts
packages/ai-gateway-core/test/pixelhub-video-adapter.test.ts
```

The adapter mapping must be model-specific:

```ts
if (model === "gemini-omni-flash") {
  if (urls.image.length) body.image_urls = urls.image;
  if (urls.video.length) body.video_urls = urls.video;
} else if (model === "veo31-fast") {
  if (urls.image.length) body.image_urls = urls.image;
} else {
  if (urls.image.length) body.reference_image_urls = urls.image;
  if (urls.video.length) body.reference_videos = urls.video;
  // Keep Sora-specific audio mapping here.
}
```

Do not change Sora or Veo aliases as part of this repair.

## Required Regression Tests

The focused adapter tests must assert all of the following:

1. Gemini image plus source video serializes exactly to `image_urls` and
   `video_urls`.
2. The Gemini body does not contain `image_url`, `reference_image_urls`,
   `reference_video`, or `reference_videos`.
3. Gemini image-only mode continues to use `image_urls`.
4. Sora continues to use `reference_image_urls` and `reference_videos`.
5. Veo continues to use ordered `image_urls` only.
6. Provider summaries contain reference counts but no signed URLs, secrets, or
   Authorization headers.

Run at least:

```bash
npm run test --workspace @aigc-flow/ai-gateway-core -- pixelhub-video-adapter.test.ts
npm run build --workspace @aigc-flow/ai-gateway-core
npm run build
```

After deployment, run one controlled Gemini image-plus-video generation and
verify the output follows both references before treating the route as healthy.
