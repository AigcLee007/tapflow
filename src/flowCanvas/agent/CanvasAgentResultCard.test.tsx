import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CanvasAgentResultCard } from "./CanvasAgentResultCard";

describe("CanvasAgentResultCard", () => {
  it("renders result assets and action buttons", () => {
    render(
      <CanvasAgentResultCard
        assets={[{ assetId: "asset-1", kind: "image", label: "结果 1", promptSummary: "", refId: "ref-1" }]}
        onContinueFromAsset={vi.fn()}
        onPlaceAssets={vi.fn()}
      />,
    );

    expect(screen.getByText("生成结果")).toBeTruthy();
    expect(screen.getByText("结果 1")).toBeTruthy();
    expect(screen.getByRole("button", { name: "放入画布" })).toBeTruthy();
  });

  it("triggers place on canvas", () => {
    const onPlaceAssets = vi.fn();
    render(
      <CanvasAgentResultCard
        assets={[{ assetId: "asset-1", kind: "image", label: "结果 1", promptSummary: "", refId: "ref-1" }]}
        onContinueFromAsset={vi.fn()}
        onPlaceAssets={onPlaceAssets}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "放入画布" }));
    expect(onPlaceAssets).toHaveBeenCalled();
  });
});
