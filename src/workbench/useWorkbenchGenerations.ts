import React from "react";

import {
  createWorkbenchGeneration,
  deleteWorkbenchGeneration,
  getWorkbenchGeneration,
  listWorkbenchGenerations,
  retryWorkbenchGeneration,
  type WorkbenchGenerationView,
} from "../services/v2WorkbenchApi";
import { buildWorkbenchRequestParams } from "./workbenchModelParams";
import { getReferencedAssetIdsForPrompt } from "./workbenchReferences";
import type { WorkbenchDraft } from "./workbenchTypes";

const WORKBENCH_GENERATION_MEMORY_CACHE_TTL_MS = 15_000;
const WORKBENCH_GENERATION_SESSION_CACHE_TTL_MS = 5 * 60 * 1000;
const WORKBENCH_GENERATION_SESSION_CACHE_KEY = "tapflow.workbench.generations.v1";

let generationMemoryCache: {
  generations: WorkbenchGenerationView[];
  updatedAt: number;
} | null = null;

export function clearWorkbenchGenerationMemoryCache() {
  generationMemoryCache = null;
}

function clearWorkbenchGenerationSessionCache() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(WORKBENCH_GENERATION_SESSION_CACHE_KEY);
  } catch {
    // Ignore storage failures; server data remains authoritative.
  }
}

function readWorkbenchGenerationSessionCache() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(WORKBENCH_GENERATION_SESSION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      generations?: unknown;
      updatedAt?: unknown;
    };
    if (
      typeof parsed.updatedAt !== "number"
      || Date.now() - parsed.updatedAt > WORKBENCH_GENERATION_SESSION_CACHE_TTL_MS
      || !Array.isArray(parsed.generations)
    ) {
      clearWorkbenchGenerationSessionCache();
      return null;
    }
    return parsed.generations as WorkbenchGenerationView[];
  } catch {
    clearWorkbenchGenerationSessionCache();
    return null;
  }
}

function writeWorkbenchGenerationSessionCache(generations: WorkbenchGenerationView[]) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      WORKBENCH_GENERATION_SESSION_CACHE_KEY,
      JSON.stringify({
        generations,
        updatedAt: Date.now(),
      }),
    );
  } catch {
    // Ignore quota/private-mode failures; memory cache still improves soft navigation.
  }
}

function readWorkbenchGenerationMemoryCache() {
  if (!generationMemoryCache) return null;
  if (Date.now() - generationMemoryCache.updatedAt > WORKBENCH_GENERATION_MEMORY_CACHE_TTL_MS) {
    generationMemoryCache = null;
    return null;
  }
  return generationMemoryCache.generations;
}

function writeWorkbenchGenerationMemoryCache(generations: WorkbenchGenerationView[]) {
  generationMemoryCache = {
    generations,
    updatedAt: Date.now(),
  };
  writeWorkbenchGenerationSessionCache(generations);
}

function readWorkbenchGenerationCache() {
  const memoryCache = readWorkbenchGenerationMemoryCache();
  if (memoryCache) return memoryCache;
  const sessionCache = readWorkbenchGenerationSessionCache();
  if (sessionCache) {
    generationMemoryCache = {
      generations: sessionCache,
      updatedAt: Date.now(),
    };
  }
  return sessionCache;
}

function mergeGeneration(
  items: WorkbenchGenerationView[],
  next: WorkbenchGenerationView,
): WorkbenchGenerationView[] {
  if (!next?.id) return items;
  const existingIndex = items.findIndex((item) => item.id === next.id);
  if (existingIndex === -1) {
    return [next, ...items].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }
  const clone = [...items];
  clone[existingIndex] = next;
  return clone;
}

function isTerminalStatus(status: string) {
  return status === "succeeded" || status === "failed" || status === "canceled";
}

function isSucceededWithoutResults(generation: WorkbenchGenerationView) {
  const resultCount = generation.batch
    ? generation.batch.children.reduce((count, child) => count + child.results.length, 0)
    : generation.results.length;
  return generation.status === "succeeded" && resultCount === 0;
}

function isBatchTerminal(generation: WorkbenchGenerationView) {
  if (!generation.batch) {
    return isTerminalStatus(generation.status) && !isSucceededWithoutResults(generation);
  }
  return generation.batch.runningCount === 0 && generation.batch.pendingCount === 0;
}

