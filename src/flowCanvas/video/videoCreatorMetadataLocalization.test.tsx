import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { createDefaultVideoGenerationParams } from "./videoGenerationParams";
import { VideoHumanReviewControl } from "./VideoHumanReviewControl";
import { VideoReferenceStrip } from "./VideoReferenceStrip";

vi.mock("../nodes/ReferenceSourcePicker", () => ({
  ReferenceSourcePicker: () => null,
}));

describe("video creator metadata localization", () => {
  test("renders a localized selected reference state without exposing its opaque identifier", () => {
    render(
      <VideoReferenceStrip
        currentNodeId="video-node"
        onChange={vi.fn()}
        onUploadReference={vi.fn()}
        value={{
          referenceAssetItemIds: ["asset-hero-01"],
          referenceOrder: ["asset:asset-hero-01"],
          videoGeneration: {
            ...createDefaultVideoGenerationParams(),
            mode: "all_reference",
            referenceRolesByKey: {
              subject: { role: "subject", source: { kind: "asset", id: "asset-hero-01" } },
            },
          },
        }}
      />,
    );

    expect(screen.getByText("人物已选中")).toBeTruthy();
    expect(screen.queryByText("asset-hero-01")).toBeNull();
  });

  test("formats a verified timestamp for Chinese creators without raw ISO metadata", () => {
    render(
      <VideoHumanReviewControl
        value={{ status: "verified", verifiedAt: "2026-07-16T08:00:00.000Z" }}
      />,
    );

    expect(screen.getByText("已验证：2026年7月16日 16:00")).toBeTruthy();
    expect(screen.queryByText(/T08:00:00\.000Z/)).toBeNull();
  });
});
