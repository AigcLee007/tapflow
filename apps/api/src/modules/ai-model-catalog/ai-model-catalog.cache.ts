import type { ModelCatalogBundleView } from "./ai-model-catalog.service.js";

export const AI_MODEL_CATALOG_CACHE_TTL_SECONDS = 30;
const GLOBAL_VERSION_KEY = "tapflow:ai-catalog:version:global";

export type AiModelCatalogCacheBundleContext = {
  environment: string;
  modality: string;
  tenantId: string;
};

export type AiModelCatalogCacheRedis = {
  get(key: string): Promise<string | null>;
  incr(key: string): Promise<number>;
  set(key: string, value: string, mode: "EX", duration: number): Promise<unknown>;
};

export type AiModelCatalogCacheLogger = {
  error(payload: unknown, message?: string): void;
};

export interface AiModelCatalogCache {
  get(context: AiModelCatalogCacheBundleContext): Promise<ModelCatalogBundleView | null>;
  set(context: AiModelCatalogCacheBundleContext, bundle: ModelCatalogBundleView): Promise<void>;
  invalidateGlobal(): Promise<void>;
  invalidateTenant(tenantId: string): Promise<void>;
}

export class RedisAiModelCatalogCache implements AiModelCatalogCache {
  constructor(
    private readonly redis: AiModelCatalogCacheRedis,
    private readonly logger: AiModelCatalogCacheLogger = console,
  ) {}

  async get(context: AiModelCatalogCacheBundleContext): Promise<ModelCatalogBundleView | null> {
    try {
      const key = await this.buildCacheKey(context);
      const serialized = await this.redis.get(key);
      if (!serialized) return null;
      return JSON.parse(serialized) as ModelCatalogBundleView;
    } catch (error) {
      this.logError(error, "ai model catalog cache read failed");
      return null;
    }
  }

  async set(context: AiModelCatalogCacheBundleContext, bundle: ModelCatalogBundleView): Promise<void> {
    try {
      const key = await this.buildCacheKey(context);
      await this.redis.set(key, JSON.stringify(bundle), "EX", AI_MODEL_CATALOG_CACHE_TTL_SECONDS);
    } catch (error) {
      this.logError(error, "ai model catalog cache write failed");
    }
  }

  async invalidateGlobal(): Promise<void> {
    try {
      await this.redis.incr(GLOBAL_VERSION_KEY);
    } catch (error) {
      this.logError(error, "ai model catalog global cache invalidation failed");
    }
  }

  async invalidateTenant(tenantId: string): Promise<void> {
    try {
      await this.redis.incr(this.tenantVersionKey(tenantId));
    } catch (error) {
      this.logError(error, "ai model catalog tenant cache invalidation failed");
    }
  }

  private async buildCacheKey(context: AiModelCatalogCacheBundleContext): Promise<string> {
    const [globalVersion, tenantVersion] = await Promise.all([
      this.readVersion(GLOBAL_VERSION_KEY),
      this.readVersion(this.tenantVersionKey(context.tenantId)),
    ]);
    return [
      "tapflow:ai-catalog:v1",
      globalVersion,
      tenantVersion,
      context.tenantId,
      context.environment.trim() || "production",
      context.modality.trim(),
    ].join(":");
  }

  private async readVersion(key: string): Promise<number> {
    return normalizeVersion(await this.redis.get(key));
  }

  private tenantVersionKey(tenantId: string): string {
    return `tapflow:ai-catalog:version:tenant:${tenantId}`;
  }

  private logError(error: unknown, message: string): void {
    try {
      this.logger.error({ err: error }, message);
    } catch {
      // Logging must never turn a cache bypass into a failed catalog response.
    }
  }
}

function normalizeVersion(value: string | null): number {
  const version = Number.parseInt(value ?? "", 10);
  return Number.isSafeInteger(version) && version >= 0 ? version : 0;
}
