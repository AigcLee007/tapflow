# AI Model Catalog Loading Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox - [ ] syntax for tracking.

**Goal:** Replace per-model catalog requests with a tenant-safe bundle endpoint, Redis caching, post-commit invalidation, and shared frontend loading.

**Architecture:** The API queries active models and all matching routes in one tenant transaction, caches the bundle for 30 seconds with global/tenant version keys, and invalidates versions after successful AI configuration mutations. The frontend consumes one bundle request per modality through an in-memory store that deduplicates concurrent requests; existing endpoints remain for compatibility.

**Tech Stack:** Fastify, PostgreSQL/pg, @aigc-flow/redis/ioredis, Zod, React, Vitest, Vite, Docker Compose v2.

---

## File map

Create:

- apps/api/src/modules/ai-model-catalog/ai-model-catalog.cache.ts — cache interface, Redis adapter, version keys, fail-open behavior.
- src/services/v2AiModelCatalogStore.ts — modality cache and in-flight Promise deduplication.
- src/services/v2AiModelCatalogStore.test.ts — store behavior tests.
- apps/api/test/ai-model-catalog.cache.test.ts — cache behavior tests.

Modify:

- apps/api/src/modules/ai-model-catalog/ai-model-catalog.schemas.ts, ai-model-catalog.service.ts, ai-model-catalog.routes.ts.
- apps/api/src/app.ts and apps/api/src/fastify.d.ts.
- apps/api/src/modules/ai-gateway/ai-gateway.service.ts.
- apps/api/src/modules/ai-model-configurations/ai-model-configurations.service.ts.
- apps/api/src/modules/ai-plugins/ai-plugins.service.ts.
- src/services/v2AiModelCatalogApi.ts.
- src/flowCanvas/text/useTextGenerationCatalog.ts.
- src/flowCanvas/video/useVideoGenerationCatalog.ts.
- src/flowCanvas/nodes/FlowNodes.tsx.
- src/flowCanvas/workbench/ImageWorkbenchComposer.tsx.
- Existing focused tests and PROJECT_RECORD.md.

## Task 1: Lock the bundle contract with failing tests

**Files:** apps/api/src/modules/ai-model-catalog/ai-model-catalog.schemas.ts, apps/api/test/ai-model-catalog.service.test.ts, apps/api/test/ai-model-catalog.test.ts

- [ ] Step 1: Write the schema test.

~~~ts
it("parses bundle queries", () => {
  expect(modelCatalogBundleQuerySchema.parse({ modality: "image" })).toEqual({
    modality: "image",
    environment: "production",
  });
  expect(() => modelCatalogBundleQuerySchema.parse({ modality: "audio" })).toThrow();
});
~~~

- [ ] Step 2: Write the service grouping test. Mock the existing pool/client style with two model rows and three route rows; assert listBundle returns models, routesByModelKey, and exactly two SQL calls.

~~~ts
expect(await service.listBundle(context, { modality: "image", environment: "production" })).toEqual({
  models: [
    expect.objectContaining({ modelKey: "model-a" }),
    expect.objectContaining({ modelKey: "model-b" }),
  ],
  routesByModelKey: {
    "model-a": [
      expect.objectContaining({ routeKey: "route-a" }),
      expect.objectContaining({ routeKey: "route-a-2" }),
    ],
    "model-b": [expect.objectContaining({ routeKey: "route-b" })],
  },
});
expect(client.query).toHaveBeenCalledTimes(2);
~~~

- [ ] Step 3: Write the route test. Inject the existing authenticated tenant fixture and assert GET /api/v2/ai/model-catalog/bundle?modality=image returns 200 and an object containing models and routesByModelKey.
- [ ] Step 4: Run the tests and verify failure.

~~~bash
npx vitest --run apps/api/test/ai-model-catalog.service.test.ts apps/api/test/ai-model-catalog.test.ts
~~~

Expected: FAIL because the schema, service method, and route do not exist.

- [ ] Step 5: Commit the contract tests.

~~~bash
git add apps/api/src/modules/ai-model-catalog/ai-model-catalog.schemas.ts apps/api/test/ai-model-catalog.service.test.ts apps/api/test/ai-model-catalog.test.ts
git commit -m "test(api): define model catalog bundle contract"
~~~

## Task 2: Implement the two-query bundle service

**Files:** apps/api/src/modules/ai-model-catalog/ai-model-catalog.schemas.ts and ai-model-catalog.service.ts

- [ ] Step 1: Add the schema and types.

