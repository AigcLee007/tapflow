import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ImageNodeComponent, TextNodeComponent } from "./FlowNodes";
import { useFlowCanvasStore } from "../store/flowCanvasStore";

vi.mock("@xyflow/react", async () => {
  const React = await import("react");
  return {
    Handle: () => null,
    NodeResizer: () => null,
    Position: { Left: "left", Right: "right" },
    useConnection: () => ({ connectionNodeId: null }),
    useReactFlow: () => ({
      flowToScreenPosition: ({ x, y }: { x: number; y: number }) => ({ x, y }),
      getNode: () => null,
    }),
    useViewport: () => ({ zoom: 1 }),
  };
});

describe("FlowNodes agent metadata", () => {
  beforeEach(() => {
    useFlowCanvasStore.getState().newProject();
  });

  it("renders an Agent badge and opens session detail for text nodes", () => {
    const listener = vi.fn();
    window.addEventListener("tapflow:open-agent-session", listener as EventListener);

    render(
      <TextNodeComponent
        id="text-1"
        selected={false}
        data={{
          agentMetadata: {
            agentSessionId: "session-1",
            agentTurnId: "turn-1",
          },
          createdAt: 1,
          generationStatus: "idle",
          height: 180,
          kind: "text",
          status: "idle",
          text: "agent text",
          title: "Agent Prompt",
          updatedAt: 1,
          width: 240,
        } as any}
        dragging={false}
        zIndex={1}
        isConnectable
        type="text"
        xPos={0}
        yPos={0}
      />,
    );

    expect(screen.getByText("Agent")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "查看 Agent 过程" }));
    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0]?.[0] as CustomEvent<{ sessionId: string; turnId?: string }>;
    expect(event.detail).toEqual({ sessionId: "session-1", turnId: "turn-1" });
    expect(screen.queryByText(/provider/i)).toBeNull();

    window.removeEventListener("tapflow:open-agent-session", listener as EventListener);
  });

  it("renders the Agent badge for image nodes without leaking provider info", () => {
    render(
      <ImageNodeComponent
        id="image-1"
        selected={false}
        data={{
          agentMetadata: {
            agentSessionId: "session-2",
            agentTurnId: "turn-2",
          },
          createdAt: 1,
          generationPrompt: "forest sports day",
          generationStatus: "idle",
          height: 240,
          kind: "image",
          status: "idle",
          title: "Agent Image",
          updatedAt: 1,
          width: 260,
        } as any}
        dragging={false}
        zIndex={1}
        isConnectable
        type="image"
        xPos={0}
        yPos={0}
      />,
    );

    expect(screen.getByText("Agent")).toBeTruthy();
    expect(screen.getByRole("button", { name: "查看 Agent 过程" })).toBeTruthy();
    expect(screen.queryByText(/provider/i)).toBeNull();
    expect(screen.queryByText(/baseurl/i)).toBeNull();
  });

  it("renders the main image thumbnail without cropping", () => {
    const { container } = render(
      <ImageNodeComponent
        id="image-preview-1"
        selected={false}
        data={{
          createdAt: 1,
          generationStatus: "done",
          height: 170,
          kind: "image",
          naturalHeight: 1024,
          naturalWidth: 1024,
          status: "success",
          thumbnailUrl: "https://cdn.test/square-preview.png",
          title: "Square Preview",
          updatedAt: 1,
          width: 170,
        } as any}
        dragging={false}
        zIndex={1}
        isConnectable
        type="image"
        xPos={0}
        yPos={0}
      />,
    );

    const image = container.querySelector('img[src="https://cdn.test/square-preview.png"]') as HTMLImageElement | null;

    expect(image).toBeTruthy();
    expect(image?.style.objectFit).toBe("contain");
  });
});
