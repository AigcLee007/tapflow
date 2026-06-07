# AI Gateway Admin V2 Development Plan

## Purpose

Upgrade the current model center into a professional AI Gateway management console.

The current page mixes plugin installation, model publishing, route configuration, upstream model names, API keys, pricing, and route testing in one workflow. This is hard to operate when one product model needs multiple providers or relay lines.

The V2 goal is to make the admin model clear:

- Product model: what users see, such as `GPT-Image-2` or `Nano Banana Pro`.
- Provider connection: where the request is sent, including Base URL, API key, adapter kind, and internal notes.
- Runtime route: one callable line under a product model, such as `Line 1`, `Line 2`, or `Line 3`.
- Upstream model: the real model sent to the provider, such as `gpt-5.5` or `gemini-3-pro-image-preview`.
- Pricing: credits charged by product model, route, and optional parameter tiers.
- Health and logs: evidence for route status, latency, failures, and actual upstream model.

Normal users should only see product models and user-friendly route names. Admins should see full internal routing details.

## Current Problems

1. The model center is plugin-first, not model-first.
2. Published routes are visible but not easy to edit, duplicate, disable, delete, or set as default.
3. One product model with multiple provider lines is hard to understand.
4. Internal upstream models are hidden inside `requestConfig`, so admins cannot see whether a line calls `gpt-image-2`, `gpt-5.5`, or another model.
5. API keys and Base URLs are tied to plugin installation flow instead of a reusable provider connection flow.
6. Pricing is separate from the route workflow, so admins cannot reason about route cost while editing a line.
7. Route tests do not provide enough persistent operational history.
8. Plugin packages currently behave like the main management surface, but they should become templates.

## Phase 1 Status

Phase 1 in this document means requirements and schema finalization. This phase is complete when the team has a stable implementation spec for:

- Final entities and ownership boundaries
- Table reuse versus new tables
- API request and response shapes
- Compatibility with current canvas, route resolution, and billing behavior
- Migration sequence for existing installed plugins and routes
- Admin UI information architecture and page responsibilities

This document is the Phase 1 source of truth.

## Current System Mapping

The current implementation already has most of the building blocks, but they are split across different layers:

- `ai_providers`
  Stores provider identity such as key, name, kind, default base URL, and capabilities.
- `ai_models`
  Stores provider-scoped technical models, currently closer to upstream/provider models than user-facing product models.
- `api_credentials`
  Stores encrypted tenant secrets.
- `ai_routes`
  Stores runtime route selection, provider binding, route key, and low-level request config.
- `ai_model_catalog`
  Stores user-facing product models shown to the canvas.
- `tenant_ai_plugin_installs`
  Stores plugin package install and publish state.
- `model_pricing`
  Stores billing resolution rows for provider/model/route/unit matching.
- `ai_route_health_checks`
  Stores route test history.
- `ai_call_logs`
  Stores runtime call evidence, but currently lacks enough normalized upstream metadata.

Current behavior summary:

- Canvas model selector reads from `ai_model_catalog`.
- Canvas route selector reads from active `ai_routes` filtered by `model_family`.
- Runtime route selection resolves by `routeKey` or active route candidates.
- Billing reserve settles against `model_pricing`.
- Plugin install currently creates provider, model, route, pricing, and catalog entries together.

This means V2 should evolve the current system, not replace it.

## Final Entity Model

The V2 admin system should use the following conceptual entities:

1. Product model
   Stored in `ai_model_catalog`.
   This is what end users see.

2. Provider connection
   New entity.
   Represents one named relay/provider endpoint plus credential and adapter context.

3. Runtime route
   Stored in `ai_routes`.
   Represents one line under a product model and points to a provider connection plus upstream model behavior.

4. Upstream model
   Usually stored as a normalized route field and mirrored in `request_config`.
   This is what is actually sent to the provider.

5. Pricing profile
   Stored in `model_pricing`.
   May also have route-local metadata for parameter tier editing convenience.

6. Route health record
   Stored in `ai_route_health_checks`.