~~~ts
export const modelCatalogBundleQuerySchema = z.object({
  modality: z.enum(["image", "video", "text"]),
  environment: z.string().trim().min(1).default("production"),
});
export type ModelCatalogBundleQuery = z.infer<typeof modelCatalogBundleQuerySchema>;
export type ModelCatalogBundleView = {
  models: ModelCatalogItemView[];
  routesByModelKey: Record<string, ModelCatalogRouteView[]>;
};
~~~

- [ ] Step 2: Extract queryModels(client, context, query) and queryAllRoutes(client, context, query). Keep the existing tenant predicates, active provider/model/plugin filters, pricing lateral join, capability projection, and route ordering. queryAllRoutes must query all routes in one SQL statement and never call listRoutesForModel in a loop.
- [ ] Step 3: Implement listBundle.

~~~ts
async listBundle(context: TenantContext, query: ModelCatalogBundleQuery): Promise<ModelCatalogBundleView> {
  return withTenantTransaction(context, async (client) => {
    const models = await this.queryModels(client, context, query);
    const routes = await this.queryAllRoutes(client, context, query);
    const routesByModelKey: Record<string, ModelCatalogRouteView[]> = {};
    for (const route of routes) {
      const key = route.modelKey || route.modelFamily;
      if (key) (routesByModelKey[key] ??= []).push(route);
    }
    return { models, routesByModelKey };
  }, this.pool);
}
~~~

- [ ] Step 4: Run focused tests and verify PASS.

~~~bash
npx vitest --run apps/api/test/ai-model-catalog.service.test.ts apps/api/test/ai-model-catalog.test.ts
~~~

- [ ] Step 5: Commit.

~~~bash
git add apps/api/src/modules/ai-model-catalog/ai-model-catalog.schemas.ts apps/api/src/modules/ai-model-catalog/ai-model-catalog.service.ts apps/api/test/ai-model-catalog.service.test.ts apps/api/test/ai-model-catalog.test.ts
git commit -m "feat(api): add aggregated AI model catalog service"
~~~

## Task 3: Implement Redis caching and version invalidation

**Files:** apps/api/src/modules/ai-model-catalog/ai-model-catalog.cache.ts, ai-model-catalog.service.ts, apps/api/test/ai-model-catalog.cache.test.ts

- [ ] Step 1: Write cache tests for versioned reads, global invalidation, tenant invalidation, TTL writes, and Redis failure bypass.

~~~ts
it("reads using global and tenant versions", async () => {
  redis.mget.mockResolvedValue(["4", "9"]);
  redis.get.mockResolvedValue(JSON.stringify(bundle));
  await expect(cache.get({
    tenantId: "tenant-a",
    modality: "image",
    environment: "production",
  })).resolves.toEqual(bundle);
  expect(redis.get).toHaveBeenCalledWith(
    "tapflow:ai-catalog:v1:4:9:tenant-a:production:image",
  );
});
~~~

- [ ] Step 2: Run the test and verify failure.

~~~bash
npx vitest --run apps/api/test/ai-model-catalog.cache.test.ts
~~~

Expected: FAIL because the cache module does not exist.

- [ ] Step 3: Implement AiModelCatalogCache with get, set, invalidateTenant, and invalidateGlobal. Use version keys tapflow:ai-catalog:version:global and tapflow:ai-catalog:version:tenant:{tenantId}; use cache keys tapflow:ai-catalog:v1:{globalVersion}:{tenantVersion}:{tenantId}:{environment}:{modality}; default missing versions to 0; write with EX 30; catch and log Redis errors.
- [ ] Step 4: Integrate cache-first flow into listBundle. Query PostgreSQL only on miss/bypass and cache only the public bundle.
- [ ] Step 5: Run tests and commit.

~~~bash
npx vitest --run apps/api/test/ai-model-catalog.cache.test.ts apps/api/test/ai-model-catalog.service.test.ts
git add apps/api/src/modules/ai-model-catalog/ai-model-catalog.cache.ts apps/api/src/modules/ai-model-catalog/ai-model-catalog.service.ts apps/api/test/ai-model-catalog.cache.test.ts
git commit -m "feat(api): cache model catalog bundles in Redis"
~~~

## Task 4: Expose the route and wire Redis lifecycle

**Files:** apps/api/src/modules/ai-model-catalog/ai-model-catalog.routes.ts, apps/api/src/app.ts, apps/api/src/fastify.d.ts, apps/api/test/ai-model-catalog.test.ts

- [ ] Step 1: Add failing assertions for X-AI-Catalog-Cache matching HIT/MISS/BYPASS and Server-Timing matching catalog;dur=.
- [ ] Step 2: Register the static /bundle route before /:modelKey/routes. Parse modelCatalogBundleQuerySchema, call listBundle, preserve requireAuth/requireTenant/flow:run, and set the diagnostics headers.
- [ ] Step 3: Create a dedicated catalog Redis connection from env.redisUrl, inject the cache into AiModelCatalogService, decorate Fastify types, and close the owned connection in onClose.
- [ ] Step 4: Run and commit.

