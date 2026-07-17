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

    fireEvent.click(screen.getByRole("button", { name: "调色盘" }));
    fireEvent.click(screen.getByRole("button", { name: "人物颜色：琥珀" }));

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

    fireEvent.click(screen.getByRole("button", { name: "调色盘" }));
    expect(screen.getAllByRole("radio").map((item) => item.getAttribute("data-tone"))).toEqual([
      "neutral", "cinematic_teal", "warm_sunset", "cool_moonlight", "monochrome",
    ]);
    fireEvent.click(screen.getByRole("radio", { name: "青橙电影" }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      visualTone: "cinematic_teal",
      contextPaletteRefs: value.contextPaletteRefs,
    }));
  });

  test("shows the context-palette empty state when no reference roles exist", () => {
    render(<VideoPalettePopover onChange={vi.fn()} value={createDefaultVideoGenerationParams()} />);

    fireEvent.click(screen.getByRole("button", { name: "调色盘" }));
    expect(screen.getByText("当前没有可用的参考角色。")).toBeTruthy();
  });

  test("uses Chinese visible and accessible copy throughout the palette", () => {
    const value = {
      ...createDefaultVideoGenerationParams(),
      referenceRolesByKey: {
        subject: { role: "subject" as const, source: { kind: "asset" as const, id: "asset-subject" } },
      },
    };
    const { rerender } = render(<VideoPalettePopover onChange={vi.fn()} value={value} />);

    fireEvent.click(screen.getByRole("button", { name: "调色盘" }));

    expect(screen.getByRole("dialog", { name: "调色盘" })).toBeTruthy();
    expect(screen.getByText("上下文调色盘")).toBeTruthy();
    expect(screen.getByText("人物颜色")).toBeTruthy();
    expect(screen.getByRole("button", { name: "人物颜色：琥珀" })).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: "画面色调" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "自然" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "青橙电影" })).toBeTruthy();
    rerender(<VideoPalettePopover onChange={vi.fn()} value={{ ...value, visualTone: "neutral" }} />);
    expect(screen.getByText("已选中")).toBeTruthy();
    expect(screen.getAllByText("应用画面色调").length).toBeGreaterThan(0);

    const paletteText = screen.getByRole("dialog", { name: "调色盘" }).textContent ?? "";
    for (const english of [
      "Color palettes", "Context palette", "Visual tone", "context palette",
      "Neutral", "Cinematic teal", "Warm sunset", "Cool moonlight", "Monochrome",
    ]) {
      expect(paletteText).not.toContain(english);
    }
  });
});
