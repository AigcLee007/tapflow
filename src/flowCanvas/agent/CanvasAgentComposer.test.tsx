import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CanvasAgentComposer } from "./CanvasAgentComposer";
import type { CanvasAgentWorkspaceState } from "./canvasAgentStateMachine";

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
        routeLabel: "Line 1",
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
  it.each<{
    disabled: boolean;
    state: CanvasAgentWorkspaceState;
  }>([
    { disabled: false, state: "idle" },
    { disabled: false, state: "asset_ready" },
    { disabled: false, state: "failed" },
    { disabled: false, state: "replay" },
    { disabled: true, state: "reading_context" },
    { disabled: true, state: "thinking" },
    { disabled: true, state: "applying_canvas_ops" },
    { disabled: true, state: "running_workflow" },
  ])("disables input according to workspace state $state", ({ disabled, state }) => {
    render(
      <CanvasAgentComposer
        draftValue="Make this into a poster"
        models={models}
        onChangeDraft={vi.fn()}
        onSend={vi.fn()}
        workspaceState={state}
      />,
    );

    expect(
      (screen.getByPlaceholderText("描述你想完成的创作任务，或者继续刚才的结果...") as HTMLTextAreaElement).disabled,
    ).toBe(disabled);
  });

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

  it("renders reference chips directly above the prompt", () => {
    const onChangeDraft = vi.fn();
    render(
      <CanvasAgentComposer
        draftValue=""
        models={models}
        onChangeDraft={onChangeDraft}
        onSend={vi.fn()}
        referenceChips={[
          { id: "node-1", kind: "canvas_node", label: "Selected image 1", refId: "round-1-image-1" },
          { id: "node-2", kind: "artifact", label: "Previous result 1", refId: "round-1-image-2" },
        ]}
      />,
    );

    expect(screen.getByTestId("agent-composer-reference-strip")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Selected image 1" }));

    expect(onChangeDraft).toHaveBeenCalledWith("round-1-image-1");
  });

  it("keeps model settings secondary until expanded", () => {
    render(
      <CanvasAgentComposer
        draftValue="Make this into a poster"
        models={models}
        onChangeDraft={vi.fn()}
        onSend={vi.fn()}
      />,
    );

    expect(screen.getByText((content) => content.includes("Nano Banana Pro"))).toBeTruthy();
    expect(screen.getByText((content) => content.includes("Estimated credits") && content.includes("4"))).toBeTruthy();
    expect(screen.queryByTestId("agent-composer-settings-panel")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Expand model settings" }));

    expect(screen.getByTestId("agent-composer-settings-panel")).toBeTruthy();
    expect(screen.getByText("Line 1")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "4K" }));

    expect(screen.getByText((content) => content.includes("Estimated credits") && content.includes("5"))).toBeTruthy();
  });

  it("shows a compact busy hint while preserving the current draft", () => {
    render(
      <CanvasAgentComposer
        draftValue="Keep my existing prompt"
        models={models}
        onChangeDraft={vi.fn()}
        onSend={vi.fn()}
        workspaceState="running_workflow"
      />,
    );

    expect(screen.getByText("Generation submitted")).toBeTruthy();
    expect(
      (screen.getByPlaceholderText("描述你想完成的创作任务，或者继续刚才的结果...") as HTMLTextAreaElement).value,
    ).toBe("Keep my existing prompt");
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
