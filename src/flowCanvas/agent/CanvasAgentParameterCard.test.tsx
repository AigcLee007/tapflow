import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CanvasAgentParameterCard } from "./CanvasAgentParameterCard";
import type { AgentImageRunSettingsModel } from "./agentRunSettings";

const models: AgentImageRunSettingsModel[] = [
  {
    aspectRatios: ["1:1", "16:9", "9:16"],
    defaultRouteKey: "image.pixellelabs.nano-banana-pro",
    displayName: "Nano Banana Pro",
    modelFamily: "pixellelabs.nano-banana-pro",
    modelKey: "gemini-3-pro-image-preview",
    qualityOptions: [],
    quantityOptions: [1],
    routes: [
      {
        estimatedCredits: 4,
        routeKey: "image.pixellelabs.nano-banana-pro",
        routeLabel: "线路一",
        sizes: [
          { credits: 4, size: "1K" },
          { credits: 4.5, size: "2K" },
          { credits: 5, size: "4K" },
        ],
      },
      {
        estimatedCredits: 6,
        routeKey: "image.mouxihub.nano-banana-pro.t3",
        routeLabel: "线路二（官方T3）",
        sizes: [
          { credits: 6, size: "1K" },
          { credits: 8, size: "2K" },
          { credits: 12, size: "4K" },
        ],
      },
    ],
    sizes: ["1K", "2K", "4K"],
  },
  {
    aspectRatios: ["1:1", "4:3", "3:4"],
    defaultRouteKey: "image.gpt-image-2",
    displayName: "GPT-Image-2",
    modelFamily: "gpt-image-2",
    modelKey: "gpt-image-2",
    qualityOptions: ["auto", "high"],
    quantityOptions: [1],
    routes: [
      {
        estimatedCredits: 2.5,
        routeKey: "image.gpt-image-2",
        routeLabel: "线路一",
        sizes: [
          { credits: 2.5, size: "1K" },
          { credits: 3, size: "2K" },
          { credits: 3.5, size: "4K" },
        ],
      },
      {
        estimatedCredits: 3,
        routeKey: "image.gpt-image-2.line2",
        routeLabel: "线路二",
        sizes: [
          { credits: 3, size: "1K" },
          { credits: 3.5, size: "2K" },
          { credits: 4, size: "4K" },
        ],
      },
    ],
    sizes: ["1K", "2K", "4K"],
  },
];

describe("CanvasAgentParameterCard", () => {
  it("renders Nano Banana specific controls by default", () => {
    render(
      <CanvasAgentParameterCard
        models={models}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByTestId("nano-banana-param-panel")).toBeTruthy();
    expect(screen.queryByTestId("gpt-image-2-param-panel")).toBeNull();
  });

  it("switches to GPT-Image-2 controls and updates credits with route and size", () => {
    render(
      <CanvasAgentParameterCard
        models={models}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "GPT-Image-2" }));

    expect(screen.getByTestId("gpt-image-2-param-panel")).toBeTruthy();
    expect(screen.queryByTestId("nano-banana-param-panel")).toBeNull();
    expect(screen.getByText("2.5")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "线路二" }));
    expect(screen.getByText("3")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "4K" }));
    expect(screen.getByText("4")).toBeTruthy();
  });

  it("returns GPT-Image-2 specific settings on confirm", () => {
    const onConfirm = vi.fn();

    render(
      <CanvasAgentParameterCard
        models={models}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "GPT-Image-2" }));
    fireEvent.click(screen.getByRole("button", { name: "线路二" }));
    fireEvent.click(screen.getByRole("button", { name: "3:4" }));
    fireEvent.click(screen.getByRole("button", { name: "2K" }));
    fireEvent.click(screen.getByRole("button", { name: "HIGH" }));
    fireEvent.click(screen.getByRole("button", { name: "JPEG" }));
    fireEvent.click(screen.getByRole("button", { name: "LOW MODERATION" }));
    fireEvent.click(screen.getByRole("button", { name: "确认生成" }));

    expect(onConfirm).toHaveBeenCalledWith({
      aspectRatio: "3:4",
      estimatedCredits: 3.5,
      format: "jpeg",
      modelDisplayName: "GPT-Image-2",
      moderation: "low",
      modality: "image",
      n: 1,
      quality: "high",
      routeKey: "image.gpt-image-2.line2",
      routeLabel: "线路二",
      size: "2K",
    });
  });

  it("shows reference refs for edit image approval", () => {
    render(
      <CanvasAgentParameterCard
        models={models}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        referenceRefs={["round-1-image-1", "asset:2"]}
      />,
    );

    expect(screen.getByText("Reference images")).toBeTruthy();
    expect(screen.getByText("round-1-image-1")).toBeTruthy();
    expect(screen.getByText("asset:2")).toBeTruthy();
  });
});
