# PixelHub Video Models Integration Design

Date: 2026-08-03
Status: Approved design
Scope: `gemini-omni-flash`, `sora-v3-pro`, and `veo31-fast` in the authenticated v2 Flow canvas

Amended 2026-08-14: controlled PixelHub calls superseded the original Gemini
field aliases in this design. Gemini images use `image_urls` and its source
video uses `video_urls`; see `docs/GEMINI_OMNI_FLASH_PIXELHUB_API.md`. Sora and
Veo mappings are unchanged.

## 1. Objective

Integrate three PixelHub asynchronous video models into the existing v2 video generation node. Each product model must expose only the ratios, resolutions, durations, input modes, reference-media slots, audio behavior, and price that the selected upstream model supports.

The integration must preserve the existing v2 boundaries:

- product model selection is catalog-driven;
- route selection is stable and server-resolved;
- provider credentials stay in CredentialVault;
- canvas drafts store asset IDs or upstream node IDs, never media URLs or bytes;
- billing reserves before enqueue, settles on success, and refunds on failure;
- completed provider media is copied into TapFlow object storage and persisted as an `assets` record.

The source provider contract is `pixelhub_video.md`, supplied outside this repository. Its public endpoints are:

- create: `POST /v1/videos`;
- poll: `GET /v1/videos/{task_id}`;
- statuses: `queued`, `in_progress`, `completed`, and `failed`;
- completed output: `video_url`.

## 2. Non-Goals

This design does not:

- integrate the other PixelHub models listed in the provider document;
- add batch video generation; all three initial models generate exactly one result;
- expose PixelHub or provider credentials to canvas users;
- add undocumented PixelHub fields for camera motion, visual tone, start frame, or end frame;
- change the existing video-editor export route;
- introduce browser-local authoritative media or draft persistence;
- implement a generic provider-script engine.

Existing `cameraMotionId` and `visualTone` values remain TapFlow node metadata. This integration does not send them as undocumented PixelHub request fields.

## 3. Selected Architecture

Use one reusable provider connection, three product models, three stable routes, and one dedicated provider adapter.

| Concern | Decision |
| --- | --- |
| Provider key | `pixelhub` |
| Adapter kind | `pixelhub-video` |
| Credential | one server-side Bearer API key in CredentialVault |
| Base URL | configured in Provider Connections; not hard-coded from the example domain |
| API mode | asynchronous |
| Create path | `/v1/videos` |
| Poll path | `/v1/videos/{task_id}` |

The three stable routes are:

| Product model | Upstream model | Model family | Route key | User-facing route label |
| --- | --- | --- | --- | --- |
| Gemini Omni Flash | `gemini-omni-flash` | `pixelhub-gemini-omni-flash` | `video.pixelhub.gemini-omni-flash` | `线路一` |
| Sora V3 Pro | `sora-v3-pro` | `pixelhub-sora-v3-pro` | `video.pixelhub.sora-v3-pro` | `线路一` |
| Veo 3.1 Fast | `veo31-fast` | `pixelhub-veo31-fast` | `video.pixelhub.veo31-fast` | `线路一` |

The model families are deliberately distinct because the current model catalog selects one model per family. Product model names are visible in the canvas; provider identity and upstream model configuration remain admin-only.

### Rejected alternatives

Extending the OpenAI-compatible adapter is rejected because PixelHub video creation and polling have provider-specific fields, reference aliases, states, and output handling. Calling PixelHub directly from the workflow service is rejected because it would bypass the AI Gateway route, credential, logging, testing, and provider boundaries.

## 4. Current Gaps

The Phase 1 video node already has model, mode, ratio, resolution, duration, audio, count, and role-oriented reference UI. The following gaps must be closed for this integration:

- `buildVideoRequest()` does not currently include `params.videoGeneration`;
- selecting a model updates `modelId` but does not update its concrete `routeKey`;
- catalog UUID `modelId` can currently fall through as an upstream model value;
- duration capability supports only min/max/step and cannot express discrete values;
- reference limits are not represented per image, video, audio, or total count;
- reference assets are currently built as `kind: "image"` regardless of actual media;
- the picker and direct-upload callback do not yet provide complete video/audio reference support;
- the current role map cannot represent nine images plus repeated video/audio references;
- real video generation is implemented only by the mock adapter;
- video pricing currently uses quantity `1` and does not multiply by selected duration.

