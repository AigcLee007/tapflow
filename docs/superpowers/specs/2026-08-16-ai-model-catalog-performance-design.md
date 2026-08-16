# AI Model Catalog Loading Performance Design

## Goal

Reduce image, video, and text model/route catalog loading from the current N+1 request pattern to one authenticated request per modality, while keeping tenant isolation and making route/model status changes visible immediately after administrator updates.

## Current problem

The frontend currently requests a catalog and then requests routes for each model through:

- `GET /api/v2/ai/model-catalog`
- `GET /api/v2/ai/model-catalog/:modelKey/routes`

This creates one catalog request plus one route request per model. Multiple nodes can repeat the same work. The existing 8-second client timeout prevents indefinite loading but does not reduce request count or database work.

## Scope and non-goals

In scope:

- A bundle catalog API returning models and routes together.
- Tenant/environment/modality-scoped Redis caching with version-based invalidation.
- A frontend shared cache and in-flight request deduplication.
- Migration of image, video, and text node consumers.
- Observability, tests, rollout, and rollback support.

Out of scope:

- Changing provider request execution or worker routing behavior.
- Changing billing semantics or pricing calculations.
- Removing the existing catalog endpoints during the first release.
- Introducing browser persistent storage as an authoritative data source.

## Architecture

### Bundle endpoint

Add:

```txt
GET /api/v2/ai/model-catalog/bundle?modality=image|video|text&environment=production
```

Response:

```ts
type AiModelCatalogBundle = {
  models: AiModelCatalogItem[];
  routesByModelKey: Record<string, AiModelCatalogRoute[]>;
};
```

The endpoint keeps the existing authentication, tenant, and `flow:run` permission guards. The static `/bundle` route must be registered before `/:modelKey/routes`.

### Server query strategy

`AiModelCatalogService.listBundle` runs one tenant transaction with two queries:

1. Query active, tenant-visible catalog models for the requested modality and environment.
2. Query all active, tenant-visible routes for the same modality/environment, including existing pricing and capability projection.

The service groups routes by `modelKey` and `modelFamily` without calling `listRoutesForModel` in a loop. Existing `listModels` and `listRoutesForModel` remain available for compatibility and reuse the shared query/mapping helpers where practical.

The response must exclude inactive models, inactive routes, unpublished/disabled plugin installs, inactive providers, and inactive bound models according to the existing catalog rules. No provider credentials or secret material may enter the response.

### Cache

Create `apps/api/src/modules/ai-model-catalog/ai-model-catalog.cache.ts` with a cache interface and Redis implementation. Production uses a dedicated Redis connection so catalog traffic cannot interfere with BullMQ queue traffic. Unit tests inject an in-memory fake or no-op implementation.

Logical cache scope:

```txt
tenantId + environment + modality
```

Cache entries use a versioned key:

```txt
tapflow:ai-catalog:v1:{globalVersion}:{tenantVersion}:{tenantId}:{environment}:{modality}
```

Entries live for 30 seconds. Redis failures are fail-open for availability: the service queries PostgreSQL and returns the result without caching. Cache failures are logged and never expose secrets.

Version keys:

```txt
tapflow:ai-catalog:version:global
tapflow:ai-catalog:version:tenant:{tenantId}
```

The bundle read obtains the applicable versions and uses them in the cache key. A platform-level change increments the global version, invalidating every tenant logically. A tenant-scoped change increments that tenant version. Old physical keys are allowed to expire naturally.

### Invalidation

Create an invalidation service or dependency that is called only after the enclosing database transaction succeeds. It must cover:

- AI provider, provider connection, model, route, default-route, credential-status, and pricing mutations in `apps/api/src/modules/ai-gateway/ai-gateway.service.ts`.
- Model configuration draft/publish changes in `apps/api/src/modules/ai-model-configurations/ai-model-configurations.service.ts`.
- Plugin install publish/disable and plugin route/catalog changes in `apps/api/src/modules/ai-plugins/ai-plugins.service.ts`.

When an operation affects platform rows (`tenant_id IS NULL`), increment the global version. For tenant rows, increment the tenant version. If the affected modality or environment cannot be determined safely, invalidate the broader applicable scope rather than risk serving stale routes.

### Application wiring

Update:

- `apps/api/src/app.ts`
- `apps/api/src/fastify.d.ts`

Create and close the catalog Redis connection with the API lifecycle, decorate the Fastify app with the catalog cache/invalidation dependency, and keep Redis URLs server-side.

## Frontend design