~~~bash
npm run test --workspace @aigc-flow/api -- ai-model-catalog
git add apps/api/src/modules/ai-model-catalog/ai-model-catalog.routes.ts apps/api/src/app.ts apps/api/src/fastify.d.ts apps/api/test/ai-model-catalog.test.ts
git commit -m "feat(api): expose cached model catalog bundle endpoint"
~~~

## Task 5: Invalidate after AI configuration mutations

**Files:** apps/api/src/modules/ai-gateway/ai-gateway.service.ts, apps/api/src/modules/ai-model-configurations/ai-model-configurations.service.ts, apps/api/src/modules/ai-plugins/ai-plugins.service.ts, apps/api/src/app.ts, focused API tests

- [ ] Step 1: Add failing tests asserting successful platform mutations call invalidateGlobal, successful tenant mutations call invalidateTenant(context.tenantId), and failed transactions do not invalidate.
- [ ] Step 2: Inject this dependency into the mutation services.

~~~ts
type CatalogInvalidator = {
  invalidateGlobal(): Promise<void>;
  invalidateTenant(tenantId: string): Promise<void>;
};
~~~

- [ ] Step 3: Wire provider/connection/model/route/default-route/delete/credential/pricing mutations, model configuration draft/publish, and plugin install/publish/disable. Call invalidation only after withTenantTransaction resolves; ambiguous scope uses the broader invalidation.
- [ ] Step 4: Run and commit.

~~~bash
npm run test --workspace @aigc-flow/api -- ai-gateway ai-model-configurations ai-plugins ai-model-catalog
git add apps/api/src/modules/ai-gateway/ai-gateway.service.ts apps/api/src/modules/ai-model-configurations/ai-model-configurations.service.ts apps/api/src/modules/ai-plugins/ai-plugins.service.ts apps/api/src/app.ts apps/api/test
git commit -m "feat(api): invalidate catalog cache after AI configuration changes"
~~~

## Task 6: Add frontend bundle API and shared store

**Files:** src/services/v2AiModelCatalogApi.ts, src/services/v2AiModelCatalogStore.ts, src/services/v2AiModelCatalogApi.test.ts, src/services/v2AiModelCatalogStore.test.ts

- [ ] Step 1: Add failing API/store tests for the bundle URL, 8-second timeout, concurrent Promise deduplication, TTL reuse, force refresh, and pending-entry cleanup.
- [ ] Step 2: Run tests and verify failure.

~~~bash
npx vitest --run src/services/v2AiModelCatalogApi.test.ts src/services/v2AiModelCatalogStore.test.ts
~~~

- [ ] Step 3: Add the transport type and API function.

~~~ts
export type AiModelCatalogBundle = {
  models: AiModelCatalogItem[];
  routesByModelKey: Record<string, AiModelCatalogRoute[]>;
};

export function listAiModelCatalogBundle(
  modality: AiModality,
  environment = "production",
) {
  const query = "?modality=" + encodeURIComponent(modality)
    + "&environment=" + encodeURIComponent(environment);
  return apiGet<AiModelCatalogBundle>(
    "/ai/model-catalog/bundle" + query,
    { timeoutMs: 8_000 },
  );
}
~~~

- [ ] Step 4: Implement the store with Map<AiModality, cacheEntry> and Map<AiModality, Promise<AiModelCatalogBundle>>. Return non-expired values, reuse pending Promises, remove pending entries in finally, and expose forceRefresh/clear. Do not use persistent browser storage.
- [ ] Step 5: Run and commit.

~~~bash
npx vitest --run src/services/v2AiModelCatalogApi.test.ts src/services/v2AiModelCatalogStore.test.ts
git add src/services/v2AiModelCatalogApi.ts src/services/v2AiModelCatalogApi.test.ts src/services/v2AiModelCatalogStore.ts src/services/v2AiModelCatalogStore.test.ts
git commit -m "feat(frontend): add shared model catalog bundle store"
~~~

## Task 7: Migrate text, video, image, and workbench consumers

**Files:** text/video/image/workbench consumers and their existing focused tests

- [ ] Step 1: Change text/video tests to mock one bundle.

~~~ts
listAiModelCatalogBundleMock.mockResolvedValue({
  models: [catalogModel],
  routesByModelKey: { "real-model": [catalogRoute] },
});
~~~

