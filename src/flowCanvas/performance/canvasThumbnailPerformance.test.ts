import { describe, expect, test, vi } from "vitest";

import { createCanvasThumbnailPerformanceTracker } from "./canvasThumbnailPerformance";

describe("canvas thumbnail performance tracker", () => {
  test("marks draft, signing, first thumb, ninety percent visibility, and preview upgrade once", () => {
    const clearPerformanceMeasure = vi.fn();
    const markMeasure = vi.fn();
    const markNow = vi.fn();
    const tracker = createCanvasThumbnailPerformanceTracker({ clearPerformanceMeasure, markMeasure, markNow });
    const assetIds = Array.from({ length: 12 }, (_, index) => `asset-${index}`);

    tracker.reset("project-1");
    tracker.markDraftReady();
    const fullSigning = tracker.beginSigning(assetIds);
    const duplicateSigning = tracker.beginSigning(["asset-0"]);
    tracker.endSigning(duplicateSigning);
    tracker.endSigning(fullSigning);
    assetIds.slice(0, 11).forEach((assetId) => tracker.markThumbVisible(assetId));
    tracker.markThumbVisible("asset-0");
    tracker.markPreviewVisible("asset-0");
    tracker.markPreviewVisible("asset-1");

    expect(markNow).toHaveBeenCalledWith("canvas-draft-ready");
    expect(markNow).toHaveBeenCalledWith("canvas-thumb-signing-start");
    expect(markNow).toHaveBeenCalledWith("canvas-thumb-signing-end");
    expect(markNow).toHaveBeenCalledWith("canvas-first-thumb-visible");
    expect(markNow).toHaveBeenCalledWith("canvas-visible-thumbs-90pct");
    expect(markNow).toHaveBeenCalledWith("canvas-preview-upgrade-visible");
    expect(markNow).toHaveBeenCalledTimes(6);
    expect(markMeasure).toHaveBeenCalledWith(
      "canvas-draft-ready-to-first-thumb",
      "canvas-draft-ready",
      "canvas-first-thumb-visible",
    );
    expect(markMeasure).toHaveBeenCalledWith(
      "canvas-thumb-signing",
      "canvas-thumb-signing-start",
      "canvas-thumb-signing-end",
    );
    expect(clearPerformanceMeasure).toHaveBeenCalledWith("canvas-draft-ready-to-first-thumb");
  });

  test("resets state between projects and ignores unexpected assets", () => {
    const markNow = vi.fn();
    const tracker = createCanvasThumbnailPerformanceTracker({
      clearPerformanceMeasure: vi.fn(),
      markMeasure: vi.fn(),
      markNow,
    });

    tracker.reset("project-1");
    const firstSigning = tracker.beginSigning(["asset-1"]);
    tracker.markThumbVisible("other-asset");
    tracker.reset("project-2");
    tracker.beginSigning(["asset-2"]);
    tracker.endSigning(firstSigning);
    tracker.markThumbVisible("asset-2");

    expect(markNow).toHaveBeenCalledTimes(4);
    expect(markNow).toHaveBeenCalledWith("canvas-first-thumb-visible");
    expect(markNow).toHaveBeenLastCalledWith("canvas-visible-thumbs-90pct");
  });

  test("ignores a signing completion that belongs to a previous project", () => {
    const markNow = vi.fn();
    const tracker = createCanvasThumbnailPerformanceTracker({
      clearPerformanceMeasure: vi.fn(),
      markMeasure: vi.fn(),
      markNow,
    });

    tracker.reset("project-a");
    const projectASigning = tracker.beginSigning(["asset-a"]);
    tracker.reset("project-b");
    const projectBSigning = tracker.beginSigning(["asset-b"]);
    tracker.endSigning(projectASigning);

    expect(markNow).not.toHaveBeenCalledWith("canvas-thumb-signing-end");

    tracker.endSigning(projectBSigning);
    expect(markNow).toHaveBeenCalledTimes(3);
    expect(markNow).toHaveBeenLastCalledWith("canvas-thumb-signing-end");
  });
});