## 5. Model Capability Matrix

| Capability | Gemini Omni Flash | Sora V3 Pro | Veo 3.1 Fast |
| --- | --- | --- | --- |
| Ratios | `16:9`, `9:16` | `21:9`, `16:9`, `4:3`, `1:1`, `3:4`, `9:16` | `16:9`, `9:16` |
| Default ratio | `16:9` | `16:9` | `16:9` |
| Resolutions | `720P`, `1080P` | fixed `720P` | `720P`, `1080P` |
| Default resolution | `720P` | `720P` | `1080P` |
| Durations | `4`, `6`, `8`, `10` seconds | every integer from `4` through `15` | `4`, `6`, `8` seconds |
| Default duration | `4` seconds | `4` seconds | `4` seconds |
| Output count | fixed `1` | fixed `1` | fixed `1` |
| Generated audio | fixed on, implicit | toggle, default on | fixed on, implicit |
| Audio request field | omit | send explicit boolean | omit |
| Prompt limit | no provider-specific limit declared | final provider prompt at most 2500 characters | no provider-specific limit declared |
| Reference images | at most 5 | at most 9 | at most 2 frame images |
| Reference videos | at most 1 source video | at most 3 | unsupported |
| Reference audios | unsupported | at most 3 | unsupported |
| Total references | at most 6 by per-kind limits | at most 12 | at most 2 |
| Base price | 1 credit/second | 10 credits/second | 0.5 credit/second |

Resolution does not change price in this release.

## 6. Input Mode Contract

The five mode options describe how the model interprets inputs. They are not quality settings.

| Internal mode | UI label | Input meaning |
| --- | --- | --- |
| `text_to_video` | 文生视频 | prompt only |
| `image_to_video` | 图生视频 | one main image plus prompt |
| `image_reference` | 图片参考 | multiple images jointly constrain subject, scene, props, clothing, or style |
| `first_last_frame` | 首尾帧 | ordered first-frame and last-frame images plus prompt |
| `all_reference` | 全能参考 | mixed reference media plus prompt |

### 6.1 Open modes by model

| Model | Text to video | Image to video | Image reference | First/last frame | All reference |
| --- | --- | --- | --- | --- | --- |
| `gemini-omni-flash` | enabled | enabled | enabled | disabled | enabled |
| `sora-v3-pro` | enabled | enabled | enabled | disabled | enabled |
| `veo31-fast` | enabled | enabled | disabled | enabled | disabled |

Equivalent capability values are:

```ts
gemini.supportedModes = [
  "text_to_video",
  "image_to_video",
  "image_reference",
  "all_reference",
];

sora.supportedModes = [
  "text_to_video",
  "image_to_video",
  "image_reference",
  "all_reference",
];

veo.supportedModes = [
  "text_to_video",
  "image_to_video",
  "first_last_frame",
];
```

### 6.2 Mode-specific reference constraints

| Model and mode | Required input | Maximum input | Provider mapping |
| --- | --- | --- | --- |
| Gemini text to video | no reference media | none | omit all reference fields |
| Gemini image to video | exactly 1 main image | 1 image | `image_urls: [url]` |
| Gemini image reference | at least 2 images | 5 images | `image_urls` |
| Gemini all reference | exactly 1 source video | 1 video plus up to 5 images | `video_urls` plus optional `image_urls` |
| Sora text to video | no reference media | none | omit all reference fields |
| Sora image to video | exactly 1 main image | 1 image | `reference_image_urls: [url]` |
| Sora image reference | at least 2 images | 9 images | `reference_image_urls` |
| Sora all reference | at least one video or audio | 9 images, 3 videos, 3 audios, 12 total | separate image, video, and audio arrays |
| Veo text to video | no reference media | none | omit `image_urls` |
| Veo image to video | exactly 1 first-frame image | 1 image | `image_urls: [firstFrame]` |
| Veo first/last frame | exactly 2 ordered frame images | 2 images | `image_urls: [firstFrame, lastFrame]` |

