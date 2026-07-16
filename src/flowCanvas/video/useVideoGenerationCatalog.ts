import { useCallback, useEffect, useState } from "react";

import { listAiModelCatalog, listAiModelRoutes } from "../../services/v2AiModelCatalogApi";
import { toVideoModelOptions } from "./videoModelCatalog";
import type { VideoModelOption } from "./videoTypes";

const cache = new Map<string, VideoModelOption[]>();
const requests = new Map<string, Promise<VideoModelOption[]>>();

async function loadCatalog(modality: string): Promise<VideoModelOption[]> {
  const cached = cache.get(modality);
  if (cached) return cached;
  const pending = requests.get(modality);
  if (pending) return pending;
  const request = listAiModelCatalog(modality).then(async (catalog) => {
    const applicable = catalog.filter((model) => model.modality === modality && model.status === "active");
    const routes = await Promise.all(applicable.map(async (model) => [model.modelKey, await listAiModelRoutes(model.modelKey)] as const));
    const options = toVideoModelOptions(catalog, Object.fromEntries(routes));
    cache.set(modality, options);
    return options;
  }).finally(() => requests.delete(modality));
  requests.set(modality, request);
  return request;
}

export function useVideoGenerationCatalog(modality = "video") {
  const [models, setModels] = useState<VideoModelOption[]>(() => cache.get(modality) ?? []);
  const [loading, setLoading] = useState(() => !cache.has(modality));
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(!cache.has(modality));
    void loadCatalog(modality).then((next) => {
      if (!active) return;
      setModels(next);
      setError(null);
    }).catch((reason: unknown) => {
      if (!active) return;
      setModels([]);
      setError(reason instanceof Error ? reason.message : "Failed to load video model catalog");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [modality, version]);

  const retry = useCallback(() => {
    cache.delete(modality);
    requests.delete(modality);
    setVersion((value) => value + 1);
  }, [modality]);

  return { models, loading, error, retry };
}

export function __resetVideoGenerationCatalogCacheForTests() {
  cache.clear();
  requests.clear();
}
