import type { WorkbenchGenerationView, WorkbenchResultView } from "../services/v2WorkbenchApi";
import { clearPerformanceMeasure, markMeasure, markNow } from "../performance/performanceMarks";

type PerformanceHelpers = {
  clearPerformanceMeasure: (name: string) => void;
  markMeasure: (name: string, start: string, end: string) => void;
  markNow: (name: string) => void;
};

export type WorkbenchPerformanceTracker = ReturnType<typeof createWorkbenchGenerationTracker>;

function generationMark(base: string, generationId: string): string {
  return `${base}:${generationId}`;
}

function resultMark(base: string, generationId: string, resultId: string): string {
  return `${base}:${generationId}:${resultId}`;
}

function hasRenderableUrl(result: WorkbenchResultView | null | undefined): result is WorkbenchResultView {
  if (!result) return false;
  return Boolean(result.previewUrl || result.downloadUrl);
}

export function findFirstRenderableResult(generation: WorkbenchGenerationView | null | undefined): WorkbenchResultView | null {
  if (!generation) return null;

  const direct = generation.results.find((result) => hasRenderableUrl(result));
  if (direct) return direct;

  const batchChildren = generation.batch?.children ?? [];
  for (const child of batchChildren) {
    const match = child.results.find((result) => hasRenderableUrl(result));
    if (match) return match;
  }

  return null;
}

export function createWorkbenchGenerationTracker(
  helpers: PerformanceHelpers = {
    clearPerformanceMeasure,
    markMeasure,
    markNow,
  },
) {
  const submitMarkKeyByGeneration = new Map<string, string>();
  const previewReadyByGeneration = new Set<string>();
  const firstLoadStartByResult = new Set<string>();
  const firstLoadEndByResult = new Set<string>();
  const firstVisibleByResult = new Set<string>();

  function measure(name: string, start: string, end: string) {
    helpers.clearPerformanceMeasure(name);
    helpers.markMeasure(name, start, end);
  }

  return {
    markSubmit(generationId: string) {
      helpers.markNow(generationMark("workbench-submit-click", generationId));
    },
    markGenerationCreated(generation: WorkbenchGenerationView, submitKey?: string) {
      const submitMarkKey = submitKey ?? generation.id;
      submitMarkKeyByGeneration.set(generation.id, submitMarkKey);
      const createdMark = generationMark("workbench-generation-created", generation.id);
      const submitMark = generationMark("workbench-submit-click", submitMarkKey);
      helpers.markNow(createdMark);
      measure(generationMark("workbench-submit-to-created", generation.id), submitMark, createdMark);
    },
    markPreviewReady(generation: WorkbenchGenerationView) {
      if (previewReadyByGeneration.has(generation.id)) return;
      const result = findFirstRenderableResult(generation);
      if (!result) return;

      previewReadyByGeneration.add(generation.id);
      const previewMark = generationMark("workbench-generation-preview-url-ready", generation.id);
      const submitMark = generationMark("workbench-submit-click", submitMarkKeyByGeneration.get(generation.id) ?? generation.id);
      helpers.markNow(previewMark);
      measure(generationMark("workbench-submit-to-preview-url-ready", generation.id), submitMark, previewMark);
    },
    markFirstImageLoadStart(generationId: string, resultId: string, _assetId?: string | null) {
      const key = `${generationId}:${resultId}`;
      if (firstLoadStartByResult.has(key)) return;
      firstLoadStartByResult.add(key);
      helpers.markNow(resultMark("workbench-first-image-load-start", generationId, resultId));
    },
    markFirstImageLoadEnd(generationId: string, resultId: string, _assetId?: string | null) {
      const key = `${generationId}:${resultId}`;
      if (firstLoadEndByResult.has(key)) return;
      firstLoadEndByResult.add(key);
      helpers.markNow(resultMark("workbench-first-image-load-end", generationId, resultId));
    },
    markFirstImageVisible(generationId: string, resultId: string, _assetId?: string | null) {
      const key = `${generationId}:${resultId}`;
      if (firstVisibleByResult.has(key)) return;
      firstVisibleByResult.add(key);

      const visibleMark = resultMark("workbench-first-image-visible", generationId, resultId);
      const submitMark = generationMark("workbench-submit-click", submitMarkKeyByGeneration.get(generationId) ?? generationId);
      const previewMark = generationMark("workbench-generation-preview-url-ready", generationId);
      helpers.markNow(visibleMark);
      measure(generationMark("workbench-submit-to-first-image-visible", generationId), submitMark, visibleMark);
      measure(generationMark("workbench-preview-url-ready-to-first-image-visible", generationId), previewMark, visibleMark);
    },
  };
}
