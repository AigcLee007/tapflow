import { describe, expect, test } from "vitest";

import {
  getWorkbenchCompletedHistory,
  getWorkbenchDesktopStage,
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
  test("prefers the newest active generation for the center stage", () => {
    const stage = getWorkbenchDesktopStage([
      generation("done-1", "succeeded", "2026-06-18T08:00:00.000Z"),
      generation("active-1", "running", "2026-06-18T09:00:00.000Z", 0),
    ]);

    expect(stage.primary?.id).toBe("active-1");
  });

  test("keeps succeeded generations without results out of completed history", () => {
    const completed = getWorkbenchCompletedHistory([
      generation("ready", "succeeded", "2026-06-18T09:00:00.000Z"),
      generation("blank", "succeeded", "2026-06-18T10:00:00.000Z", 0),
    ]);

    expect(completed.map((item) => item.id)).toEqual(["ready"]);
  });

  test("caps the center recent window so total stage items do not exceed eight", () => {
    const inputs = Array.from({ length: 10 }, (_, index) =>
      generation(
        `done-${index}`,
        "succeeded",
        `2026-06-${String(index + 10).padStart(2, "0")}T08:00:00.000Z`,
      ),
    );

    const stage = getWorkbenchDesktopStage(inputs);

    expect(stage.recent.length).toBeLessThanOrEqual(7);
  });
});
