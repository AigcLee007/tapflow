import { describe, expect, test } from "vitest";

import {
  getWorkbenchActiveGenerations,
  getWorkbenchCompletedGenerations,
} from "./workbenchDesktopLayout";

function generation(id: string, status: string, createdAt: string, resultCount = 1) {
  return {
    chargedCredits: null,
    createdAt,
    displayMode: "merged" as const,
    errorJson: null,
    estimatedCredits: 1,
    finishedAt: null,
    id,
    modelId: "pixellelabs.nano-banana-pro",
    params: {},
    prompt: id,
    referenceAssetIds: [],
    referenceUploadIds: [],
    requestedCount: 1,
    reservedCredits: 1,
    reserveLedgerId: null,
    results: Array.from({ length: resultCount }, (_, index) => ({
      assetId: `${id}-asset-${index}`,
      createdAt,
      downloadUrl: null,
      downloadUrlExpiresAt: null,
      height: 1024,
      id: `${id}-result-${index}`,
      metadata: {},
      mimeType: "image/png",
      originalFilename: `${id}.png`,
      previewUrl: `https://example.com/${id}.png`,
      previewUrlExpiresAt: null,
      sortOrder: index,
      status: "available",
      width: 1024,
    })),
    routeKey: "image.pixellelabs.nano-banana-pro",
    sessionId: null,
    startedAt: null,
    status,
    updatedAt: createdAt,
  };
}

describe("workbenchDesktopLayout", () => {
  test("collects queued and running generations into the active band", () => {
    const items = getWorkbenchActiveGenerations([
      generation("done-1", "succeeded", "2026-06-18T08:00:00.000Z"),
      generation("queued-1", "queued", "2026-06-18T09:00:00.000Z", 0),
      generation("running-1", "running", "2026-06-18T10:00:00.000Z", 0),
    ]);

    expect(items.map((item) => item.id)).toEqual(["running-1", "queued-1"]);
  });

  test("treats succeeded generations without results as still active", () => {
    const items = getWorkbenchActiveGenerations([
      generation("blank-1", "succeeded", "2026-06-18T10:00:00.000Z", 0),
      generation("done-1", "succeeded", "2026-06-18T09:00:00.000Z", 1),
    ]);

    expect(items.map((item) => item.id)).toEqual(["blank-1"]);
  });

  test("keeps only succeeded generations with results in the completed rail", () => {
    const items = getWorkbenchCompletedGenerations([
      generation("failed-1", "failed", "2026-06-18T11:00:00.000Z", 0),
      generation("done-2", "succeeded", "2026-06-18T10:00:00.000Z", 1),
      generation("blank-1", "succeeded", "2026-06-18T09:00:00.000Z", 0),
      generation("done-1", "succeeded", "2026-06-18T08:00:00.000Z", 1),
    ]);

    expect(items.map((item) => item.id)).toEqual(["done-2", "done-1"]);
  });

  test("keeps partial batch generations active while showing available results", () => {
    const partial = generation("batch-1", "running", "2026-06-18T10:00:00.000Z", 1);
    partial.batch = {
      batchId: "batch-1",
      children: [
        {
          batchIndex: 0,
          chargedCredits: null,
          errorJson: null,
          finishedAt: "2026-06-18T10:01:00.000Z",
          generationId: "child-1",
          results: partial.results,
          startedAt: null,
          status: "succeeded",
          updatedAt: "2026-06-18T10:01:00.000Z",
        },
        {
          batchIndex: 1,
          chargedCredits: null,
          errorJson: null,
          finishedAt: null,
          generationId: "child-2",
          results: [],
          startedAt: null,
          status: "running",
          updatedAt: "2026-06-18T10:01:00.000Z",
        },
      ],
      completedCount: 1,
      failedCount: 0,
      parentGenerationId: "batch-1",
      pendingCount: 0,
      runningCount: 1,
      totalCount: 2,
    };

    expect(getWorkbenchActiveGenerations([partial])).toHaveLength(1);
    expect(getWorkbenchCompletedGenerations([partial])).toHaveLength(0);
  });
});