Sora audio reference is valid only when at least one image or video reference also exists. Generated-audio selection and audio-reference input are independent concepts.

Gemini all-reference mode is a model-limited all-reference mode: its audio section is unavailable, while image and one source-video input remain available.

### 6.3 Single-image semantic boundary

TapFlow classifies a single image supplied to Gemini or Sora as the product-level `image_to_video` mode. Gemini sends one item in `image_urls`; Sora sends one item in `reference_image_urls`. PixelHub does not expose an independent `start_frame` field for these models, so their UI slot is labelled `主参考图`; the product must not promise pixel-identical first-frame enforcement.

PixelHub explicitly defines Veo one-image input as the first frame and two-image input as first frame plus last frame. Veo therefore uses the stronger `首帧` and `尾帧` labels.

## 7. Automatic Mode Selection

Reference changes drive mode selection using media types and counts. The precedence is deterministic:

1. If any video or audio reference is connected, select `all_reference` when the current model supports it.
2. With image-only input, one image selects `image_to_video`.
3. With exactly two images, Gemini and Sora select `image_reference`; Veo selects `first_last_frame`.
4. With three or more images, Gemini and Sora select `image_reference`; Veo reports an incompatible reference error.
5. With no reference media, select `text_to_video`.

When a reference is removed, the mode degrades in the reverse direction:

- image reference with one remaining image becomes image to video;
- image to video with no image becomes text to video;
- Veo first/last frame with one remaining image becomes image to video;
- all reference without video or audio becomes text to video, image to video, or image reference according to the remaining image count.

Manual mode selection remains available. Selecting an input mode with empty required slots is allowed so the user can add media next, but generation remains blocked until its minimum input contract is satisfied.

Automatic switching never deletes references. Unsupported kinds, excessive counts, or invalid combinations remain visible and block generation until the user resolves them.

### Model-switch behavior

Scalar values are corrected deterministically:

- keep the current value when supported;
- otherwise set ratio to `16:9`;
- otherwise set resolution to the target model default;
- choose the nearest supported duration, preferring the lower value on a tie;
- force output count to `1`;
- force generated audio on for Gemini and Veo; preserve the Sora toggle.

References are preserved and revalidated rather than truncated. Examples:

- six Sora reference images switched to Gemini remain attached, but generation is blocked until reduced to five;
- Veo first/last frame switched to Sora retains both images and becomes image reference;
- Gemini source-video input switched to Veo remains visible as incompatible and blocks generation;
- Sora audio input switched to Gemini remains visible as unsupported and blocks generation.

## 8. Capability Schema

The catalog-driven capability object must be extended so React components contain no hard-coded per-model branching.

```ts
type VideoAudioControlMode =
  | "toggle"
  | "always_on_implicit"
  | "unsupported";

type VideoReferenceSemantics =
  | "style_images_and_source_video"
  | "mixed_reference_media"
  | "ordered_first_last_frames";

type VideoModeConstraint = {
  minImages: number;
  maxImages: number;
  minVideos: number;
  maxVideos: number;
  minAudios: number;
  maxAudios: number;
  maxTotal: number;
  requiresVideoOrAudio?: boolean;
  requiresVisualWithAudio?: boolean;
};

type VideoGenerationCapabilities = {
  aspectRatios: VideoAspectRatio[];
  resolutions: VideoResolution[];
  defaultAspectRatio: VideoAspectRatio;
  defaultResolution: VideoResolution;
  supportedDurations: number[];
  defaultDurationSeconds: number;
  minDurationSeconds: number;
  maxDurationSeconds: number;
  durationStepSeconds: number;
  maxCount: number;
  supportedModes: VideoGenerationMode[];
  modeConstraints: Partial<Record<VideoGenerationMode, VideoModeConstraint>>;
  audioControlMode: VideoAudioControlMode;
  maxPromptLength?: number;
  maxReferenceImages: number;
  maxReferenceVideos: number;
  maxReferenceAudios: number;
  maxReferenceMediaTotal: number;
  referenceSemantics: VideoReferenceSemantics;
  confirmedByRoute: boolean;
};
```

