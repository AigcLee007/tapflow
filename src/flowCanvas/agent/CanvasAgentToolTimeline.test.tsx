import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CanvasAgentToolTimeline } from "./CanvasAgentToolTimeline";

describe("CanvasAgentToolTimeline", () => {
  it("shows friendly tool status and generated asset refs", () => {
    render(
      <CanvasAgentToolTimeline
        items={[
          {
            assetRefs: [{ assetId: "asset-1", kind: "image", label: "Round 1 image 1", promptSummary: "", refId: "round-1-image-1" }],
            status: "succeeded",
            taskId: "tool-db-1",
            title: "Image generation",
            toolCallKey: "tool-1",
            toolName: "generate_image",
          },
        ]}
      />,
    );

    expect(screen.getByText("Image generation")).toBeTruthy();
    expect(screen.getByText("Completed")).toBeTruthy();
    expect(screen.getByText("Round 1 image 1")).toBeTruthy();
    expect(screen.getByText("Task ID: tool-db-1")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/baseUrl|provider_key|route_key|upstream_model/i);
  });

  it("shows a friendly run summary for confirmed image settings", () => {
    render(
      <CanvasAgentToolTimeline
        items={[
          {
            assetRefs: [],
            estimate: {
              currentSelection: {
                aspectRatio: "16:9",
                estimatedCredits: 12,
                modelDisplayName: "Nano Banana Pro",
                modality: "image",
                n: 1,
                routeKey: "image.mouxihub.nano-banana-pro.t3",
                routeLabel: "线路二（官方T3）",
                size: "4K",
              },
              referenceRefs: ["round-1-image-1", "asset:2"],
              totalCredits: 12,
            },
            status: "succeeded",
            title: "Image edit",
            toolCallKey: "tool-edit-1",
            toolName: "edit_image",
          },
        ]}
      />,
    );

    expect(screen.getByText("Nano Banana Pro")).toBeTruthy();
    expect(screen.getByText("线路二（官方T3）")).toBeTruthy();
    expect(screen.getByText("4K · 16:9 · 2 references")).toBeTruthy();
    expect(screen.getByText("Estimated credits 12")).toBeTruthy();
  });

  it("shows draft run settings while waiting for approval", () => {
    render(
      <CanvasAgentToolTimeline
        items={[
          {
            assetRefs: [],
            estimate: {
              draftSelection: {
                aspectRatio: "9:16",
                estimatedCredits: 10.5,
                modelDisplayName: "GPT-Image-2",
                modality: "image",
                n: 3,
                routeLabel: "线路二",
                size: "2K",
              },
              totalCredits: 10.5,
            },
            status: "awaiting_approval",
            title: "Image generation",
            toolCallKey: "tool-draft-1",
            toolName: "generate_image",
          },
        ]}
      />,
    );

    expect(screen.getByText("GPT-Image-2")).toBeTruthy();
    expect(screen.getByText("线路二")).toBeTruthy();
    expect(screen.getByText("2K · 9:16 · 3 张")).toBeTruthy();
    expect(screen.getByText("Estimated credits 10.5")).toBeTruthy();
  });

  it("allows continuing from a generated result", () => {
    const onContinueFromAsset = vi.fn();
    render(
      <CanvasAgentToolTimeline
        items={[
          {
            assetRefs: [{ assetId: "asset-1", kind: "image", label: "Round 1 image 1", promptSummary: "forest sports day", refId: "round-1-image-1" }],
            status: "succeeded",
            taskId: "tool-db-1",
            title: "Image generation",
            toolCallKey: "tool-1",
            toolName: "generate_image",
          },
        ]}
        onContinueFromAsset={onContinueFromAsset}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "继续编辑" }));
    expect(onContinueFromAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        assetId: "asset-1",
        promptSummary: "forest sports day",
        refId: "round-1-image-1",
      }),
      "continue-edit",
      [expect.objectContaining({ assetId: "asset-1", refId: "round-1-image-1" })],
    );
  });

  it("allows continuing from multiple chosen results when a task has multiple assets", () => {
    const onContinueFromAsset = vi.fn();
    function TestHarness() {
      const [items, setItems] = React.useState([
        {
          activeAssetRefId: "round-1-image-2",
          assetRefs: [
            { assetId: "asset-1", kind: "image" as const, label: "Round 1 image 1", promptSummary: "forest sports day", refId: "round-1-image-1" },
            { assetId: "asset-2", kind: "image" as const, label: "Round 1 image 2", promptSummary: "poster variant", refId: "round-1-image-2" },
          ],
          selectedAssetRefIds: ["round-1-image-2"],
          status: "succeeded" as const,
          taskId: "tool-db-2",
          title: "Batch image generation",
          toolCallKey: "tool-2",
          toolName: "generate_image_batch",
        },
      ]);

      return (
        <CanvasAgentToolTimeline
          items={items}
          onContinueFromAsset={onContinueFromAsset}
          onSelectAssetRef={(toolCallKey, refId) => {
            setItems((current) =>
              current.map((item) =>
                item.toolCallKey !== toolCallKey
                  ? item
                  : {
                      ...item,
                      activeAssetRefId: refId,
                      selectedAssetRefIds: item.selectedAssetRefIds?.includes(refId)
                        ? item.selectedAssetRefIds
                        : [...(item.selectedAssetRefIds ?? []), refId],
                    },
              ),
            );
          }}
        />
      );
    }

    render(<TestHarness />);

    fireEvent.click(screen.getByRole("button", { name: "加入 Round 1 image 1" }));
    fireEvent.click(screen.getByRole("button", { name: "基于已选 2 张结果继续编辑" }));
    expect(onContinueFromAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        assetId: "asset-1",
        promptSummary: "forest sports day",
        refId: "round-1-image-1",
      }),
      "continue-edit",
      [
        expect.objectContaining({ assetId: "asset-1", refId: "round-1-image-1" }),
        expect.objectContaining({ assetId: "asset-2", refId: "round-1-image-2" }),
      ],
    );
  });
});