7. Call log evidence
   Stored in `ai_call_logs`.

## Entity Relationships

```txt
Product Model (ai_model_catalog)
  1 -> many Runtime Routes (ai_routes)

Provider (ai_providers)
  1 -> many Provider Connections (ai_provider_connections)

Provider Connection (ai_provider_connections)
  1 -> many Runtime Routes (ai_routes)

Credential (api_credentials)
  1 -> many Provider Connections (ai_provider_connections)

Runtime Route (ai_routes)
  1 -> many Route Health Checks (ai_route_health_checks)
  1 -> many Call Logs (ai_call_logs)
  1 -> many Pricing Rows (model_pricing, matched by provider/model/route/unit)
```

## Reuse Versus New Schema

Reuse as-is with API/view changes:

- `ai_providers`
- `api_credentials`
- `ai_model_catalog`
- `ai_route_health_checks`
- `tenant_ai_plugin_installs`
- `model_pricing`

Reuse with added columns:

- `ai_routes`
- `ai_call_logs`

Add new table:

- `ai_provider_connections`

Keep plugin packages, but change product meaning:

- `ai_plugin_packages`
  Remains a template registry, not the main management surface.

## Target Information Architecture

```txt
AI Gateway Admin
|- Model Catalog
|  |- GPT-Image-2
|  |  |- Line 1 -> SiphonLab A -> upstream gpt-image-2
|  |  |- Line 2 -> SiphonLab B -> upstream gpt-5.5
|  |  `- Line 3 -> Provider C -> upstream gpt-5.4
|  `- Nano Banana Pro
|     |- Line 1 -> PixelleLabs A -> upstream gemini-3-pro-image-preview
|     `- Line 2 -> Provider B -> upstream nano-banana-pro
|- Provider Connections
|  |- SiphonLab A
|  |- SiphonLab B
|  `- PixelleLabs A
|- Pricing
|- Route Health
|- Call Logs
`- Template Library
```

## Product Model

A product model is the model shown in the canvas and user-facing model selector.

Examples:

- `GPT-Image-2`
- `Nano Banana Pro`
- `Nano Banana 2`

Important fields:

- Display name
- Model key
- Model family
- Modality: text, image, or video
- Default route
- Sort order
- UI schema
- Capabilities
- Status: draft, active, inactive

Current table to reuse:

- `ai_model_catalog`

Potential additions:

- `description`
- `admin_notes`
- `published_at`
- `disabled_at`

## Provider Connection

A provider connection represents one configured relay/provider endpoint and credential.

Examples:

- `SiphonLab A`
- `SiphonLab Backup`
- `PixelleLabs Nano Banana Pro Key`

Fields:

- Connection name
- Provider ID
- Adapter kind
- Base URL
- Credential ID
- Environment
- Internal notes
- Status
- Last health status
- Last tested at

Recommended new table:

```txt
ai_provider_connections
```

Suggested columns:

```txt
id uuid primary key
tenant_id uuid not null
provider_id uuid not null
credential_id uuid
name text not null
adapter_kind text not null
base_url text
environment text not null default 'production'
status text not null default 'active'
metadata jsonb not null default '{}'
last_health_status text
last_health_checked_at timestamptz
created_by uuid
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Notes:

- API keys stay in existing encrypted credential storage.
- Connections can be disabled without deleting historical call records.
- Multiple connections can share one provider but use different API keys or Base URLs.

## Runtime Route

A runtime route is one callable line under a product model.

Examples:

- `GPT-Image-2 / Line 1 / SiphonLab A / upstream gpt-image-2`
- `GPT-Image-2 / Line 2 / SiphonLab B / upstream gpt-5.5`
- `Nano Banana Pro / Line 1 / PixelleLabs A / upstream gemini-3-pro-image-preview`

Current table to reuse:

- `ai_routes`

Recommended additions:

```txt
connection_id uuid references ai_provider_connections(id)
upstream_model text
api_mode text
request_path text
internal_label text
admin_notes text
is_default boolean not null default false
weight int not null default 100
fallback_order int
health_status text
last_health_checked_at timestamptz
deleted_at timestamptz
```