`supportedDurations` is authoritative when populated. Min/max/step remain for backward compatibility and for continuous ranges. Existing `supportsAudio` can be returned as a compatibility projection, but new UI and validation use `audioControlMode`.

## 9. Canonical Node Data

Move video references to a repeatable v2 structure that can represent multiple references of the same role:

```ts
type VideoReferenceInputV2 = {
  referenceKey: string;
  source: {
    kind: "asset" | "upstream";
    id: string;
  };
  mediaKind: "image" | "video" | "audio";
  role:
    | "main_image"
    | "reference_image"
    | "source_video"
    | "reference_video"
    | "reference_audio"
    | "first_frame"
    | "last_frame";
  order: number;
};

type VideoGenerationParamsV2 = {
  schemaVersion: 2;
  mode: VideoGenerationMode;
  aspectRatio: VideoAspectRatio;
  resolution: VideoResolution;
  durationSeconds: number;
  generateAudio: boolean;
  count: 1;
  referenceInputs: VideoReferenceInputV2[];
  cameraMotionId: string | null;
  visualTone: string | null;
};
```

Node data also stores the selected catalog `modelId` and stable `routeKey`. It does not store the provider key, credential, upstream model, signed URL, remote output URL, `File`, `Blob`, base64, or data URL.

The v1 normalizer migrates existing role assignments and `referenceAssetItemIds`/`referenceOrder` into v2 entries. After normalization, `referenceInputs` is authoritative; compatibility arrays are derived only while older drafts remain supported.

Direct uploads must finish the existing asset-upload flow first, then insert the resulting asset ID. Upstream references store the source node ID and resolve its current output asset at runtime.

## 10. Canvas UI Behavior

The mode menu continues to show the same five conceptual input methods. Unsupported modes are disabled with `当前模型不支持此输入方式`; supported modes and their slots come from catalog capabilities.

The parameter panel behavior is:

- Gemini duration uses a four-value segmented control: `4`, `6`, `8`, `10`;
- Veo duration uses a three-value segmented control: `4`, `6`, `8`;
- Sora duration uses an integer slider/stepper from `4` through `15`;
- the resolution control contains only supported choices; Sora shows fixed `720P` as disabled/read-only;
- output count shows fixed `1` as read-only;
- Gemini and Veo show generated audio as on and read-only;
- Sora shows an enabled generated-audio toggle, default on;
- Sora shows a live final-prompt character counter and blocks at more than 2500 characters;
- the estimated cost updates immediately when duration changes.

Reference UI is mode-specific:

- image to video shows one `主参考图` slot for Gemini/Sora and one `首帧` slot for Veo;
- image reference shows an ordered multi-image strip with current count and model maximum;
- Veo first/last frame shows two stable, non-reorderable role slots;
- all reference separates image, video, and audio sections and hides or disables unsupported media kinds;
- every selected item exposes its media kind, role, order, and removal action.

`ReferenceSourcePicker` must filter both canvas nodes and asset-library results by the slot's allowed media kinds. All menus continue to use the shared TapNow menu surface and dismissal behavior.

## 11. Catalog and Route Selection

`VideoModelOption` must include the selected route key, product model key, complete capabilities, and structured pricing data. Selecting a model writes both `modelId` and its default active `routeKey`.

The worker must not use a catalog UUID as the provider request model. Route resolution provides the server-owned `upstream_model`, and the PixelHub adapter uses that exact value.

If the selected route is missing, inactive, lacks a compatible video workflow, lacks confirmed capabilities, or lacks exact route pricing, the node is blocked. It must not silently fall back to `video.default`, a mock route, or generic default pricing.

Each route declares:

```json
{
  "apiMode": "async",
  "requestPath": "/v1/videos",
  "pollPathTemplate": "/v1/videos/{task_id}",
  "pollIntervalMs": 12000,
  "providerTaskTimeoutMs": 1800000,
  "supportedVideoWorkflows": ["video_generation"],
  "requireExactPricing": true
}
```

