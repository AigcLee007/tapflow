import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PanoramaGeneratePopover } from "./PanoramaGeneratePopover";

describe("PanoramaGeneratePopover", () => {
  it("renders only 2:1 and 21:9 panorama ratio options", () => {
    render(
      <PanoramaGeneratePopover
        creditLabel="12 pts"
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        sourceNodeTitle="Source Image"
        sourcePromptAvailable
      />,
    );

    expect(screen.getByRole("button", { name: "2:1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "21:9" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "1:1" })).toBeNull();
  });

  it("disables submit and shows an inline message when the selected image lacks a prompt", () => {
    render(
      <PanoramaGeneratePopover
        creditLabel="12 pts"
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        sourceNodeTitle="Untitled"
        sourcePromptAvailable={false}
      />,
    );

    expect(screen.getByText(/missing generation prompt/i)).toBeTruthy();
    expect((screen.getByRole("button", { name: /generate panorama/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("submits the selected aspect ratio", () => {
    const onSubmit = vi.fn();

    render(
      <PanoramaGeneratePopover
        creditLabel="12 pts"
        onClose={vi.fn()}
        onSubmit={onSubmit}
        sourceNodeTitle="Source Image"
        sourcePromptAvailable
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "21:9" }));
    fireEvent.click(screen.getByRole("button", { name: /generate panorama/i }));

    expect(onSubmit).toHaveBeenCalledWith({ aspectRatio: "21:9" });
  });
});
