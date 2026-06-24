import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CanvasAgentThread } from "./CanvasAgentThread";

describe("CanvasAgentThread", () => {
  it("shows continuation metadata for a user message without leaking internals", () => {
    render(
      <CanvasAgentThread
        events={[]}
        messages={[
          {
            content: "Turn this result into a poster",
            createdAt: "2026-06-24T00:00:00Z",
            id: "m1",
            metadata: {
              continuationContext: {
                action: "make-poster",
                assetLabel: "Round 1 image 1",
                assetRefId: "round-1-image-1",
                promptSummary: "forest sports day",
              },
            },
            role: "user",
            sessionId: "session-1",
          },
        ]}
      />,
    );

    expect(screen.getByText("继续基于历史结果")).toBeTruthy();
    expect(document.body.textContent).toContain("Round 1 image 1");
    expect(document.body.textContent).toContain("做海报");
    expect(document.body.textContent).not.toMatch(/baseUrl|provider_key|route_key|upstream_model/i);
  });
});