Existing `request_config` should remain, but the admin UI should expose common fields as normal form inputs:

- API mode
- Request path
- Upstream model
- Timeout
- Response format
- Output format
- Size or quality mapping

The raw JSON editor can stay under an advanced section.

Normalized route fields should be treated as the source of truth in admin APIs:

- `connection_id`
- `upstream_model`
- `api_mode`
- `request_path`
- `internal_label`
- `admin_notes`
- `is_default`
- `weight`
- `fallback_order`

`request_config` should remain the execution payload container and compatibility layer, but not the primary admin editing surface.

## Final Schema Decisions

### New Table: `ai_provider_connections`

Purpose:

- Decouple credentials and Base URL management from plugin install flow.
- Allow multiple named relay connections for the same provider.
- Make routes reusable and understandable.

Required columns:

```txt
id uuid primary key default gen_random_uuid()
tenant_id uuid not null references tenants(id)
provider_id uuid not null references ai_providers(id)
credential_id uuid references api_credentials(id)
name text not null
adapter_kind text not null
base_url text
environment text not null default 'production'
status text not null default 'active'
metadata jsonb not null default '{}'::jsonb
last_health_status text
last_health_checked_at timestamptz
created_by uuid references users(id)
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Indexes:

```txt
(tenant_id, provider_id, status)
(tenant_id, name) unique
```

RLS:

- Tenant select
- Tenant insert
- Tenant update
- Tenant delete

### Add Columns To `ai_routes`

Purpose:

- Move hidden route semantics into first-class route fields.

Required additions:

```txt
connection_id uuid references ai_provider_connections(id)
upstream_model text
api_mode text
request_path text
internal_label text
admin_notes text
is_default boolean not null default false
health_status text
last_health_checked_at timestamptz
deleted_at timestamptz
```

Keep existing columns:

- `provider_id`
- `model_id`
- `credential_id`
- `route_key`
- `priority`
- `weight`
- `fallback_group`
- `base_url_override`
- `request_config`
- `pricing`
- `rate_limit`
- `status`

Compatibility rule:

- Existing execution code may continue to read `request_config`.
- New route admin APIs must write normalized fields and keep `request_config` mirrored.
- Runtime adapters should prefer normalized route semantics when available, with `request_config` as fallback until full migration is complete.

### Extend `ai_call_logs`

Purpose:

- Record product-model and upstream-model evidence separately.

Recommended additions:

```txt
product_model_key text
route_key_snapshot text
route_label_snapshot text
provider_key_snapshot text
provider_name_snapshot text
connection_id uuid references ai_provider_connections(id)
connection_name_snapshot text
adapter_kind_snapshot text
api_mode_snapshot text
upstream_model_snapshot text
request_summary jsonb not null default '{}'::jsonb
response_summary jsonb not null default '{}'::jsonb
```

### Keep `ai_model_catalog` As Product Model

No new table is needed for user-facing models.

Recommended additions:

```txt
description text
admin_notes text
published_at timestamptz
disabled_at timestamptz
```

Compatibility rule:

- `modelKey` remains the stable canvas-facing model identifier.
- `defaultRouteKey` remains the default runtime route selection for that product model.

## API Contract Decisions

### Provider Connection APIs

Request and response shape should avoid raw secret exposure.

List response:

```json
{
  "id": "uuid",
  "providerId": "uuid",
  "providerKey": "openai-compatible",
  "providerName": "SiphonLab",
  "credentialId": "uuid",
  "credentialName": "SiphonLab A Key",
  "credentialMasked": "sk-****abcd",
  "name": "SiphonLab A",
  "adapterKind": "openai-compatible",
  "baseUrl": "https://sub.siphonlab.cn/v1",
  "environment": "production",
  "status": "active",
  "lastHealthStatus": "ok",
  "lastHealthCheckedAt": "2026-06-07T00:00:00.000Z",
  "metadata": {}
}
```

Create request:

```json
{
  "providerId": "uuid",
  "credentialId": "uuid",
  "name": "SiphonLab A",
  "adapterKind": "openai-compatible",
  "baseUrl": "https://sub.siphonlab.cn/v1",
  "environment": "production",
  "metadata": {}
}
```

### Route APIs

Route list response must expose normalized admin fields:

```json
{
  "id": "uuid",
  "modelCatalogKey": "gpt-image-2",
  "modelFamily": "gpt-image-2",
  "routeKey": "image.gpt-image-2.line2",
  "routeLabel": "线路二",
  "internalLabel": "SiphonLab Backup",
  "providerId": "uuid",
  "providerKey": "openai-compatible",
  "connectionId": "uuid",
  "connectionName": "SiphonLab B",
  "upstreamModel": "gpt-5.5",
  "apiMode": "responses",
  "requestPath": "/responses",
  "status": "active",
  "isDefault": false,
  "priority": 20,
  "weight": 100,
  "healthStatus": "ok",
  "estimatedCredits": 100,
  "requestConfig": {}
}
```

Create route request:

```json
{
  "modelCatalogKey": "gpt-image-2",
  "routeKey": "image.gpt-image-2.line2",
  "routeLabel": "线路二",
  "internalLabel": "SiphonLab Backup",
  "connectionId": "uuid",
  "upstreamModel": "gpt-5.5",
  "apiMode": "responses",
  "requestPath": "/responses",
  "status": "active",
  "isDefault": false,
  "priority": 20,
  "weight": 100,
  "requestConfig": {
    "outputFormat": "png",
    "timeoutMs": 300000
  }
}
```

### Model Catalog Admin APIs

Admin APIs should manage user-facing model definitions without forcing plugin installation flow.

Model list response:

```json
{
  "id": "uuid",
  "modelKey": "gpt-image-2",
  "displayName": "GPT-Image-2",
  "modelFamily": "gpt-image-2",
  "modality": "image",
  "defaultRouteKey": "image.gpt-image-2",
  "status": "active",
  "sortOrder": 30,
  "routeCount": 2,
  "capabilities": {},
  "uiSchema": {}
}
```

### Compatibility APIs

These APIs stay in place and continue to serve runtime consumers:

- `/api/v2/ai/model-catalog`
- `/api/v2/ai/model-catalog/:modelKey/routes`
- `/api/v2/ai/routes`

Compatibility rule:

- Existing canvas-facing response fields stay stable.
- New admin-only fields are added in admin endpoints, not user-facing runtime endpoints.

## Compatibility Rules

These rules are mandatory to avoid regressions during the migration.

1. Canvas compatibility
   Canvas continues to reference `modelId` as the product model key such as `gpt-image-2`.

2. Route compatibility
   Existing `routeKey` values do not change.

3. Billing compatibility
   Existing `model_pricing` lookup order remains unchanged.

4. Adapter compatibility
   Adapter execution may still consume `request_config`, but route editor must maintain normalized fields and mirrored config values.

5. Plugin compatibility
   Existing plugin install flow continues to work while V2 admin surfaces are introduced.

6. Secret safety
   No API response should ever return raw API key or decrypted secret.

7. Audit compatibility
   Existing audit logging remains active for create, update, publish, disable, and route operations.

## Migration Sequence

The migration must be incremental and non-breaking.

1. Create `ai_provider_connections`.
2. Backfill one connection per current route credential and effective Base URL combination.
3. Add new normalized route columns to `ai_routes`.
4. Backfill `connection_id`, `upstream_model`, `api_mode`, and `request_path` from current route rows.
5. Backfill `is_default` using `ai_model_catalog.default_route_key`.
6. Add new snapshot metadata columns to `ai_call_logs`.
7. Update admin APIs to read and write normalized route fields.
8. Update admin UI to use new APIs.
9. Keep plugin installation writing compatible route rows during transition.

Rollback strategy:

- Because route execution still reads `request_config`, rollback can disable the new UI and continue to use old route rows if needed.

## UI Wireframe Decisions

### Model Catalog Page

```txt
+--------------------------------------------------------------+
| Product Models                                               |
|--------------------------------------------------------------|
| GPT-Image-2         2 routes      default: 线路一            |
| Nano Banana Pro     1 route       default: 线路一            |
| Nano Banana 2       1 route       default: 线路一            |
+--------------------------------------------------------------+

