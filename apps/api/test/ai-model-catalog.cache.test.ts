import { describe, expect, test, vi } from "vitest";

import {
  RedisAiModelCatalogCache,
  type AiModelCatalogCacheBundleContext,
  type AiModelCatalogCacheRedis,
} from "../src/modules/ai-model-catalog/ai-model-catalog.cache.js";

const context: AiModelCatalogCacheBundleContext = {
  environment: "staging",
  modality: "image",
  tenantId: "tenant-1",
};

const bundle = {
  models: [],
  routesByModelKey: {},
};

function createRedis(overrides: Partial<AiModelCatalogCacheRedis> = {}): AiModelCatalogCacheRedis {
  return {
    get: vi.fn(async () => null),
    incr: vi.fn(async () => 1),
    set: vi.fn(async () => "OK"),
    ...overrides,
  };
}

describe("RedisAiModelCatalogCache", () => {
  test("reads and writes bundles using global and tenant versions", async () => {
    const redis = createRedis({
      get: vi.fn()
        .mockResolvedValueOnce("4")
        .mockResolvedValueOnce("7")
        .mockResolvedValueOnce(JSON.stringify(bundle))
        .mockResolvedValueOnce("4")
        .mockResolvedValueOnce("7"),
    });
    const cache = new RedisAiModelCatalogCache(redis);

    await expect(cache.get(context)).resolves.toEqual(bundle);
    await cache.set(context, bundle);

    expect(redis.get).toHaveBeenNthCalledWith(1, "tapflow:ai-catalog:version:global");
    expect(redis.get).toHaveBeenNthCalledWith(2, "tapflow:ai-catalog:version:tenant:tenant-1");
    expect(redis.get).toHaveBeenNthCalledWith(3, "tapflow:ai-catalog:v1:4:7:tenant-1:staging:image");
    expect(redis.get).toHaveBeenNthCalledWith(4, "tapflow:ai-catalog:version:global");
    expect(redis.get).toHaveBeenNthCalledWith(5, "tapflow:ai-catalog:version:tenant:tenant-1");
    expect(redis.set).toHaveBeenCalledWith(
      "tapflow:ai-catalog:v1:4:7:tenant-1:staging:image",
      JSON.stringify(bundle),
      "EX",
      30,
    );
  });

  test("defaults missing versions to zero and invalidates global and tenant versions", async () => {
    const redis = createRedis();
    const cache = new RedisAiModelCatalogCache(redis);

    await cache.set(context, bundle);
    await cache.invalidateGlobal();
    await cache.invalidateTenant(context.tenantId);

    expect(redis.set).toHaveBeenCalledWith(
      "tapflow:ai-catalog:v1:0:0:tenant-1:staging:image",
      JSON.stringify(bundle),
      "EX",
      30,
    );
    expect(redis.incr).toHaveBeenNthCalledWith(1, "tapflow:ai-catalog:version:global");
    expect(redis.incr).toHaveBeenNthCalledWith(2, "tapflow:ai-catalog:version:tenant:tenant-1");
  });

  test("returns a miss and bypasses Redis errors", async () => {
    const error = new Error("redis unavailable");
    const redis = createRedis({
      get: vi.fn(async () => { throw error; }),
      set: vi.fn(async () => { throw error; }),
      incr: vi.fn(async () => { throw error; }),
    });
    const logger = { error: vi.fn() };
    const cache = new RedisAiModelCatalogCache(redis, logger);

    await expect(cache.get(context)).resolves.toBeNull();
    await expect(cache.set(context, bundle)).resolves.toBeUndefined();
    await expect(cache.invalidateGlobal()).resolves.toBeUndefined();
    await expect(cache.invalidateTenant(context.tenantId)).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });
});
