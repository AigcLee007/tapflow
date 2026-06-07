# Cross-Provider Model Routes Upgrade Plan

Date: 2026-06-07
Status: Planned

Phase 1 status:

- Product model grouping is explicitly defined by `model_family`.
- Cross-provider route creation must validate provider/connection compatibility.
- `model_id` is treated as provider-side metadata and does not define product model ownership.
- New route creation should no longer depend on duplicating an existing route from the same provider.

## Background

The current AI Gateway admin model center supports multiple routes under one product model, but the route creation flow still assumes a route is copied from an existing route under the same provider. This creates a practical limitation:

- Product model: `GPT-Image-2`
- Existing provider: `SiphonLab OpenAI Compatible`
- New provider wanted: `MouxiHub OpenAI Compatible`

When an admin creates a separate MouxiHub provider and connection, the model center cannot select that connection for `GPT-Image-2`, because the connection dropdown is filtered by the provider of the existing route being copied.

The desired long-term admin model is:

```txt
Product model: GPT-Image-2
  - Line 1: SiphonLab / gpt-image-2
  - Line 2: SiphonLab / gpt-5.5
  - Line 3: MouxiHub / gpt-image-2
  - Line 4: Another relay / another upstream model
```

Each relay or upstream vendor should be managed as an independent provider when that improves admin clarity.

## Goal

Allow one product model to own routes from multiple providers.

Admins should be able to:

- Create one provider per relay/vendor, for example `mouxihub-openai`.
- Create credentials and connections under that provider.
- Add a new route under an existing product model such as `GPT-Image-2`.
- Select a connection from a different provider.
- Set that route's upstream model, API mode, request path, pricing, and status.
- Test, disable, duplicate, delete, and set default route as usual.

Canvas users should continue seeing only product models and friendly route labels.

## Current Limitation

Current behavior:

- Model Center creates a new route by duplicating an existing route.
- The duplicated route inherits the original route's `provider_id` and `model_id`.
- The connection dropdown filters connections by the current route provider.
- `updateRoute` can update `connection_id`, `upstream_model`, `api_mode`, and `request_path`, but does not change `provider_id`.

This means a newly created MouxiHub provider connection cannot be attached to the existing `GPT-Image-2` product model through the current UI.

## Target Data Semantics

The following meanings should be kept clear:

- `ai_model_catalog`: user-facing product model catalog.
- `ai_model_catalog.model_key`: product model key shown to the app, for example `gpt-image-2`.
- `ai_model_catalog.model_family`: product model family used to group routes, for example `gpt-image-2`.
- `ai_routes.model_family`: product model ownership field. Routes with the same model family appear under the same product model.
- `ai_routes.provider_id`: actual provider/vendor used by this route.
- `ai_routes.connection_id`: actual provider connection used at runtime.
- `ai_routes.upstream_model`: actual upstream model name sent to the provider.
- `ai_routes.api_mode`: provider adapter mode, for example `images` or `responses`.
- `ai_routes.request_path`: provider API path, for example `/images/generations` or `/responses`.
- `ai_routes.model_id`: optional provider-side model record. It should not prevent cross-provider routes from belonging to the same product model.

The key rule:

```txt
Product model grouping is controlled by model_family, not by provider_id.
```

## Desired Admin UX

### Provider Connections Page

Admins create provider resources independently:

```txt
Provider key: mouxihub-openai
Display name: MouxiHub OpenAI Compatible
Adapter kind: openai-compatible
Default base URL: https://api.mouxihub.com/v1
```

Then create:

```txt
Credential: MouxiHub GPT-Image-2 Key
Connection: MouxiHub GPT Image
```

### Model Center

When adding a line under `GPT-Image-2`, the create form should look like:

```txt
Product model: GPT-Image-2
Provider: MouxiHub OpenAI Compatible
Runtime connection: MouxiHub GPT Image
Route label: Line 3
Route key: image.gpt-image-2.mouxihub
Upstream model: gpt-image-2
API mode: images
Request path: /images/generations
Status: active
Pricing: 100 credits
```

The connection selector should no longer be restricted to the provider of the copied base route.

