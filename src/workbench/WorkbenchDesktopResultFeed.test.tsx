import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { WorkbenchDesktopResultFeed } from "./WorkbenchDesktopResultFeed";

function createGeneration(id: string) {
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
    id,
    modelId: "pixellelabs.nano-banana-pro",
    params: { aspect_ratio: "1:1", size: "2k" },
    parentGenerationId: null,
    prompt: "Poster",
    referenceAssetIds: [],
    referenceUploadIds: [],
    requestedCount: 1,
    reservedCredits: 1,
    reserveLedgerId: "ledger-1",
    results: [],
    routeKey: "image.pixellelabs.nano-banana-pro",
    sessionId: null,
    startedAt: null,
    status: "queued",
    updatedAt: new Date().toISOString(),
  };
}

describe("WorkbenchDesktopResultFeed", () => {
  test("removes the result section header chrome and starts with scroll content", () => {
    render(
      <WorkbenchDesktopResultFeed
        generations={[createGeneration("generation-1")]}
        getDisplayResults={() => []}
        models={[]}
        onDeleteGeneration={vi.fn()}
        onDownloadOriginal={vi.fn()}
        onRegenerate={vi.fn()}
        onSelectPreview={vi.fn()}
        onUseAsReference={vi.fn()}
      />,
    );

    expect(screen.queryByText("Results Workspace")).toBeNull();
    expect(screen.queryByText("创作结果流")).toBeNull();
    expect(screen.getByTestId("workbench-desktop-result-scroll-area").className).toContain("p-4");
  });
});
