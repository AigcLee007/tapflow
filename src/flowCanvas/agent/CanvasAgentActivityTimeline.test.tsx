import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CanvasAgentActivityTimeline } from "./CanvasAgentActivityTimeline";

describe("CanvasAgentActivityTimeline", () => {
  it("renders ordered activity states and highlights completed steps", () => {
    render(
      <CanvasAgentActivityTimeline
        items={[
          { id: "1", label: "Understanding request", state: "completed" },
          { detail: "The task is running upstream.", id: "2", label: "Waiting for model result", state: "active" },
          { detail: "The upstream request failed.", id: "3", label: "Execution failed", state: "failed" },
        ]}
      />,
    );

    const items = screen.getAllByText(/Understanding request|Waiting for model result|Execution failed/);
    expect(items).toHaveLength(3);
    expect(screen.getByText("The task is running upstream.")).toBeTruthy();
    expect(screen.getByText("The upstream request failed.")).toBeTruthy();
  });
});
