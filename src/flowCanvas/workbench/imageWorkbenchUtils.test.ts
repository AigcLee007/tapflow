import { describe, expect, test } from "vitest";

import type { FlowNodeData, FlowRuntimeNodeOutput } from "../types";
import {
  deriveWorkbenchBatches,
  getProjectCanvasPath,
  getProjectWorkbenchPath,
  getPreferredProjectMode,
  getWorkbenchResultItems,
  isMobileWorkbenchViewport,
  isWorkbenchNodeData,
  markWorkbenchNodeData,
} from "./imageWorkbenchUtils";

describe("imageWorkbenchUtils routing", () => {
  test("builds explicit project mode paths", () => {
    expect(getProjectWorkbenchPath("project 1")).toBe("/projects/project%201/workbench");
    expect(getProjectCanvasPath("project 1")).toBe("/projects/project%201/canvas");
  });

  test("chooses workbench for mobile-like viewports", () => {
    expect(getPreferredProjectMode({ coarsePointer: true, width: 1024 })).toBe("workbench");
    expect(getPreferredProjectMode({ coarsePointer: false, width: 390 })).toBe("workbench");
    expect(getPreferredProjectMode({ coarsePointer: false, width: 1200 })).toBe("canvas");
  });

  test("detects mobile workbench viewport from browser capabilities", () => {
    expect(isMobileWorkbenchViewport({ coarsePointer: true, width: 1200 })).toBe(true);
    expect(isMobileWorkbenchViewport({ coarsePointer: false, width: 767 })).toBe(true);
    expect(isMobileWorkbenchViewport({ coarsePointer: false, width: 768 })).toBe(false);
  });

  test("adds stable workbench metadata to image node data", () => {
    const marked = markWorkbenchNodeData(
      { kind: "image", title: "Image" } as Partial<FlowNodeData>,
      { batchId: "batch-1", createdAt: 1780000000000 },
    );
    expect(marked.workbench).toEqual({
      batchId: "batch-1",
      createdAt: 1780000000000,
      source: "image-workbench",
    });
    expect(isWorkbenchNodeData(marked)).toBe(true);
  });
});

describe("imageWorkbenchUtils results", () => {
  test("prefers generated results before runtime assets", () => {
    const results = getWorkbenchResultItems({
      data: {
        generatedResults: [{ createdAt: 10, id: "r1", url: "https://cdn.test/a.png" }],
      } as Partial<FlowNodeData>,
      runtimeOutput: {
        assets: [{ assetId: "asset-1", downloadUrl: "https://cdn.test/fallback.png", kind: "image", mimeType: "image/png" }],
      } satisfies FlowRuntimeNodeOutput,
    });

    expect(results).toEqual([{ createdAt: 10, id: "r1", url: "https://cdn.test/a.png" }]);
  });

  test("falls back to runtime image assets when generated results are absent", () => {
    const results = getWorkbenchResultItems({
      data: {} as Partial<FlowNodeData>,
      runtimeOutput: {
        assets: [
          { assetId: "asset-1", downloadUrl: "https://cdn.test/a.png", kind: "image", mimeType: "image/png" },
          { assetId: "asset-2", downloadUrl: "https://cdn.test/b.mp4", kind: "video", mimeType: "video/mp4" },
        ],
      } satisfies FlowRuntimeNodeOutput,
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe("asset:asset-1");
    expect(results[0]?.url).toBe("https://cdn.test/a.png");
  });
});

describe("deriveWorkbenchBatches", () => {
  test("creates batch cards from workbench image nodes newest first", () => {
    const nodes = [
      {
        data: markWorkbenchNodeData(
          {
            batchCount: 1,
            generationPrompt: "old prompt",
            kind: "image",
            modelId: "gpt-image-2",
            params: { aspect_ratio: "1:1", size: "1K" },
            routeKey: "image.gpt-image-2",
            status: "success",
            title: "Old",
          } as Partial<FlowNodeData>,
          { batchId: "batch-old", createdAt: 100 },
        ),
        id: "node-old",
        position: { x: 0, y: 0 },
        type: "image",
      },
      {
        data: markWorkbenchNodeData(
          {
            batchCount: 2,
            generatedResults: [{ createdAt: 200, id: "r1", url: "https://cdn.test/r1.png" }],
            generationPrompt: "new prompt",
            kind: "image",
            modelId: "pixellelabs.nano-banana-pro",
            params: { aspect_ratio: "16:9", size: "2K" },
            routeKey: "image.pixellelabs.nano-banana-pro",
            status: "success",
            title: "New",
          } as Partial<FlowNodeData>,
          { batchId: "batch-new", createdAt: 200 },
        ),
        id: "node-new",
        position: { x: 0, y: 0 },
        type: "image",
      },
    ] as Array<any>;

    const batches = deriveWorkbenchBatches({
      nodeOutputByNodeId: {},
      nodeRunStatusByNodeId: {},
      nodes,
      workflowRunIdByNodeId: {},
    });

    expect(batches.map((batch) => batch.batchId)).toEqual(["batch-new", "batch-old"]);
    expect(batches[0]).toMatchObject({
      aspectRatio: "16:9",
      batchCount: 2,
      modelId: "pixellelabs.nano-banana-pro",
      prompt: "new prompt",
      resultCount: 1,
      routeKey: "image.pixellelabs.nano-banana-pro",
      size: "2K",
      status: "success",
    });
  });
});
