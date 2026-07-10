import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PanoramaGeneratePopover } from "./PanoramaGeneratePopover";

const modelOptions = [
  { id: "gpt-image-2", label: "GPT-Image-2", sizeOptions: ["1k", "2k", "4k"] },
  { id: "pixellelabs.nano-banana-pro", label: "Nano Banana Pro", sizeOptions: ["1k"] },
];

const routeOptions = [
  { label: "线路一", routeKey: "image.gpt-image-2" },
  { label: "线路二", routeKey: "image.gpt-image-2.line2" },
];

describe("PanoramaGeneratePopover", () => {
  it("renders model, route, size, and panorama ratio controls", () => {
    render(
      <PanoramaGeneratePopover
        creditLabel="12 pts"
        initialModelId="gpt-image-2"
        initialRouteKey="image.gpt-image-2"
        initialSize="1k"
        modelOptions={modelOptions}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        routeOptions={routeOptions}
        sourceNodeTitle="Source Image"
        sourcePromptAvailable
      />,
    );

    expect(screen.getByRole("button", { name: /全景模型 GPT-Image-2/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /全景线路 线路一/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /全景清晰度 1K/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "2:1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "21:9" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "1:1" })).toBeNull();
  });

  it("disables submit and shows an inline message when the selected image lacks a prompt", () => {
    render(
      <PanoramaGeneratePopover
        creditLabel="12 pts"
        initialModelId="gpt-image-2"
        initialRouteKey="image.gpt-image-2"
        initialSize="1k"
        modelOptions={modelOptions}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        routeOptions={routeOptions}
        sourceNodeTitle="Untitled"
        sourcePromptAvailable={false}
      />,
    );

    expect(screen.getByText(/缺少生成提示词/i)).toBeTruthy();
    expect((screen.getByRole("button", { name: /生成全景/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("submits the selected model, route, size, and aspect ratio", () => {
    const onSubmit = vi.fn();
    const onModelChange = vi.fn();

    render(
      <PanoramaGeneratePopover
        creditLabel="12 pts"
        initialModelId="gpt-image-2"
        initialRouteKey="image.gpt-image-2"
        initialSize="1k"
        modelOptions={modelOptions}
        onClose={vi.fn()}
        onModelChange={onModelChange}
        onSubmit={onSubmit}
        routeOptions={routeOptions}
        sourceNodeTitle="Source Image"
        sourcePromptAvailable
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /全景线路 线路一/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "线路二" }));
    fireEvent.click(screen.getByRole("button", { name: /全景清晰度 1K/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "4K" }));
    fireEvent.click(screen.getByRole("button", { name: "21:9" }));
    fireEvent.click(screen.getByRole("button", { name: /生成全景/i }));

    expect(onModelChange).not.toHaveBeenCalled();
    expect(onSubmit).toHaveBeenCalledWith({
      aspectRatio: "21:9",
      modelId: "gpt-image-2",
      routeKey: "image.gpt-image-2.line2",
      size: "4k",
    });
  });
});
