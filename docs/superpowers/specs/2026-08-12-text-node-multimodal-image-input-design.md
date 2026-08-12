# Text Node Multimodal Image Input Design

Date: 2026-08-12
Status: Approved design, pending implementation plan

## 1. Problem

The canvas currently recognizes an image-to-text connection and renders the
image thumbnail in the Text Node input tray, but the v2 workflow runtime sends
only string messages to the selected text route. Image outputs are serialized
as metadata text instead of being delivered as visual model input. The model
therefore behaves as though no image was supplied.

The legacy browser executor contains base64 preparation code, but it is not the
authoritative v2 path and must not be restored as the production solution.

## 2. Scope

This change adds real image understanding to Text Nodes for every text model
and route that explicitly declares visual-input support.

Included:

- images connected from upstream Image Nodes;
- image order preserved from the target Text Node `inputOrder`;
- one to three images per Text Node execution;
- GPT Chat Completions, OpenAI Responses, Gemini GenerateContent, and Claude
  Messages request mappings;
- capability-aware model selection and fail-closed runtime validation;
- tenant-scoped asset lookup and short-lived server-side media hydration;
- pure-text Text Node behavior remaining backward compatible.

Excluded:

- video or audio understanding;
- automatic video frame extraction;
- OCR as a separate preprocessing job;
- browser-side base64 conversion for the v2 workflow path;
- signed URLs, base64 media, or binary data persisted in canvas drafts or node
  output JSON;
- silently dropping a fourth or later image;
- automatically switching the user's selected model or route.

## 3. Chosen Architecture

Use one provider-neutral multimodal text contract in AI Gateway. Worker code
resolves ordered asset references and temporary media access; provider adapters
alone own upstream protocol formatting.

```text
Canvas edge/inputOrder
  -> API preflight before billing reserve and enqueue
  -> Worker extracts ordered tenant-owned image assets
  -> Worker hydrates short-lived media inputs
  -> TextGenerationRequest(messages + inputAssets)
  -> provider adapter protocol mapping
  -> visual text model
```

This preserves the existing boundary used by image and video generation:
`assetId` is durable identity, object storage is authoritative, and temporary
media representations exist only during server-side execution.

Rejected alternatives:

1. Formatting provider messages in Worker would couple workflow execution to
   GPT, Gemini, and Claude protocols.
2. Running an image-captioning call before the text call would double calls and
   cost while losing visual detail.
3. Reusing the legacy browser base64 path would bypass v2 asset authority and
   increase secret, payload, and persistence risk.

## 4. Gateway Contract

Extend `TextGenerationRequest` with ordered image asset references:

```ts
export type TextGenerationRequest = {
  inputAssets?: AssetReferenceInput[] | null;
  maxTokens?: number | null;
  messages: TextMessage[];
  model?: string | null;
  routeKey?: string | null;
  temperature?: number | null;
};
```

`TextMessage` remains provider-neutral. Image data is not embedded into its
string `content`; the adapter combines the final user text and ordered images
only when creating the upstream request.

Add a focused text-generation contract with these public capabilities:

```ts
export type TextGenerationCapabilities = {
  maxImages: number;
  supportedImageMimeTypes: string[];
  supportsImageInput: boolean;
};
```

The initial platform maximum is three images. A model and its selected route
must both resolve to `supportsImageInput: true`; absence of the flag means
false. The effective maximum is the lower of the platform maximum and the
declared model/route maximum.

Initially supported MIME types are:

```text
image/jpeg
image/png
image/webp
image/gif
```

The contract validator accepts only tenant-resolved image assets, rejects all
other media kinds, and returns stable structured issues. It never truncates an
input list.

## 5. Ordered Asset Resolution

The compiled Text Node already carries dependencies and creator-visible
`inputOrder`. Runtime resolution must use the same ordering rule already used
by `getOrderedDependencyIds`: ordered `upstream:<nodeId>` entries first, then
remaining dependencies without duplication.

For each dependency:

