import { useCallback, useEffect, useState } from "react";

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

function currentGeneration(modality: string) {
  return generations.get(modality) ?? 0;
}

function cachedOptions(modality: string): VideoModelOption[] | undefined {
  const cached = cache.get(modality);
  return cached?.generation === currentGeneration(modality) ? cached.options : undefined;
}

function subscribeToInvalidation(modality: string, listener: () => void) {
  const listeners = invalidationListeners.get(modality) ?? new Set<() => void>();
  listeners.add(listener);
  invalidationListeners.set(modality, listeners);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) invalidationListeners.delete(modality);
  };
}

function invalidateCatalog(modality: string) {
  generations.set(modality, currentGeneration(modality) + 1);
  cache.delete(modality);
  invalidationListeners.get(modality)?.forEach((listener) => listener());
}

async function loadCatalog(modality: string): Promise<VideoModelOption[]> {
  const generation = currentGeneration(modality);
  const cached = cachedOptions(modality);
  if (cached) return cached;
  const pending = requests.get(modality);
  if (pending?.generation === generation) return pending.promise;
  const request: CatalogRequest = {
    generation,
    promise: Promise.resolve([]),
  };
  request.promise = listAiModelCatalog(modality).then(async (catalog) => {
    const applicable = catalog.filter((model) => model.modality === modality && model.status === "active");
    const routes = await Promise.all(applicable.map(async (model) => [model.modelKey, await listAiModelRoutes(model.modelKey)] as const));
    const options = toVideoModelOptions(catalog, Object.fromEntries(routes));
    if (currentGeneration(modality) === generation) {
      cache.set(modality, { generation, options });
    }
    return options;
  }).finally(() => {
    if (requests.get(modality) === request) requests.delete(modality);
  });
  requests.set(modality, request);
  return request.promise;
}

export function useVideoGenerationCatalog(modality = "video") {
  const [models, setModels] = useState<VideoModelOption[]>(() => cachedOptions(modality) ?? []);
  const [loading, setLoading] = useState(() => !cachedOptions(modality));
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => subscribeToInvalidation(modality, () => {
    setModels([]);
    setError(null);
    setLoading(true);
    setVersion((value) => value + 1);
  }), [modality]);

  useEffect(() => {
    let active = true;
    const generation = currentGeneration(modality);
    setLoading(!cachedOptions(modality));
    void loadCatalog(modality).then((next) => {
      if (!active || currentGeneration(modality) !== generation) return;
      setModels(next);
      setError(null);
    }).catch((reason: unknown) => {
      if (!active || currentGeneration(modality) !== generation) return;
      setModels([]);
      setError(reason instanceof Error ? reason.message : "Failed to load video model catalog");
    }).finally(() => {
      if (active && currentGeneration(modality) === generation) setLoading(false);
    });
    return () => { active = false; };
  }, [modality, version]);

  const retry = useCallback(() => {
    invalidateCatalog(modality);
  }, [modality]);

  return { models, loading, error, retry };
}

export function __resetVideoGenerationCatalogCacheForTests() {
  cache.clear();
  requests.clear();
  generations.clear();
  invalidationListeners.clear();
}