## 12. Canonical Worker Request

Extend the AI Gateway video request instead of placing validated generation parameters into arbitrary metadata:

```ts
type VideoGenerationRequest = {
  prompt: string;
  routeKey: string;
  params: {
    mode: VideoGenerationMode;
    aspectRatio: VideoAspectRatio;
    resolution: VideoResolution;
    durationSeconds: number;
    generateAudio: boolean;
    count: 1;
  };
  inputAssets: AssetReferenceInput[];
  metadata?: Record<string, unknown> | null;
};
```

Each input asset carries verified media kind and structured reference metadata such as role, order, and source node ID. Before the adapter runs, the worker:

1. resolves upstream node references to output asset IDs;
2. performs tenant-scoped asset lookup;
3. verifies actual asset kind against the declared kind and mode slot;
4. creates a short-lived signed URL;
5. preserves role and order while passing hydrated assets to the adapter.

The API validates the draft before reserve and enqueue. The worker repeats validation against route capabilities immediately before provider submission because persisted drafts and routes may have changed.

## 13. PixelHub Adapter Mapping

The adapter sends one canonical field per concept and never combines aliases. It uses:

- `duration`, not `seconds`;
- `aspect_ratio`, not `size`;
- `image_urls` for Gemini images and `video_urls` for Gemini source video;
- `reference_image_urls` and `reference_videos` for Sora reference media;
- `audio_urls` for Sora audio;
- `image_urls` for ordered Veo frame images;
- no `start_frame`, `end_frame`, or `video_reference` fields.

Empty reference arrays are omitted. Frontend `720P`/`1080P` values are lowercased for the provider.

### Gemini example

```json
{
  "model": "gemini-omni-flash",
  "prompt": "Replace the subject while preserving the source motion.",
  "aspect_ratio": "16:9",
  "resolution": "1080p",
  "duration": 8,
  "image_urls": [
    "https://signed.example/reference-1"
  ],
  "video_urls": [
    "https://signed.example/source-video"
  ]
}
```

`generate_audio` is omitted regardless of the canonical fixed-on UI value.

### Sora example

```json
{
  "model": "sora-v3-pro",
  "prompt": "Keep the subject identity and follow the motion and rhythm references.",
  "aspect_ratio": "9:16",
  "resolution": "720p",
  "duration": 10,
  "generate_audio": false,
  "reference_image_urls": [
    "https://signed.example/subject"
  ],
  "reference_videos": [
    "https://signed.example/motion"
  ],
  "audio_urls": [
    "https://signed.example/rhythm"
  ]
}
```

### Veo example

```json
{
  "model": "veo31-fast",
  "prompt": "The subject walks through the door as the camera follows.",
  "aspect_ratio": "16:9",
  "resolution": "1080p",
  "duration": 6,
  "image_urls": [
    "https://signed.example/first-frame",
    "https://signed.example/last-frame"
  ]
}
```

`generate_audio` is omitted for Veo.

## 14. Asynchronous Task Lifecycle

`generateVideo()` performs one create request and validates that the response contains a non-empty `task_id`. A queued or in-progress task returns `waiting_provider` with that provider task ID. A provider response that is already completed may return success immediately.

`pollTask()` maps provider states as follows:

| PixelHub status | AI Gateway status |
| --- | --- |
| `queued` | `pending` |
| `in_progress` | `running` |
| `completed` with valid `video_url` | `succeeded` |
| `failed` | `failed` |

The worker polls every 12 seconds and stops after 30 minutes. Poll GET requests may retry transient network, 429, and 5xx failures within the existing queue retry policy. The create POST is not automatically retried after an ambiguous timeout because PixelHub does not document an idempotency key and a retry could create a duplicate paid task.

On completion, the worker immediately downloads `video_url`, applies existing bounded media-download validation, uploads the result to S3-compatible storage, creates an `assets` record, and patches the node output with the platform asset ID and recoverable preview data. The provider URL never becomes draft authority.

## 15. Pricing and Billing

