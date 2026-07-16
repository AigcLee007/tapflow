import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { createDefaultVideoGenerationParams } from "./videoGenerationParams";
import { VideoPalettePopover } from "./VideoPalettePopover";

describe("VideoPalettePopover", () => {
  test("context palette changes only contextPaletteRefs", () => {
    const onChange = vi.fn();
    const value = {
      ...createDefaultVideoGenerationParams(),
      visualTone: "cool_moonlight",
      referenceRolesByKey: {
        subject: { role: "subject" as const, source: { kind: "asset" as const, id: "asset-subject" } },
      },
    };
    render(<VideoPalettePopover onChange={onChange} value={value} />);

    fireEvent.click(screen.getByRole("button", { name: "Color palettes" }));
    fireEvent.click(screen.getByRole("button", { name: "Subject amber context palette" }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      visualTone: "cool_moonlight",
      contextPaletteRefs: [{
        role: "subject",
        source: { kind: "asset", id: "asset-subject" },
        colorToken: "amber",
      }],
    }));
  });

  test("visual tone changes only visualTone and exposes the fixed preset set", () => {
    const onChange = vi.fn();
    const value = {
      ...createDefaultVideoGenerationParams(),
      contextPaletteRefs: [{
        role: "subject",
        source: { kind: "asset" as const, id: "asset-subject" },
        colorToken: "amber",
      }],
    };
    render(<VideoPalettePopover onChange={onChange} value={value} />);

    fireEvent.click(screen.getByRole("button", { name: "Color palettes" }));
    expect(screen.getAllByRole("radio").map((item) => item.getAttribute("data-tone"))).toEqual([
      "neutral", "cinematic_teal", "warm_sunset", "cool_moonlight", "monochrome",
    ]);
    fireEvent.click(screen.getByRole("radio", { name: "Cinematic teal" }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      visualTone: "cinematic_teal",
      contextPaletteRefs: value.contextPaletteRefs,
    }));
  });

  test("shows the context-palette empty state when no reference roles exist", () => {
    render(<VideoPalettePopover onChange={vi.fn()} value={createDefaultVideoGenerationParams()} />);

    fireEvent.click(screen.getByRole("button", { name: "Color palettes" }));
    expect(screen.getByText("No reference roles available for context palette.")).toBeTruthy();
  });
});
