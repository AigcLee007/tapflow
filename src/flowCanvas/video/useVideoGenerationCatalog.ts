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

type CatalogViewState = {
  catalogKey: string;
  error: string | null;
  loading: boolean;
  models: VideoModelOption[];
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

function createCatalogViewState(catalogKey: string): CatalogViewState {
  const models = cachedOptions(catalogKey);
  return {
    catalogKey,
    error: null,
    loading: !models,
    models: models ?? [],
  };
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
    const routeResults = await Promise.allSettled(
      applicable.map(async (model) => [model.modelKey, await listAiModelRoutes(model.modelKey)] as const),
    );
    const routesByModelKey = Object.fromEntries(
      routeResults.flatMap((result) => result.status === "fulfilled" ? [result.value] : []),
    );
    const options = toVideoModelOptions(catalog, routesByModelKey);
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
  const [catalogState, setCatalogState] = useState<CatalogViewState>(() => createCatalogViewState(catalogKey));
  const [version, setVersion] = useState(0);

  useEffect(() => subscribeToInvalidation(catalogKey, () => {
    setCatalogState(createCatalogViewState(catalogKey));
    setVersion((value) => value + 1);
  }), [catalogKey]);

  useEffect(() => {
    let active = true;
    const generation = currentGeneration(catalogKey);
    const cached = cachedOptions(catalogKey);
    setCatalogState({
      catalogKey,
      error: null,
      loading: !cached,
      models: cached ?? [],
    });
    void loadCatalog(catalogKey, modality).then((next) => {
      if (!active || currentGeneration(catalogKey) !== generation) return;
      setCatalogState({ catalogKey, error: null, loading: false, models: next });
    }).catch((reason: unknown) => {
      if (!active || currentGeneration(catalogKey) !== generation) return;
      setCatalogState({
        catalogKey,
        error: reason instanceof Error ? reason.message : "Failed to load video model catalog",
        loading: false,
        models: [],
      });
    });
    return () => { active = false; };
  }, [catalogKey, modality, version]);

  const retry = useCallback(() => {
    invalidateCatalog(catalogKey);
  }, [catalogKey]);

  const currentState = catalogState.catalogKey === catalogKey
    ? catalogState
    : createCatalogViewState(catalogKey);
  return { models: currentState.models, loading: currentState.loading, error: currentState.error, retry };
}

export function __resetVideoGenerationCatalogCacheForTests() {
  cache.clear();
  requests.clear();
  generations.clear();
  invalidationListeners.clear();
}