Pricing remains in `model_pricing` with unit `video_generation`. Each exact route pricing row uses metadata `billingBasis: "duration_second"`.

| Model | Unit credits | Minimum charge | Valid base charges |
| --- | ---: | ---: | --- |
| `gemini-omni-flash` | 1 | 4 | 4, 6, 8, or 10 credits |
| `sora-v3-pro` | 10 | 40 | 40 through 150 credits in steps of 10 |
| `veo31-fast` | 0.5 | 2 | 2, 3, or 4 credits |

The base-price formula is:

```txt
max(minChargeCredits, unitCredits * durationSeconds)
```

`resolveNodePricing()` reads `durationSeconds` as the billing multiplier only when the matched exact pricing row declares `duration_second`. Existing video editor and legacy video routes without that metadata retain quantity `1` behavior.

The selected duration is validated before pricing. Missing or invalid exact PixelHub pricing returns `PRICING_NOT_FOUND`; generic default video pricing cannot be used for these routes. Membership discount is applied after the base price through the existing billing path.

The node displays both rate and current estimate, for example `预计 8 金币 · 1 金币/秒`. The server recomputes the amount, reserves it before enqueue, settles the reserved amount on success, and fully refunds it on failure.

## 16. Validation and Error Contract

Client validation improves interaction, but server and worker validation are authoritative.

| Code | Condition |
| --- | --- |
| `VIDEO_PROMPT_REQUIRED` | final prompt is empty |
| `VIDEO_PROMPT_TOO_LONG` | Sora final prompt exceeds 2500 characters |
| `UNSUPPORTED_VIDEO_MODE` | mode is not enabled for the route |
| `VIDEO_MODE_INPUT_REQUIRED` | selected mode lacks its required references |
| `UNSUPPORTED_ASPECT_RATIO` | ratio is outside route capabilities |
| `UNSUPPORTED_RESOLUTION` | resolution is outside route capabilities |
| `UNSUPPORTED_DURATION` | duration is not in the exact supported list |
| `VIDEO_COUNT_UNSUPPORTED` | count is not exactly one |
| `AUDIO_SETTING_FIXED` | a fixed-on model receives a tampered false value |
| `UNSUPPORTED_REFERENCE_KIND` | reference media kind is unavailable for the model or mode |
| `REFERENCE_LIMIT_EXCEEDED` | one media kind exceeds its model/mode limit |
| `REFERENCE_MEDIA_TOTAL_EXCEEDED` | Sora references exceed 12 total |
| `AUDIO_REFERENCE_REQUIRES_VISUAL` | Sora audio exists without an image or video |
| `REFERENCE_ASSET_NOT_FOUND` | asset or upstream output cannot be resolved in the tenant |
| `REFERENCE_ASSET_KIND_MISMATCH` | persisted media kind does not match the authoritative asset row |
| `PRICING_NOT_FOUND` | exact active route pricing is absent or invalid |
| `PIXELHUB_REQUEST_REJECTED` | provider returns a sanitized 4xx validation failure |
| `PROVIDER_AUTH_FAILED` | provider returns 401 or 403 |
| `PROVIDER_RATE_LIMITED` | provider returns 429 |
| `PROVIDER_UNAVAILABLE` | provider or network is temporarily unavailable |
| `PIXELHUB_RESPONSE_INVALID` | task ID, status, or completed URL is missing or malformed |
| `PIXELHUB_TASK_FAILED` | provider reports `failed` |
| `PIXELHUB_TASK_TIMEOUT` | task exceeds the 30-minute deadline |

## 17. Security and Observability

- Bearer credentials are decrypted only in the server-side runtime adapter.
- Authorization headers are never logged or returned.
- Drafts and frontend responses never contain encrypted credential fields.
- Tenant-scoped asset lookup is mandatory before URL hydration.
- Signed reference URLs exist only in worker memory for the provider call.
- AI call logs store model, route, task ID, media-kind counts, latency, status, and sanitized errors.
- Stored provider-request summaries omit signed URLs, prompts when not operationally required, and raw Authorization data.
- Stored provider responses omit `video_url`; output authority is the resulting TapFlow asset.
- Logs report reference counts and kinds rather than media URLs.