## Phase 1: Document and Data Contract

Deliverables:

- Document cross-provider route semantics.
- Confirm `model_family` is the product model grouping field.
- Define how `provider_id`, `connection_id`, `upstream_model`, `api_mode`, and `request_path` interact.
- Clarify that `model_id` is provider-side metadata and must not block cross-provider product routes.

Validation:

- Existing GPT-Image-2 routes still appear under `GPT-Image-2`.
- Existing Nano Banana routes still appear under their product models.
- Route keys remain stable.

## Phase 2: Backend Route Creation Upgrade

Deliverables:

- Add or extend a route creation endpoint that can create a route directly under a product model without duplicating an existing provider route.
- Allow create route input to include:
  - `providerId`
  - `connectionId`
  - `modelId`
  - `modelFamily`
  - `routeKey`
  - `routeLabel`
  - `upstreamModel`
  - `apiMode`
  - `requestPath`
  - `pricing`
  - `status`
- Validate that `connection.provider_id === providerId`.
- Validate that `modelFamily` maps to an existing active product model.
- Preserve tenant isolation and permission checks.

Implementation notes:

- Prefer using `createRoute` rather than the duplicate-then-update flow for new cross-provider routes.
- `updateRoute` does not necessarily need to support changing provider if creation covers the cross-provider use case.
- If `modelId` belongs to another provider, it should be accepted only when it belongs to the selected `providerId`.
- If no provider-side model row exists yet, the route can still use `upstreamModel` as the runtime model name.

Validation:

- API can create `image.gpt-image-2.mouxihub` under product model `gpt-image-2`.
- The created route uses provider `mouxihub-openai`.
- The created route appears under `/api/v2/ai/model-catalog/gpt-image-2/routes`.

## Phase 3: Model Center Create-Line UI

Deliverables:

- Replace the current duplicate-only create route flow with a true create-line flow.
- Add provider selector.
- Add connection selector filtered by selected provider.
- Show connection details:
  - provider name
  - connection name
  - adapter kind
  - base URL
  - credential mask
- Keep route fields:
  - route key
  - route label
  - internal label
  - upstream model
  - API mode
  - request path
  - status
  - admin notes
- Pre-fill defaults from the currently selected product model and selected provider.

Validation:

- Admin can choose MouxiHub when adding a route under GPT-Image-2.
- Admin can choose SiphonLab when adding another route under the same GPT-Image-2 product model.
- The route list refreshes without showing stale provider/connection options.

## Phase 4: Route List and Detail Clarity

Deliverables:

- Update route table columns so admins can see:
  - route label
  - route key
  - provider name
  - connection name
  - upstream model
  - API mode
  - request path
  - estimated price
  - status
  - default marker
- Update route detail preview to show product model separately from provider/upstream model.
- Keep provider/vendor names in admin surfaces only.

Validation:

- `GPT-Image-2` route list clearly shows both SiphonLab and MouxiHub routes.
- Friendly labels such as `线路一`, `线路二`, `线路三` remain the user-facing route labels.

## Phase 5: Model Catalog and Runtime Compatibility

Deliverables:

- Ensure `listRoutesForModel` returns all active tenant routes where:
  - `route.model_family` equals the selected product model family
  - route modality and environment match
  - provider is active
  - route is active
- Ensure cross-provider routes are not filtered out only because their `model_id` points to a provider-side model different from the catalog model.
- Ensure runtime route resolution still uses the selected route key and its provider connection.

Validation:

- `/api/v2/ai/model-catalog?modality=image` returns product models only.
- `/api/v2/ai/model-catalog/gpt-image-2/routes` returns SiphonLab and MouxiHub lines.
- Canvas generation using MouxiHub route sends the MouxiHub base URL, API key, upstream model, API mode, and request path.

## Phase 6: Pricing, Testing, and Logs

Deliverables:

- Allow route-specific pricing for new providers:
  - provider: `mouxihub-openai`
  - model: `gpt-image-2` or upstream model
  - route: `image.gpt-image-2.mouxihub`
