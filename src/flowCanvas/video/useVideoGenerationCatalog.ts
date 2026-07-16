import { useCallback, useEffect, useState } from "react";

import { useAuth } from "../../auth/useAuth";
import { listAiModelCatalog, listAiModelRoutes } from "../../services/v2AiModelCatalogApi";
import { toVideoModelOptions } from "./videoModelCatalog";
import type { VideoModelOption } from "./videoTypes";

type CatalogCacheEntry = {
  generation: number;
  options: VideoModelOption[];
};

type CatalogRequest = {
  generation: number;
  promise: Promise<VideoModelOption[]>;
};

const cache = new Map<string, CatalogCacheEntry>();
const requests = new Map<string, CatalogRequest>();
const generations = new Map<string, number>();
const invalidationListeners = new Map<string, Set<() => void>>();

function createCatalogKey(input: {
  modality: string;
  sessionId: string | null;
  tenantId: string | null;
  userId: string | null;
}) {
  return JSON.stringify(input);
}

function currentGeneration(catalogKey: string) {
  return generations.get(catalogKey) ?? 0;
}

function cachedOptions(catalogKey: string): VideoModelOption[] | undefined {
  const cached = cache.get(catalogKey);
  return cached?.generation === currentGeneration(catalogKey) ? cached.options : undefined;
}

function subscribeToInvalidation(catalogKey: string, listener: () => void) {
  const listeners = invalidationListeners.get(catalogKey) ?? new Set<() => void>();
  listeners.add(listener);
  invalidationListeners.set(catalogKey, listeners);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) invalidationListeners.delete(catalogKey);
  };
}

function invalidateCatalog(catalogKey: string) {
  generations.set(catalogKey, currentGeneration(catalogKey) + 1);
  cache.delete(catalogKey);
  invalidationListeners.get(catalogKey)?.forEach((listener) => listener());
}

async function loadCatalog(catalogKey: string, modality: string): Promise<VideoModelOption[]> {
  const generation = currentGeneration(catalogKey);
  const cached = cachedOptions(catalogKey);
  if (cached) return cached;
  const pending = requests.get(catalogKey);
  if (pending?.generation === generation) return pending.promise;
  const request: CatalogRequest = {
    generation,
    promise: Promise.resolve([]),
  };
  request.promise = listAiModelCatalog(modality).then(async (catalog) => {
    const applicable = catalog.filter((model) => model.modality === modality && model.status === "active");
    const routes = await Promise.all(applicable.map(async (model) => [model.modelKey, await listAiModelRoutes(model.modelKey)] as const));
    const options = toVideoModelOptions(catalog, Object.fromEntries(routes));
    if (currentGeneration(catalogKey) === generation) {
      cache.set(catalogKey, { generation, options });
    }
    return options;
  }).finally(() => {
    if (requests.get(catalogKey) === request) requests.delete(catalogKey);
  });
  requests.set(catalogKey, request);
  return request.promise;
}

export function useVideoGenerationCatalog(modality = "video") {
  const { sessionId, tenant, user } = useAuth();
  const catalogKey = createCatalogKey({
    modality,
    sessionId,
    tenantId: tenant?.id ?? null,
    userId: user?.id ?? null,
  });
  const [models, setModels] = useState<VideoModelOption[]>(() => cachedOptions(catalogKey) ?? []);
  const [loading, setLoading] = useState(() => !cachedOptions(catalogKey));
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => subscribeToInvalidation(catalogKey, () => {
    setModels([]);
    setError(null);
    setLoading(true);
    setVersion((value) => value + 1);
  }), [catalogKey]);

  useEffect(() => {
    let active = true;
    const generation = currentGeneration(catalogKey);
    const cached = cachedOptions(catalogKey);
    setModels(cached ?? []);
    setError(null);
    setLoading(!cached);
    void loadCatalog(catalogKey, modality).then((next) => {
      if (!active || currentGeneration(catalogKey) !== generation) return;
      setModels(next);
      setError(null);
    }).catch((reason: unknown) => {
      if (!active || currentGeneration(catalogKey) !== generation) return;
      setModels([]);
      setError(reason instanceof Error ? reason.message : "Failed to load video model catalog");
    }).finally(() => {
      if (active && currentGeneration(catalogKey) === generation) setLoading(false);
    });
    return () => { active = false; };
  }, [catalogKey, modality, version]);

  const retry = useCallback(() => {
    invalidateCatalog(catalogKey);
  }, [catalogKey]);

  return { models, loading, error, retry };
}

export function __resetVideoGenerationCatalogCacheForTests() {
  cache.clear();
  requests.clear();
  generations.clear();
  invalidationListeners.clear();
}