Create `src/services/v2AiModelCatalogStore.ts` around `listAiModelCatalogBundle` in `src/services/v2AiModelCatalogApi.ts`.

The store provides:

- Modality-scoped in-memory cache.
- In-flight Promise deduplication.
- A `forceRefresh` path for retry.
- Explicit cache clearing.
- The existing 8-second request timeout.

Migrate these consumers to the bundle response:

- `src/flowCanvas/text/useTextGenerationCatalog.ts`
- `src/flowCanvas/video/useVideoGenerationCatalog.ts`
- `src/flowCanvas/nodes/FlowNodes.tsx`
- `src/flowCanvas/workbench/ImageWorkbenchComposer.tsx`

Consumers must read `routesByModelKey` instead of issuing per-model route requests. Saved models that are inactive or missing from the active bundle must not trigger a route request. They should show the existing empty/unavailable state and disable generation when no usable route exists.

After the first canvas/workspace paint, schedule optional idle prefetch for the three modalities. Prefetch must not block initial render and must reuse the same store Promise/cache.

## Loading and error states

All three modalities expose the same state model:

```txt
loading -> ready
loading -> empty
loading -> error -> retry
```

Retry clears the relevant in-memory entry and repeats the bundle request. It must not fall back to a new N+1 request sequence except as a temporary compatibility fallback if the bundle endpoint is unavailable during rollout.

## Observability

The bundle endpoint emits structured timing data containing modality, environment, cache hit/miss, database duration, total duration, model count, and route count. Tenant identifiers are logged only as safe internal identifiers or hashes. Secrets, tokens, encrypted credentials, and raw authorization headers are never logged.

Expose non-sensitive diagnostics through:

```txt
X-AI-Catalog-Cache: HIT|MISS|BYPASS
Server-Timing: catalog;dur=<milliseconds>
```

## Testing

Backend tests cover:

- Bundle grouping and response shape.
- Tenant/environment isolation.
- Exclusion of inactive models/routes/providers/plugins.
- Cache hit avoiding database work.
- Redis failure falling back to PostgreSQL.
- Global and tenant version invalidation.
- Authentication, tenant, permission, validation, and route precedence.

Frontend tests cover:

- One bundle request per modality.
- Shared in-flight Promise across nodes.
- No per-model route calls after migration.
- Disabled saved models not triggering route requests.
- Empty, error, retry, and no-route button states.
- No cross-tenant cache reuse at the store boundary.

Required validation commands after implementation:

```bash
npm run build
npm test
npm run test --workspace @aigc-flow/api
npm run test --workspace @aigc-flow/worker
npm run test --workspace @aigc-flow/ai-gateway-core
npm run test --workspace @aigc-flow/db
```

If staging query plans show sequential scans or a cold-cache P95 above 1.5 seconds, inspect `EXPLAIN (ANALYZE, BUFFERS)` before adding a tenant/modality/environment index migration. Do not add indexes speculatively without query-plan evidence.

## Rollout

1. Deploy the cache abstraction, bundle service, endpoint, invalidation hooks, and backend tests while keeping old endpoints unchanged.
2. Deploy the frontend store and migrate image, video, and text consumers.
3. Observe bundle P50/P95, Redis hit rate, database duration, error rate, and remaining old endpoint traffic.
4. Target Redis hit rate above 80%, warm-cache P95 below 500 ms, cold-cache P95 below 1.5 seconds, and one catalog request per modality.
5. Keep old endpoints for at least one release cycle for rollback and compatibility.

Use the repository's Docker Compose v2 deployment flow with `docker-compose.staging.yml`. If no database migration is introduced, build and restart the v2 services without running a migration; if an index migration is later added, stop the worker and run `node packages/db/dist/cli.js` before restarting it.

## Rollback

Rollback is a frontend/backend git deployment rollback. Existing catalog endpoints remain available, so reverting the frontend does not require data restoration. Redis catalog keys may expire naturally or be removed during an operational rollback. Never delete model/route history to roll back this performance change; route disablement remains `status = 'inactive'`.

## Acceptance criteria

- Image, video, and text nodes use one bundle request per modality.
- Multiple nodes share one in-flight request and one in-memory result.
- Warm-cache bundle P95 is below 500 ms in staging.
- Cold-cache bundle P95 is below 1.5 seconds in staging.
- Disabling a route invalidates the applicable cache version and the route disappears after the next request.
- Tenant A cannot read tenant B's catalog cache or routes.
- Redis unavailability does not leave nodes stuck loading.
- `npm run build` and relevant tests pass.