- Ensure route tests work for cross-provider routes.
- Ensure provider request/response summaries stay redacted.
- Ensure call logs capture:
  - product model key
  - route key snapshot
  - route label snapshot
  - provider key snapshot
  - provider name snapshot
  - connection name snapshot
  - adapter kind snapshot
  - API mode snapshot
  - upstream model snapshot

Validation:

- MouxiHub route test succeeds.
- Failed MouxiHub call refunds or releases reserved credits.
- No raw API key appears in frontend payloads, API responses, worker logs, or call log summaries.

## Phase 7: Existing Data Cleanup

Deliverables:

- Provide a way to rename migrated connections from generated names such as `Migrated Connection cbc19be3`.
- Recommended names:
  - `SiphonLab GPT-Image-2 Images`
  - `SiphonLab GPT-Image-2 Responses`
  - `PixelleLabs Nano Banana Pro`
  - `PixelleLabs Nano Banana 2`
- Optional: add a small admin helper action or SQL runbook for safe renaming.

Validation:

- Existing routes keep working after renaming connections.
- Route history and call logs remain intact.

## Phase 8: Tests and Regression Coverage

Backend/API tests:

- Create provider `mouxihub-openai`.
- Create credential and provider connection under MouxiHub.
- Create route `image.gpt-image-2.mouxihub` under product model `gpt-image-2`.
- Verify route appears in model catalog route list.
- Verify route uses MouxiHub provider and connection at runtime.
- Verify tenant isolation.
- Verify delete connection fails when referenced by a route.

Frontend tests:

- Model Center can open create-line form.
- Provider selector changes available connections.
- MouxiHub connection can be selected under GPT-Image-2.
- Created route appears in the route list with provider and connection labels.

Runtime smoke:

- GPT-Image-2 SiphonLab line succeeds.
- GPT-Image-2 MouxiHub line succeeds.
- Switching default route changes canvas default selection.
- Disabled MouxiHub line disappears from normal user-facing route choices.

## Recommended Commit Plan

1. `docs: plan cross-provider model routes`
2. `feat: allow product model routes across providers`
3. `feat: add cross-provider route creation UI`
4. `refactor: clarify route provider connection display`
5. `test: cover cross-provider model routes`
6. `docs: add cross-provider route admin runbook`

## Acceptance Criteria

This upgrade is complete when:

1. Admin can create `MouxiHub OpenAI Compatible` as an independent provider.
2. Admin can create a MouxiHub credential and connection.
3. Admin can add a MouxiHub line under existing `GPT-Image-2`.
4. `GPT-Image-2` can contain lines from SiphonLab and MouxiHub at the same time.
5. Canvas users still see only `GPT-Image-2` and friendly route labels.
6. Actual provider payload uses the selected route's provider, base URL, credential, upstream model, API mode, and request path.
7. Billing uses the selected route's pricing.
8. Route tests and call logs provide enough evidence to debug failures.
9. API keys are never exposed.
10. Existing GPT-Image-2 and Nano Banana routes continue working.

## Example Target Operation

After implementation, adding MouxiHub should work like this:

1. Go to Provider Connections.
2. Create provider:

```txt
Provider key: mouxihub-openai
Display name: MouxiHub OpenAI Compatible
Adapter kind: openai-compatible
Default base URL: https://api.mouxihub.com/v1
```

3. Create credential:

```txt
Provider: MouxiHub OpenAI Compatible
Credential name: MouxiHub GPT-Image-2 Key
API key: <secret>
```

4. Create connection:

```txt
Connection name: MouxiHub GPT Image
Provider: MouxiHub OpenAI Compatible
Credential: MouxiHub GPT-Image-2 Key
Base URL: https://api.mouxihub.com/v1
Environment: production
```

5. Go to Model Center.
6. Select `GPT-Image-2`.
7. Click `Add line`.
8. Fill:

```txt
Provider: MouxiHub OpenAI Compatible
Runtime connection: MouxiHub GPT Image
Route key: image.gpt-image-2.mouxihub
Route label: 线路三
Upstream model: gpt-image-2
API mode: images
Request path: /images/generations
Status: active
Price: 100 credits
```

9. Save.
10. Test the route.
11. Set as default only after testing succeeds.