+--------------------------------------------------------------------------------------+
| Routes For GPT-Image-2                                                               |
|--------------------------------------------------------------------------------------|
| Label   | Internal Name     | Connection   | Upstream  | API Mode  | Price | Action |
| 线路一  | SiphonLab Main    | SiphonLab A  | gpt-image-2 | images   | 100   | ...   |
| 线路二  | SiphonLab Backup  | SiphonLab B  | gpt-5.5     | responses| 100   | ...   |
+--------------------------------------------------------------------------------------+
```

### Provider Connections Page

```txt
+----------------------------------------------------------------------------------+
| Name          | Provider           | Adapter            | Base URL      | Health |
| SiphonLab A   | openai-compatible  | openai-compatible  | sub.siphonlab | ok     |
| PixelleLabs A | pixellelabs        | pixellelabs-gemini | api.pixelle...| ok     |
+----------------------------------------------------------------------------------+
```

### Route Editor

```txt
Basic
Connection
Upstream
Parameters
Pricing
Advanced
```

The advanced section is the only place where raw `requestConfig` JSON is directly visible.

## Pricing

Pricing should be managed from the route detail page and still persist in `model_pricing`.

Base pricing:

```txt
provider + product model + route + unit -> credits
```

Parameter pricing examples:

```txt
GPT-Image-2
1K -> 100 points
2K -> 200 points
4K -> 400 points

