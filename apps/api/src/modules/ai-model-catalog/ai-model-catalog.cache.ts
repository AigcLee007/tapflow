import type { ModelCatalogBundleView } from "./ai-model-catalog.service.js";

export const AI_MODEL_CATALOG_CACHE_TTL_SECONDS = 30;
export const AI_MODEL_CATALOG_CACHE_OPERATION_TIMEOUT_MS = 200;
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
  createSnapshot?(context: AiModelCatalogCacheBundleContext): Promise<string | null>;
  get(context: AiModelCatalogCacheBundleContext, snapshot?: string | null): Promise<ModelCatalogBundleView | null>;
  set(context: AiModelCatalogCacheBundleContext, bundle: ModelCatalogBundleView, snapshot?: string | null): Promise<void>;
  invalidateGlobal(): Promise<void>;
  invalidateTenant(tenantId: string): Promise<void>;
}

export class RedisAiModelCatalogCache implements AiModelCatalogCache {
  constructor(
    private readonly redis: AiModelCatalogCacheRedis,
    private readonly logger: AiModelCatalogCacheLogger = console,
  ) {}

  async createSnapshot(context: AiModelCatalogCacheBundleContext): Promise<string | null> {
    try {
      return await this.buildCacheKey(context);
    } catch (error) {
      this.logError(error, "ai model catalog cache key resolution failed");
      return null;
    }
  }

  async get(context: AiModelCatalogCacheBundleContext, snapshot?: string | null): Promise<ModelCatalogBundleView | null> {
    try {
      const key = snapshot ?? await this.buildCacheKey(context);
      const serialized = await this.withTimeout(this.redis.get(key));
      if (!serialized) return null;
      const parsed: unknown = JSON.parse(serialized);
      if (!isModelCatalogBundle(parsed)) {
        this.logError(new Error("invalid cached model catalog bundle"), "ai model catalog cache payload invalid");
        return null;
      }
      return parsed;
    } catch (error) {
      this.logError(error, "ai model catalog cache read failed");
      return null;
    }
  }

  async set(context: AiModelCatalogCacheBundleContext, bundle: ModelCatalogBundleView, snapshot?: string | null): Promise<void> {
    try {
      const key = snapshot ?? await this.buildCacheKey(context);
      await this.withTimeout(this.redis.set(key, JSON.stringify(bundle), "EX", AI_MODEL_CATALOG_CACHE_TTL_SECONDS));
    } catch (error) {
      this.logError(error, "ai model catalog cache write failed");
    }
  }

  async invalidateGlobal(): Promise<void> {
    try {
      await this.withTimeout(this.redis.incr(GLOBAL_VERSION_KEY));
    } catch (error) {
      this.logError(error, "ai model catalog global cache invalidation failed");
    }
  }

  async invalidateTenant(tenantId: string): Promise<void> {
    try {
      await this.withTimeout(this.redis.incr(this.tenantVersionKey(tenantId)));
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
    return normalizeVersion(await this.withTimeout(this.redis.get(key)));
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

  private async withTimeout<T>(operation: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("ai model catalog cache operation timed out")), AI_MODEL_CATALOG_CACHE_OPERATION_TIMEOUT_MS);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

function normalizeVersion(value: string | null): number {
  const version = Number.parseInt(value ?? "", 10);
  return Number.isSafeInteger(version) && version >= 0 ? version : 0;
}

function isModelCatalogBundle(value: unknown): value is ModelCatalogBundleView {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return Array.isArray(candidate.models)
    && candidate.models.every(isRecord)
    && Boolean(candidate.routesByModelKey)
    && typeof candidate.routesByModelKey === "object"
    && !Array.isArray(candidate.routesByModelKey)
    && Object.values(candidate.routesByModelKey as Record<string, unknown>).every((routes) => Array.isArray(routes) && routes.every(isRecord));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
