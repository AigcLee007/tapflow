import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { WorkbenchGenerationView } from "../services/v2WorkbenchApi";
import {
  createWorkbenchGenerationTracker,
  findFirstRenderableResult,
  type WorkbenchPerformanceTracker,
} from "./useWorkbenchPerformance";

function createGeneration(overrides: Partial<WorkbenchGenerationView> = {}): WorkbenchGenerationView {
  return {
    batch: null,
    batchId: null,
    batchIndex: null,
    batchRole: "single",
    batchTotal: null,
    chargedCredits: null,
    createdAt: new Date().toISOString(),
    displayMode: "merged",
    errorJson: null,
    estimatedCredits: 1,
    finishedAt: null,
    id: "generation-1",
    modelId: "model-1",
    params: {},
    parentGenerationId: null,
    prompt: "prompt",
    referenceAssetIds: [],
    referenceUploadIds: [],
    requestedCount: 1,
    reservedCredits: 1,
    reserveLedgerId: "ledger-1",
    results: [],
    routeKey: "image.default",
    sessionId: null,
    startedAt: null,
    status: "queued",
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("useWorkbenchPerformance helpers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test("findFirstRenderableResult prefers direct results before batch children", () => {
    expect(findFirstRenderableResult(
      createGeneration({
        results: [
          {
            assetId: "asset-1",
            createdAt: new Date().toISOString(),
            downloadUrl: null,
            downloadUrlExpiresAt: null,
            height: 512,
            id: "result-1",
            metadata: {},
            mimeType: "image/png",
            originalFilename: "result-1.png",
            previewUrl: "https://example.com/result-1.png",
            previewUrlExpiresAt: null,
            sortOrder: 0,
            status: "available",
            width: 512,
          },
        ],
      }),
    )?.id).toBe("result-1");
  });

  test("tracker emits marks and measures for generation lifecycle and first visible image", () => {
    const markNow = vi.fn();
    const markMeasure = vi.fn();
    const clearPerformanceMeasure = vi.fn();

    const tracker = createWorkbenchGenerationTracker({
      clearPerformanceMeasure,
      markMeasure,
      markNow,
    });

    const generation = createGeneration({
      id: "generation-perf-1",
      results: [
        {
          assetId: "asset-perf-1",
          createdAt: new Date().toISOString(),
          downloadUrl: null,
          downloadUrlExpiresAt: null,
          height: 1024,
          id: "result-perf-1",
          metadata: {},
          mimeType: "image/png",
          originalFilename: "result-perf-1.png",
          previewUrl: "https://example.com/result-perf-1.png",
          previewUrlExpiresAt: null,
          sortOrder: 0,
          status: "available",
          width: 1024,
        },
      ],
      status: "succeeded",
    });

    tracker.markSubmit("submit-perf-1");
    tracker.markGenerationCreated(generation, "submit-perf-1");
    tracker.markPreviewReady(generation);
    tracker.markFirstImageLoadStart(generation.id, "result-perf-1", "asset-perf-1");
    tracker.markFirstImageLoadEnd(generation.id, "result-perf-1", "asset-perf-1");
    tracker.markFirstImageVisible(generation.id, "result-perf-1", "asset-perf-1");

    expect(markNow).toHaveBeenCalledWith("workbench-submit-click:submit-perf-1");
    expect(markNow).toHaveBeenCalledWith("workbench-generation-created:generation-perf-1");
    expect(markNow).toHaveBeenCalledWith("workbench-generation-preview-url-ready:generation-perf-1");
    expect(markNow).toHaveBeenCalledWith("workbench-first-image-load-start:generation-perf-1:result-perf-1");
    expect(markNow).toHaveBeenCalledWith("workbench-first-image-load-end:generation-perf-1:result-perf-1");
    expect(markNow).toHaveBeenCalledWith("workbench-first-image-visible:generation-perf-1:result-perf-1");

    expect(markMeasure).toHaveBeenCalledWith(
      "workbench-submit-to-created:generation-perf-1",
      "workbench-submit-click:submit-perf-1",
      "workbench-generation-created:generation-perf-1",
    );
    expect(markMeasure).toHaveBeenCalledWith(
      "workbench-submit-to-preview-url-ready:generation-perf-1",
      "workbench-submit-click:submit-perf-1",
      "workbench-generation-preview-url-ready:generation-perf-1",
    );
    expect(markMeasure).toHaveBeenCalledWith(
      "workbench-submit-to-first-image-visible:generation-perf-1",
      "workbench-submit-click:submit-perf-1",
      "workbench-first-image-visible:generation-perf-1:result-perf-1",
    );
    expect(markMeasure).toHaveBeenCalledWith(
      "workbench-preview-url-ready-to-first-image-visible:generation-perf-1",
      "workbench-generation-preview-url-ready:generation-perf-1",
      "workbench-first-image-visible:generation-perf-1:result-perf-1",
    );
    expect(clearPerformanceMeasure).toHaveBeenCalled();
  });
});
