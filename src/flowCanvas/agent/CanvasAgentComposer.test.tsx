import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CanvasAgentComposer } from "./CanvasAgentComposer";

const models = [
  {
    aspectRatios: ["1:1", "16:9"],
    defaultRouteKey: "image.nano.line1",
    displayName: "Nano Banana Pro",
    modelFamily: "nano-banana-pro",
    modelKey: "nano",
    qualityOptions: [],
    quantityOptions: [1, 2],
    routes: [
      {
        estimatedCredits: 4,
        routeKey: "image.nano.line1",
        routeLabel: "线路一",
        sizes: [
          { credits: 4, size: "1K" as const },
          { credits: 4.5, size: "2K" as const },
          { credits: 5, size: "4K" as const },
        ],
      },
    ],
    sizes: ["1K" as const, "2K" as const, "4K" as const],
  },
];

describe("CanvasAgentComposer", () => {
  it("renders a controlled draft value and updates it", () => {
    const onChangeDraft = vi.fn();
    render(
      <CanvasAgentComposer
        draftValue="Use round-1-image-1 as reference"
        models={models}
        onChangeDraft={onChangeDraft}
        onSend={vi.fn()}
      />,
    );

    const input = screen.getByPlaceholderText("描述你想完成的创作任务，或者继续刚才的结果...");
    expect((input as HTMLTextAreaElement).value).toBe("Use round-1-image-1 as reference");

    fireEvent.change(input, { target: { value: "Use round-1-image-1 to make a poster" } });
    expect(onChangeDraft).toHaveBeenCalledWith("Use round-1-image-1 to make a poster");
  });

  it("renders reference chips and lets them be inserted into the draft", () => {
    const onChangeDraft = vi.fn();
    render(
      <CanvasAgentComposer
        draftValue=""
        models={models}
        onChangeDraft={onChangeDraft}
        onSend={vi.fn()}
        referenceChips={[
          { id: "node-1", kind: "canvas_node", label: "选中图片 1", refId: "round-1-image-1" },
          { id: "node-2", kind: "artifact", label: "上一轮结果 1", refId: "round-1-image-2" },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "选中图片 1" }));

    expect(onChangeDraft).toHaveBeenCalledWith("round-1-image-1");
  });

  it("shows friendly model, route and estimated credits", () => {
    render(
      <CanvasAgentComposer
        draftValue="Make this into a poster"
        models={models}
        onChangeDraft={vi.fn()}
        onSend={vi.fn()}
      />,
    );

    expect(screen.getByText("Nano Banana Pro")).toBeTruthy();
    expect(screen.getByText("线路一")).toBeTruthy();
    expect(screen.getByText((content) => content.includes("预计积分") && content.includes("4"))).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "4K" }));

    expect(screen.getByText((content) => content.includes("预计积分") && content.includes("5"))).toBeTruthy();
  });

  it("appends multiple reference chips into the current draft", () => {
    const onChangeDraft = vi.fn();
    render(
      <CanvasAgentComposer
        draftValue="Make this into a poster"
        models={models}
        onChangeDraft={onChangeDraft}
        onSend={vi.fn()}
        referenceRefs={[
          { label: "Round 1 image 1", refId: "round-1-image-1" },
          { label: "Round 1 image 2", refId: "round-1-image-2" },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Round 1 image 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Round 1 image 2" }));

    expect(onChangeDraft).toHaveBeenNthCalledWith(1, "Make this into a poster round-1-image-1");
    expect(onChangeDraft).toHaveBeenNthCalledWith(2, "Make this into a poster round-1-image-2");
  });
});
