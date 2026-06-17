import React from "react";

import {
  createWorkbenchGeneration,
  getWorkbenchGeneration,
  listWorkbenchGenerations,
  retryWorkbenchGeneration,
  type WorkbenchGenerationView,
} from "../services/v2WorkbenchApi";
import type { WorkbenchDraft } from "./workbenchTypes";
import { buildWorkbenchRequestParams } from "./workbenchModelParams";

function mergeGeneration(
  items: WorkbenchGenerationView[],
  next: WorkbenchGenerationView,
): WorkbenchGenerationView[] {
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

export function useWorkbenchGenerations() {
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

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const pollGeneration = React.useCallback(async (generationId: string) => {
    let active = true;
    while (active) {
      const next = await getWorkbenchGeneration(generationId);
      setGenerations((current) => mergeGeneration(current, next));
      if (isTerminalStatus(next.status)) {
        active = false;
        break;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 1800));
    }
  }, []);

  const submit = React.useCallback(async (draft: WorkbenchDraft) => {
    setSubmitting(true);
    try {
      const created = await createWorkbenchGeneration({
        displayMode: draft.displayMode,
        modelId: draft.modelId,
        params: buildWorkbenchRequestParams(draft),
        prompt: draft.prompt.trim(),
        referenceAssetIds: draft.referenceAssetIds,
        requestedCount: draft.quantity,
        routeKey: draft.routeKey,
      });
      setGenerations((current) => mergeGeneration(current, created));
      setError(null);
      if (!isTerminalStatus(created.status)) {
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
