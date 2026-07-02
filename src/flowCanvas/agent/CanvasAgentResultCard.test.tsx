import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CanvasAgentResultCard } from "./CanvasAgentResultCard";

describe("CanvasAgentResultCard", () => {
  it("renders clean Chinese result actions and thumbnail frame", () => {
    const asset = {
      assetId: "asset-1",
      height: 1024,
      kind: "image" as const,
      label: "生成图 1",
      previewUrl: "https://signed.example/asset-1",
      promptSummary: "",
      refId: "ref-1",
      width: 1024,
    };

    render(
      <CanvasAgentResultCard assets={[asset]} onContinueFromAsset={vi.fn()} onPlaceAssets={vi.fn()} />,
    );

    expect(screen.getByText("生成结果")).toBeTruthy();
    expect(screen.getByText("生成图 1")).toBeTruthy();
    expect(screen.getByAltText("生成图 1")).toBeTruthy();
    expect(screen.getByText("1024 × 1024")).toBeTruthy();
    expect(screen.getByText("待放到画布")).toBeTruthy();
    expect(screen.getByRole("button", { name: "放到画布" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "继续编辑" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "做变体" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "做海报" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "生成对比图" })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/[锟閸檤]/);
  });

  it("triggers place on canvas", () => {
    const onPlaceAssets = vi.fn();
    render(
      <CanvasAgentResultCard
        assets={[{ assetId: "asset-1", kind: "image", label: "生成图 1", promptSummary: "", refId: "ref-1" }]}
        onContinueFromAsset={vi.fn()}
        onPlaceAssets={onPlaceAssets}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "放到画布" }));
    expect(onPlaceAssets).toHaveBeenCalled();
  });
});
