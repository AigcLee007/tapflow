import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

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
  });
});
