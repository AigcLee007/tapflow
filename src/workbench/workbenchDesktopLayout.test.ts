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
});
