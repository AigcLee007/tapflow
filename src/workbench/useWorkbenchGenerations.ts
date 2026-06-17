import React from "react";

import {
  createWorkbenchGeneration,
  getWorkbenchGeneration,
  listWorkbenchGenerations,
  retryWorkbenchGeneration,
  type WorkbenchGenerationView,
} from "../services/v2WorkbenchApi";
import { buildWorkbenchRequestParams } from "./workbenchModelParams";
import { getReferencedAssetIdsForPrompt } from "./workbenchReferences";
import type { WorkbenchDraft } from "./workbenchTypes";

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
  return generation.status === "succeeded" && generation.results.length === 0;
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
          setGenerations((current) => mergeGeneration(current, next));
          if (isSucceededWithoutResults(next) && emptyResultPolls < 6) {
            emptyResultPolls += 1;
            await new Promise((resolve) => window.setTimeout(resolve, 1200));
            continue;
          }
          if (isTerminalStatus(next.status)) {
            setError(null);
            if (isSucceededWithoutResults(next)) {
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
    setLoading(true);
    void listWorkbenchGenerations({ limit: 30 })
      .then((result) => {
        if (!active) return;
        setGenerations(result.generations);
        setError(null);
        result.generations
          .filter((generation) => !isTerminalStatus(generation.status) || isSucceededWithoutResults(generation))
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
      setGenerations((current) => mergeGeneration(current, created));
      setError(null);
      if (!isTerminalStatus(created.status) || isSucceededWithoutResults(created)) {
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
    setGenerations((current) => mergeGeneration(current, created));
    if (!isTerminalStatus(created.status)) {
      void pollGeneration(created.id);
    }
    return created;
  }, [pollGeneration]);

  return {
    error,
    generations,
    loading,
    refresh,
    retry,
    submitting,
    submit,
  };
}