Assert one bundle call and zero listAiModelRoutes calls.
- [ ] Step 2: Migrate text/video hooks to getAiModelCatalogBundle(modality) and pass bundle.models plus bundle.routesByModelKey into existing option mappers. Preserve stale-request guards, empty state, error state, and retry.
- [ ] Step 3: Migrate image node/workbench lookup to the bundle map using model key first and model family second. A saved inactive/missing model must not trigger a route request; disable generation when no active route exists.
- [ ] Step 4: Add idle prefetch after first paint with requestIdleCallback or setTimeout(callback, 300), calling prefetchAiModelCatalogBundle for image, video, and text. Do not block canvas render.
- [ ] Step 5: Run and commit.

~~~bash
npx vitest --run src/flowCanvas/text/useTextGenerationCatalog.test.tsx src/flowCanvas/video/useVideoGenerationCatalog.test.tsx src/flowCanvas/nodes/FlowNodes.image-inputs.test.tsx src/services/v2AiModelCatalogStore.test.ts
git add src/flowCanvas/text/useTextGenerationCatalog.ts src/flowCanvas/video/useVideoGenerationCatalog.ts src/flowCanvas/nodes/FlowNodes.tsx src/flowCanvas/workbench/ImageWorkbenchComposer.tsx src/flowCanvas/text/useTextGenerationCatalog.test.tsx src/flowCanvas/video/useVideoGenerationCatalog.test.tsx src/flowCanvas/nodes/FlowNodes.image-inputs.test.tsx
git commit -m "perf(frontend): use shared model catalog bundles"
~~~

## Task 8: Add observability and update the project record

**Files:** apps/api/src/modules/ai-model-catalog/ai-model-catalog.routes.ts, ai-model-catalog.service.ts, PROJECT_RECORD.md

- [ ] Step 1: Log modality, environment, cache status, database duration, total duration, model count, and route count through the existing logger. Never log tokens, credentials, or raw authorization headers.
- [ ] Step 2: Set X-AI-Catalog-Cache: HIT|MISS|BYPASS and Server-Timing: catalog;dur=<milliseconds>.
- [ ] Step 3: Update PROJECT_RECORD.md with the endpoint, cache/invalidation rules, consumer migration, tests, and staging measurements.
- [ ] Step 4: Commit.

~~~bash
git add apps/api/src/modules/ai-model-catalog/ai-model-catalog.routes.ts apps/api/src/modules/ai-model-catalog/ai-model-catalog.service.ts PROJECT_RECORD.md
git commit -m "docs: record model catalog performance rollout"
~~~

## Task 9: Verify, benchmark, and deploy staging

- [ ] Step 1: Run validation.

~~~bash
npm run build
npm test
npm run test --workspace @aigc-flow/api
npm run test --workspace @aigc-flow/worker
npm run test --workspace @aigc-flow/ai-gateway-core
npm run test --workspace @aigc-flow/db
git diff --check
git status --short
~~~

Record unrelated legacy failures exactly; do not claim the full suite passed if it did not.

- [ ] Step 2: Capture 20 warm and 20 cold authenticated staging requests per modality. Acceptance targets: warm P95 < 500ms, cold P95 < 1500ms, Redis hit rate > 80% after warm-up, and one bundle request per modality. If cold P95 misses, run EXPLAIN (ANALYZE, BUFFERS) before adding an index migration.
- [ ] Step 3: Deploy with the required v2 Compose flow.

~~~bash
cd /opt/aittco/tapflow
git fetch --all --prune
git pull --ff-only origin main
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml build
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml stop tapflow-worker
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml up -d tapflow-redis tapflow-api tapflow-worker tapflow-frontend
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml ps
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml logs --tail=100 tapflow-api tapflow-worker
~~~

If an index migration is added, run node packages/db/dist/cli.js in the API image after stopping the worker and before restarting it.

- [ ] Step 4: Smoke test image, video, and text nodes; confirm one bundle request per modality, shared requests across two same-modality nodes, correct empty/error/retry states, immediate disappearance of a disabled line after invalidation, and PostgreSQL fallback when Redis is unavailable.
- [ ] Step 5: Keep old endpoints for one release cycle and roll back by git/application image if needed; never delete model/route history.

## Self-review

- Tasks 1–4 cover the bundle API; Tasks 3–5 cover Redis and invalidation; Tasks 6–7 cover frontend store and consumers; Task 8 covers diagnostics and PROJECT_RECORD.md; Task 9 covers verification and deployment.
- No persistent browser storage is introduced.
- Cache keys include global version, tenant version, tenant, environment, and modality.
- Type names are consistent: ModelCatalogBundleView is the API type and AiModelCatalogBundle is the frontend type.
- Existing endpoints remain available for rollback.