Nano Banana Pro
2K -> 24 points
4K -> 48 points
AI enhance -> +8 points
```

Recommended behavior:

- Route detail page shows current route pricing.
- Admin can add parameter-tier overrides.
- Workflow billing continues to use exact provider/model/route/unit matching first.
- Pricing UI should never expose API keys.

## Health Checks

Use existing `ai_route_health_checks`.

Route health page should show:

- Last test status
- Latency
- Error code
- Error message
- Provider response summary
- Actual upstream model
- Tested by
- Tested at

Health checks should redact:

- Authorization headers
- API keys
- Raw secrets

## Call Logs

Call logs should show both product model and upstream model.

Recommended new log metadata:

```txt
productModelKey
routeKey
routeLabel
providerKey
providerName
connectionName
adapterKind
apiMode
upstreamModel
```

This avoids confusion where canvas input shows `gpt-image-2`, while the relay correctly receives `gpt-5.5`.

## Template Library

Plugin packages should become templates, not the main operating surface.

New meaning:

- Template library helps create an initial provider, model, route, and pricing setup.
- After creation, admins manage everything from Model Catalog, Provider Connections, and Runtime Routes.

Example templates:

- OpenAI-compatible Images API line
- OpenAI-compatible Responses image line
- PixelleLabs Gemini image line
- Visionary Nano Banana line
- Mock local development line

## Admin UI Plan

### Page 1: Model Catalog

Main daily management page.

Layout:

```txt
Left column:
  Product models grouped by modality

Right panel:
  Selected model overview
  Route table