## 18. Test Matrix

### Catalog and capabilities

- all three product models appear independently despite family-level catalog deduplication;
- selecting each model yields its stable route key and exact capability object;
- inactive, unpriced, or unconfirmed routes are not generatable;
- mock video routes are not exposed as production choices.

### Canvas UI

- Gemini exposes four modes and disables first/last frame;
- Sora exposes four modes and disables first/last frame;
- Veo exposes text, image-to-video, and first/last frame only;
- discrete durations render and select exactly for Gemini and Veo;
- Sora accepts every integer from 4 through 15 and rejects other values;
- fixed resolution, output count, and audio controls are read-only where required;
- Sora audio toggle remains interactive and defaults on;
- live cost changes with duration and supports Veo's 0.5 rate.

### Mode transitions

- no media, one image, two images, three images, video, audio, and mixed media select the specified mode;
- removing media applies the reverse transitions;
- invalid model switches preserve references and block instead of truncating;
- Sora audio-only input is blocked;
- Veo preserves first-frame and last-frame order.

### Worker request construction

- v2 reference inputs retain role, order, source node, and authoritative media kind;
- upstream references resolve to the correct output asset;
- tenant isolation rejects foreign assets;
- catalog UUID is never used as upstream `model`;
- all canonical generation parameters reach `VideoGenerationRequest`.

### Adapter

- each model produces the exact JSON field set shown in this spec;
- no alias pair is emitted simultaneously;
- Gemini and Veo omit `generate_audio`;
- Sora sends explicit `generate_audio` true and false values;
- create and all four poll statuses map correctly;
- malformed, failed, transient, and timed-out responses produce stable errors;
- provider request/response summaries contain no credentials or signed URLs.

### Billing and assets

- every valid model-duration combination produces the exact base charge in the pricing table;
- route pricing is exact and generic fallback is rejected;
- reserve, settle, and refund remain idempotent;
- failed creation, polling, or asset ingestion refunds the reservation;
- completed provider output is ingested into object storage and appears in `/assets`.

## 19. Rollout Plan

1. Add capability, canonical parameter, catalog pricing, and server-validation support with focused tests.
2. Add the `pixelhub-video` adapter and register it in the default worker AI Gateway registry.
3. Add the PixelHub plugin manifest containing the connection template, three models, routes, capabilities, UI metadata, and pricing.
4. Complete video/audio asset picking, v1-to-v2 reference normalization, mode transitions, and model-specific parameter controls.
5. Install the plugin in local/dev, configure a CredentialVault-backed PixelHub connection, and run adapter contract tests.
6. Deploy routes to staging as inactive, run one admin route test per model, then run one canvas generation per supported input mode.
7. Verify requested parameters, reserved and settled credits, provider task polling, output asset ingestion, and asset-library visibility.
8. Activate routes individually only after their staging checks pass.

Rollback disables the affected route by setting it inactive. Stable route keys and historical pricing, call logs, usage events, and billing ledger records are not deleted.

No PixelHub API key environment variable is required because the integration uses Provider Connections and CredentialVault. If deployment later introduces a non-secret adapter setting through environment variables, it must also be wired through `docker-compose.staging.yml` and documented in `docs/STAGING_ENV_TEMPLATE.md`.

## 20. Acceptance Criteria

The design is implemented when:

- each selected model exposes exactly its approved input modes and parameter options;
- automatic mode switching follows the media-type/count rules in this document;
- every invalid reference combination is blocked both before enqueue and in the worker;
- provider requests contain the correct upstream model and only canonical PixelHub fields;
- Gemini and Veo never send `generate_audio`, while Sora sends the selected value;
- billing charges 1, 10, or 0.5 credit per selected second using exact route pricing;
- task completion produces a durable TapFlow video asset;
- provider secrets and signed URLs do not leak into the frontend, draft, or logs;
- focused frontend, API, worker, AI Gateway, and database tests pass;
- `npm run build` passes;
- `PROJECT_RECORD.md` records implementation and staging outcomes.
