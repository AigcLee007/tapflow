import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useDismissibleLayer } from "../../components/menu/useDismissibleLayer";
import { PanoramaGeneratePopover } from "./PanoramaGeneratePopover";

const modelOptions = [
  { id: "gpt-image-2", label: "GPT-Image-2", sizeOptions: ["1k", "2k", "4k"] },
  { id: "pixellelabs.nano-banana-pro", label: "Nano Banana Pro", sizeOptions: ["1k"] },
];

const routeOptions = [
  { label: "Line 1", routeKey: "image.gpt-image-2" },
  { label: "Line 2", routeKey: "image.gpt-image-2.line2" },
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

    expect(screen.getByRole("button", { name: /GPT-Image-2/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Line 1/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /1K/ })).toBeTruthy();
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

    expect((screen.getByRole("button", { name: "生成全景" }) as HTMLButtonElement).disabled).toBe(true);
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

    fireEvent.click(screen.getByRole("button", { name: /Line 1/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Line 2" }));
    fireEvent.click(screen.getByRole("button", { name: /1K/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "4K" }));
    fireEvent.click(screen.getByRole("button", { name: "21:9" }));
    fireEvent.click(screen.getByRole("button", { name: "生成全景" }));

    expect(onModelChange).not.toHaveBeenCalled();
    expect(onSubmit).toHaveBeenCalledWith({
      aspectRatio: "21:9",
      modelId: "gpt-image-2",
      routeKey: "image.gpt-image-2.line2",
      size: "4k",
    });
  });

  it("keeps the panorama panel open while changing nested select controls", () => {
    function Harness() {
      const parentLayer = useDismissibleLayer("panorama-parent", { closeOnOtherLayer: false });
      React.useEffect(() => {
        parentLayer.openLayer();
      }, [parentLayer]);

      return parentLayer.open ? (
        <div ref={parentLayer.ref as React.RefObject<HTMLDivElement>}>
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
          />
        </div>
      ) : null;
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Line 1/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Line 2" }));

    expect(screen.getByRole("dialog", { name: /360/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Line 2/ })).toBeTruthy();
  });
});
