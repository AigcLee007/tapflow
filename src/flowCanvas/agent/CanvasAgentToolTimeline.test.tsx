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
    expect(document.body.textContent).not.toMatch(/baseUrl|provider_key|route_key|upstream_model/i);
  });
});