- read the dependency's runtime asset output, merged with its static compiled
  node asset fields when necessary;
- accept only image assets;
- preserve one entry per ordered upstream image input;
- reject missing, foreign-tenant, deleted, or unsupported assets;
- do not substitute `thumbnailUrl` from persisted graph JSON as authority.

The present scope covers upstream Image Nodes. Direct asset references added to
Text Nodes can use the same contract in a later scoped change; this design does
not invent a second image transport for them.

## 6. Validation and Billing Order

Validation is deliberately duplicated at two trust boundaries:

### API preflight

Before credit reserve and queue enqueue, the workflow-runs service inspects the
target Text Node, selected route capabilities, ordered dependencies, asset
count, and declared media kinds. Deterministic failures such as an unsupported
model or four connected images fail immediately without reserving credits or
creating a job.

### Worker authority

Immediately before provider execution, Worker repeats the capability, count,
tenant ownership, MIME, and asset-availability checks. This protects against
stale graph state, route changes, deleted assets, and time-of-check/time-of-use
changes. A Worker failure follows the existing reserve/refund behavior and no
provider call is made.

Stable errors:

| Code | Meaning | Creator message |
| --- | --- | --- |
| `TEXT_IMAGE_INPUT_LIMIT_EXCEEDED` | Effective maximum exceeded | `当前模型最多支持 3 张图片` |
| `TEXT_MODEL_IMAGE_INPUT_UNSUPPORTED` | Selected route lacks visual support | `当前文本模型线路不支持图片输入，请切换支持图片的线路` |
| `TEXT_IMAGE_ASSET_NOT_FOUND` | Asset missing, deleted, or outside tenant | `图片素材不存在或无权访问` |
| `TEXT_IMAGE_TYPE_UNSUPPORTED` | Asset is not a supported image MIME type | `当前图片格式不受支持` |
| `TEXT_IMAGE_URL_HYDRATION_FAILED` | Temporary media preparation failed | `图片读取失败，请稍后重试` |

There is no fallback to a text-only provider request after any image error.
Provider rejection remains `PROVIDER_BAD_REQUEST`, with creator context stating
that the selected route could not process the images.

## 7. Temporary Media Hydration

Worker reuses the existing tenant-scoped asset lookup and object-storage URL
hydration pattern used by media generation. Hydrated metadata may contain a
short-lived signed HTTPS URL only in the in-memory request object.

Adapter-specific rules:

- prefer a signed URL when the upstream protocol accepts arbitrary HTTPS image
  URLs;
- when a protocol requires inline bytes, the adapter fetches the signed URL on
  the server and creates an ephemeral base64 part;
- enforce MIME allowlisting before conversion;
- never include full URLs, base64, Authorization headers, object keys, or raw
  provider bodies in logs and call summaries;
- never return hydrated `inputAssets` through node output JSON or frontend API
  responses.

## 8. Provider Protocol Mapping

Images are attached to the final user message. System and assistant messages
retain their current ordering and semantics.

### GPT Chat Completions

```json
{
  "role": "user",
  "content": [
    { "type": "text", "text": "Describe the image" },
    { "type": "image_url", "image_url": { "url": "<temporary-url>" } }
  ]
}
```

### OpenAI Responses

```json
{
  "role": "user",
  "content": [
    { "type": "input_text", "text": "Describe the image" },
    { "type": "input_image", "image_url": "<temporary-url>" }
  ]
}
```

### Gemini GenerateContent

The user `parts` contain the text part followed by ordered image parts. Use
`fileData` only when the relay accepts the signed URL. Otherwise fetch and map
to `inlineData: { mimeType, data }` in memory.

### Claude Messages

The user `content` contains a text block followed by ordered image blocks. Use
the upstream-supported URL source when available; otherwise use an ephemeral
base64 source with the validated media type.

Pure-text requests keep their existing request shapes. Adapter tests must lock
this regression behavior.

## 9. Model and Route Capabilities

Extend plugin model capability typing to include:

```ts
supportsImageInput?: boolean;
maxImages?: number;
supportedImageMimeTypes?: string[];
```

Adapter support does not automatically enable every model. A built-in manifest
sets visual capability only for model/route combinations verified against the
real upstream relay. Unverified or failed routes remain text-only.

The Aittco text relay plugin version increases from `1.0.0` to `1.1.0`. New
installs persist the capability in both model capabilities and route request
capabilities. Existing stable route keys remain unchanged.

A platform migration backfills only verified Aittco text models and routes. It
must preserve credentials, connections, pricing, route labels, upstream model
values, status, and historical records. Rollback disables image input by
setting the capability false; it does not delete routes.

## 10. Catalog and Canvas Behavior

The runtime route catalog safely exposes only:

```text
supportsImageInput
maxImages
supportedImageMimeTypes
```

No provider connection data or temporary media metadata is exposed.

When a Text Node has one or more image inputs:

- incompatible model routes remain visible but disabled;
- hover and keyboard focus explain that the route does not support images;
- the application does not automatically change the selected model;
- submitting with a stale incompatible selection shows the structured error;
- four images show `当前模型最多支持 3 张图片` before generation starts.

The existing input thumbnail tray and shared menu density remain unchanged
except for capability messaging. No native select or new menu design is added.

## 11. Observability and Security

Safe diagnostics may include:

- image count;
- validated MIME kinds;
- route key, model key, workflow run ID, and node run ID;
- validation code;
- whether URL or inline transport was used, without its value.

Diagnostics must not include signed URLs, base64, object-storage keys, full
prompts, secrets, credentials, nonces, auth tags, Authorization headers, or
unredacted provider request/response bodies.

AI call logs retain billing and provider identifiers but store only sanitized
request summaries. Canvas drafts continue to persist `assetId`, never temporary
media representations.

## 12. Tests and Acceptance

### Contract and Worker

- one image succeeds;
- three images succeed in `inputOrder`;
- four images fail without truncation or provider invocation;
- unsupported route fails before provider invocation;
- missing and cross-tenant assets fail;
- non-image and unsupported MIME inputs fail;
- hydration failure does not degrade to text-only;
- pure-text requests remain unchanged.

### Adapters

- GPT Chat Completions maps text plus ordered `image_url` blocks;
- OpenAI Responses maps `input_text` plus ordered `input_image` blocks;
- Gemini maps text plus ordered `fileData` or `inlineData` parts;
- Claude maps text plus ordered image source blocks;
- system/assistant messages retain order;
- request diagnostics contain no URL, base64, secret, or full payload.

### API and UI

- API preflight rejects deterministic errors before reserve/enqueue;
- route catalog exposes only safe visual capability fields;
- incompatible routes are disabled when image inputs exist;
- capability explanations support pointer and keyboard users;
- node errors use the stable Chinese creator messages;
- an image connected to a Text Node produces a description grounded in visible
  image content and can generate a usable four-second video prompt.

### Required validation

```bash
npm run test --workspace @aigc-flow/ai-gateway-core
npm run test --workspace @aigc-flow/worker
npm run test --workspace @aigc-flow/api
npm test
npm run build
```

If infrastructure-dependent tests cannot run, the exact failure and completed
focused validation must be recorded. UI behavior requires a real browser smoke
test using a tenant-owned stored image; screenshots and logs must not reveal a
temporary image URL.

## 13. Deployment and Rollback

Deploy through `docker-compose.staging.yml`: build images, stop Worker, run the
compiled database migration CLI, then start Redis, API, Worker, and frontend.
After deployment, verify health, route capability catalog output, one pure-text
request, one single-image request, one three-image order test, one four-image
rejection, and billing reserve/settle/refund behavior.

Rollback order:

1. set affected text route `supportsImageInput` to false or mark the broken
   route inactive;
2. stop Worker if request mapping is unsafe;
3. redeploy the previous application commit/image;
4. preserve call logs and billing ledger history;
5. do not delete model routes or restore the database unless separately
   approved and required.

