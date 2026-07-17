import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { VideoAspectRatioGrid } from "./VideoAspectRatioGrid";

describe("VideoAspectRatioGrid", () => {
  test("renders every ratio with a distinct aspect-ratio marker", () => {
    render(<VideoAspectRatioGrid onChange={vi.fn()} value="16:9" />);

    const buttons = screen.getAllByRole("radio");
    expect(buttons.map((button) => button.getAttribute("data-ratio"))).toEqual([
      "auto", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9",
    ]);

    const marker = (ratio: string) => screen.getByRole("radio", { name: ratio }).querySelector("[data-ratio-marker]") as HTMLElement;
    expect(marker("16:9").style.aspectRatio).toBe("16 / 9");
    expect(marker("4:3").style.aspectRatio).toBe("4 / 3");
    expect(marker("21:9").style.aspectRatio).toBe("21 / 9");
    expect(marker("3:4").style.aspectRatio).toBe("3 / 4");
    expect(marker("9:16").style.aspectRatio).toBe("9 / 16");
  });

  test("describes an unsupported ratio in Chinese and exposes its note on focus", () => {
    const onChange = vi.fn();
    render(<VideoAspectRatioGrid allowedRatios={["auto", "16:9"]} onChange={onChange} value="16:9" />);

    const unsupported = screen.getByRole("radio", { name: /^21:9/ });
    const descriptionId = unsupported.getAttribute("aria-describedby");
    expect(unsupported.getAttribute("aria-disabled")).toBe("true");
    expect(descriptionId).toBeTruthy();
    expect(document.getElementById(descriptionId!)?.textContent).toContain("当前模型不支持 21:9");

    fireEvent.focus(unsupported);
    expect(screen.getByRole("note").textContent).toContain("当前模型不支持 21:9");

    fireEvent.click(unsupported);
    expect(onChange).not.toHaveBeenCalled();
  });

  test("moves through enabled ratios with standard radio keyboard navigation", () => {
    const onChange = vi.fn();
    render(<VideoAspectRatioGrid allowedRatios={["auto", "16:9", "4:3", "21:9"]} onChange={onChange} value="16:9" />);

    const selected = screen.getByRole("radio", { name: "16:9" });
    selected.focus();
    fireEvent.keyDown(selected, { key: "ArrowRight" });
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "4:3" }));
    expect(screen.getByRole("radio", { name: "4:3" }).getAttribute("tabindex")).toBe("0");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith("4:3");

    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "21:9" }));
    expect(onChange).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "自动" }));
    expect(screen.getByRole("radio", { name: "自动" }).getAttribute("tabindex")).toBe("0");
    expect(onChange).toHaveBeenCalledTimes(3);
  });
});