export function useWorkbenchGenerations() {
  const pollingIdsRef = React.useRef(new Set<string>());
  const [generations, setGenerations] = React.useState<WorkbenchGenerationView[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const result = await listWorkbenchGenerations({ limit: 30 });
      setGenerations(result.generations);
      writeWorkbenchGenerationMemoryCache(result.generations);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载工作台历史失败");
    } finally {
      setLoading(false);
    }
  }, []);

  const pollGeneration = React.useCallback(async (generationId: string) => {
    if (pollingIdsRef.current.has(generationId)) return;
    pollingIdsRef.current.add(generationId);
    let emptyResultPolls = 0;
    let failedPolls = 0;

    try {
      while (failedPolls < 12) {
        try {
          const next = await getWorkbenchGeneration(generationId);
          if (!next?.id) {
            throw new Error("生成状态返回为空，正在重试");
          }
          failedPolls = 0;
          setGenerations((current) => {
            const merged = mergeGeneration(current, next);
            writeWorkbenchGenerationMemoryCache(merged);
            return merged;
          });
          if (isSucceededWithoutResults(next) && emptyResultPolls < 6) {
            emptyResultPolls += 1;
            await new Promise((resolve) => window.setTimeout(resolve, 1200));
            continue;
          }
          if (isBatchTerminal(next)) {
            setError(null);
            if (!next.batch && isSucceededWithoutResults(next)) {
              window.setTimeout(() => void refresh(), 900);
            }
            break;
          }
        } catch (err) {
          failedPolls += 1;
          setError(err instanceof Error ? err.message : "刷新生成状态失败，正在重试");
        }
        await new Promise((resolve) => window.setTimeout(resolve, 1800));
      }
    } finally {
      pollingIdsRef.current.delete(generationId);
    }
  }, [refresh]);

  React.useEffect(() => {
    let active = true;
    const cachedGenerations = readWorkbenchGenerationCache();
    if (cachedGenerations) {
      setGenerations(cachedGenerations);
      setLoading(false);
      cachedGenerations
        .filter((generation) => !isBatchTerminal(generation))
        .forEach((generation) => {
          void pollGeneration(generation.id);
        });
    } else {
      setLoading(true);
    }
    void listWorkbenchGenerations({ limit: 30 })
      .then((result) => {
        if (!active) return;
        setGenerations(result.generations);
        writeWorkbenchGenerationMemoryCache(result.generations);
        setError(null);
        result.generations
          .filter((generation) => !isBatchTerminal(generation))
          .forEach((generation) => {
            void pollGeneration(generation.id);
          });
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "加载工作台历史失败");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [pollGeneration]);

  const submit = React.useCallback(async (draft: WorkbenchDraft) => {
    setSubmitting(true);
    try {
      const created = await createWorkbenchGeneration({
        displayMode: draft.displayMode,
        modelId: draft.modelId,
        params: buildWorkbenchRequestParams(draft),
        prompt: draft.prompt.trim(),
        referenceAssetIds: getReferencedAssetIdsForPrompt(draft.prompt, draft.referenceAssetIds),
        referenceUploadIds: getReferencedAssetIdsForPrompt(draft.prompt, draft.referenceUploadIds),
        requestedCount: draft.quantity,
        routeKey: draft.routeKey,
      });
      setGenerations((current) => {
        const merged = mergeGeneration(current, created);
        writeWorkbenchGenerationMemoryCache(merged);
        return merged;
      });
      setError(null);
      if (!isBatchTerminal(created)) {
        void pollGeneration(created.id);
      }
      return created;
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交工作台生成失败");
      throw err;
    } finally {
      setSubmitting(false);
    }
  }, [pollGeneration]);

  const retry = React.useCallback(async (generationId: string) => {
    const created = await retryWorkbenchGeneration(generationId);
    setGenerations((current) => {
      const merged = mergeGeneration(current, created);
      writeWorkbenchGenerationMemoryCache(merged);
      return merged;
    });
    if (!isBatchTerminal(created)) {
      void pollGeneration(created.id);
    }
    return created;
  }, [pollGeneration]);

  const remove = React.useCallback(async (generationId: string) => {
    await deleteWorkbenchGeneration(generationId);
    pollingIdsRef.current.delete(generationId);
    setGenerations((current) => {
      const next = current.filter((generation) => generation.id !== generationId);
      writeWorkbenchGenerationMemoryCache(next);
      return next;
    });
    setError(null);
  }, []);

  return {
    error,
    generations,
    loading,
    remove,
    refresh,
    retry,
    submitting,
    submit,
  };
}
