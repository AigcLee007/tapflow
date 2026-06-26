import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CanvasAgentModelRoutePicker } from "./CanvasAgentModelRoutePicker";

describe("CanvasAgentModelRoutePicker", () => {
  const models = [
    {
      aspectRatios: ["1:1"],
      defaultRouteKey: "image.nano.line1",
      displayName: "Nano Banana Pro",
      modelFamily: "nano-banana-pro",
      modelKey: "nano",
      qualityOptions: [],
      quantityOptions: [1],
      routes: [
        {
          estimatedCredits: 4,
          routeKey: "image.nano.line1",
          routeLabel: "线路一",
          sizes: [{ credits: 4, size: "1K" as const }],
        },
      ],
      sizes: ["1K" as const],
    },
  ];

  it("renders friendly model and route labels only", () => {
    render(
      <CanvasAgentModelRoutePicker
        models={models}
        onSelectModel={vi.fn()}
        onSelectRoute={vi.fn()}
        routeKey="image.nano.line1"
        selectedModelKey="nano"
      />,
    );

    expect(screen.getByText("Nano Banana Pro")).toBeTruthy();
    expect(screen.getByText("线路一")).toBeTruthy();
    expect(screen.queryByText("image.nano.line1")).toBeNull();
  });

  it("calls select route with internal route key", () => {
    const onSelectRoute = vi.fn();
    render(
      <CanvasAgentModelRoutePicker
        models={models}
        onSelectModel={vi.fn()}
        onSelectRoute={onSelectRoute}
        routeKey={null}
        selectedModelKey="nano"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "线路一" }));
    expect(onSelectRoute).toHaveBeenCalledWith("image.nano.line1");
  });
});