```

Route table columns:

```txt
Route label
Internal name
Connection
Provider
Upstream model
API mode
Price
Default
Status
Health
Actions
```

Actions:

- Add route
- Edit route
- Duplicate route
- Set default
- Test route
- Disable route
- Delete route

### Page 2: Route Editor

Form sections:

1. Basic
   - Route label
   - Internal name
   - Status
   - Default route

2. Connection
   - Provider connection
   - Base URL preview
   - Credential preview

3. Upstream
   - Adapter kind
   - API mode
   - Request path
   - Upstream model
   - Timeout

4. Parameters
   - Size behavior
   - Quality behavior
   - Output format
   - Additional known fields

5. Pricing
   - Base credits
   - Minimum charge credits
   - Parameter-tier prices

6. Advanced
   - Raw `requestConfig` JSON
   - Read-only generated payload preview

### Page 3: Provider Connections

Columns:

```txt
Name
Provider
Adapter
Base URL
Credential
Status
Last health
Actions
```

Actions:

- Add connection
- Edit connection
- Rotate key
- Test connection
- Disable connection
- Delete connection if unused

### Page 4: Health And Logs

Route-focused diagnostics:

- Filter by model
- Filter by route
- Filter by connection
- Filter by provider
- Show latest health checks
- Show recent call logs
- Show actual upstream model

## Backend API Plan

### Provider Connections

```txt
GET    /api/v2/admin/ai/connections
POST   /api/v2/admin/ai/connections
PATCH  /api/v2/admin/ai/connections/:connectionId
DELETE /api/v2/admin/ai/connections/:connectionId
POST   /api/v2/admin/ai/connections/:connectionId/test
POST   /api/v2/admin/ai/connections/:connectionId/rotate-key
```

### Model Catalog

```txt
GET    /api/v2/admin/ai/model-catalog
POST   /api/v2/admin/ai/model-catalog
PATCH  /api/v2/admin/ai/model-catalog/:catalogModelId
DELETE /api/v2/admin/ai/model-catalog/:catalogModelId
POST   /api/v2/admin/ai/model-catalog/:catalogModelId/set-default-route
```

### Routes

Existing routes:

```txt
GET   /api/v2/admin/ai/routes
POST  /api/v2/admin/ai/routes
PATCH /api/v2/admin/ai/routes/:routeId
```

Add:

```txt
DELETE /api/v2/admin/ai/routes/:routeId
POST   /api/v2/admin/ai/routes/:routeId/duplicate
POST   /api/v2/admin/ai/routes/:routeId/test
POST   /api/v2/admin/ai/routes/:routeId/set-default
```

### Pricing

Existing:

```txt
GET   /api/v2/admin/ai/pricing
PATCH /api/v2/admin/ai/pricing
```

Add route-scoped helpers:

```txt
GET   /api/v2/admin/ai/routes/:routeId/pricing
PATCH /api/v2/admin/ai/routes/:routeId/pricing
```

## Data Migration Plan

Current known image models:

```txt
GPT-Image-2
Nano Banana Pro
Nano Banana 2
```

Current known routes:

```txt
GPT-Image-2 / line 1 / SiphonLab / upstream gpt-image-2
GPT-Image-2 / line 2 / SiphonLab / upstream gpt-5.5
Nano Banana Pro / line 1 / PixelleLabs / upstream gemini-3-pro-image-preview
Nano Banana 2 / line 1 / PixelleLabs / upstream gemini-3.1-flash-image-preview
```

Migration requirements:

1. Create provider connections for existing route credentials and Base URLs.
2. Attach existing routes to provider connections.
3. Extract `requestConfig.model` into `ai_routes.upstream_model`.
4. Extract `requestConfig.apiMode` or `endpoint` into `ai_routes.api_mode`.
5. Preserve existing route keys.
6. Preserve existing `ai_model_catalog.default_route_key`.
7. Preserve pricing rows.
8. Do not expose provider names or upstream models in the canvas user selector.

## Development Phases

### Phase 1: Requirements And Schema Finalization

Status:

- Completed

Deliverables completed:

- Confirm final data model.
- Confirm which existing tables are reused.
- Draft migrations.
- Define API response shapes.
- Define UI wireframes.
- Define compatibility rules.
- Define migration sequence.

Outputs:

- This document
- Final entity model
- Final schema decisions
- API contract decisions
- UI wireframe decisions
- Compatibility and migration rules

Open questions for Phase 2 kickoff:

- Whether `upstream_model`, `api_mode`, and `request_path` should also be duplicated into `request_config` on every write or only during transition
- Whether route delete should be hard delete for unused tenant routes or soft delete only
- Whether parameter-tier pricing lives only in `model_pricing.metadata` or also in route-local helper JSON

Validation:

- No code behavior changes yet.
- Review schema against current workflow execution and billing paths.

### Phase 2: Provider Connections Backend

Deliverables:

- Add `ai_provider_connections` migration.
- Add service methods.
- Add admin API routes.
- Add tests for tenant isolation and secret redaction.

Validation:

- Create, update, disable, delete unused connection.
- Rotate credential without exposing secret.

### Phase 3: Route Metadata Backend

Deliverables:

- Add route metadata columns.
- Update route create/update/list APIs.
- Add duplicate route API.
- Add delete or soft-delete route API.
- Add set-default route API.

Validation:

- One product model can have multiple active routes.
- Route can bind different connection and upstream model.
- Existing route resolution still works.

### Phase 4: Pricing Backend Integration

Deliverables:

- Add route-scoped pricing APIs.
- Add parameter-tier pricing metadata format.
- Keep existing workflow billing resolver compatible.

Validation:

- Exact route pricing still wins.
- Fallback pricing still works.
- No pricing row means clear admin error.

### Phase 5: Health Checks And Logs

Deliverables:

- Add route test endpoint if current route test endpoint is insufficient.
- Persist health checks.
- Add upstream model metadata to call logs.
- Redact provider requests and responses.

Validation:

- Failed provider call shows useful error without secrets.
- Successful call logs actual upstream model.

### Phase 6: Admin UI - Model Catalog And Routes

Deliverables:

- Replace plugin-first model center with model-first management.
- Add route table under each product model.
- Add route editor drawer/modal.
- Add route actions: edit, duplicate, test, disable, delete, set default.

Validation:

- GPT-Image-2 can show line 1 and line 2 clearly.
- Admin can add line 3 with another upstream model.
- Canvas still shows only product model and friendly route labels.

### Phase 7: Admin UI - Provider Connections

Deliverables:

- Add provider connections page.
- Add create/edit/test/disable/rotate-key flows.
- Show masked credential only.

Validation:

- Connection can be reused by multiple routes.
- Disabled connection prevents new route use.

### Phase 8: Template Library Refactor

Deliverables:

- Rename plugin area to template library.
- Make templates create initial models, connections, routes, and pricing.
- Move daily management links to model catalog and route management.

Validation:

- Installing a template creates usable objects.
- Editing after installation happens outside template library.

### Phase 9: Existing Data Migration

Deliverables:

- Migration script for current installed plugins and routes.
- Backfill provider connections and route metadata.
- Backfill upstream model fields.

Validation:

- Existing GPT-Image-2 and Nano Banana routes still run.
- Existing route keys do not change.
- Existing billing still works.

### Phase 10: Final Verification

Deliverables:

- End-to-end admin test checklist.
- Server deployment checklist.
- Documentation update in `AGENTS.md` if needed.

Validation:

- `npm run build`
- Relevant API tests
- ai-gateway-core tests
- Workflow generation smoke tests
- No API keys in frontend payloads
- No route/model local fallback flicker

## Acceptance Criteria

The upgrade is complete when:

1. Admin can create multiple provider connections.
2. Admin can create multiple routes under one product model.
3. Each route can use a different provider connection and upstream model.
4. Admin can edit, duplicate, disable, delete, test, and set default route.
5. Admin can see product model and upstream model separately.
6. Canvas users only see product model and friendly route labels.
7. Actual provider payload uses the route upstream model.
8. Billing uses route-specific pricing correctly.
9. Call logs and health checks show enough evidence to debug failures.
10. API keys are never exposed in frontend responses, logs, or provider request summaries.

## Recommended Execution Strategy

Implement in small commits:

1. Schema and backend connection APIs.
2. Route metadata and route management APIs.
3. Pricing and health-check APIs.
4. Model-first admin UI.
5. Provider connection UI.
6. Template library cleanup.
7. Data migration and documentation.

Do not combine this refactor with unrelated canvas, billing, auth, or frontend redesign work.
