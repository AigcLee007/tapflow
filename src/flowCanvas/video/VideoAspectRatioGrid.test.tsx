import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { VideoAspectRatioGrid } from "./VideoAspectRatioGrid";

describe("VideoAspectRatioGrid", () => {
  test("renders every ratio in the fixed Chinese order with its geometric marker", () => {
    render(<VideoAspectRatioGrid onChange={vi.fn()} value="16:9" />);

    const buttons = screen.getAllByRole("radio");
    expect(buttons.map((button) => button.textContent?.trim())).toEqual([
      "自动", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9",
    ]);
    expect(screen.getByRole("radio", { name: "自动" }).getAttribute("data-ratio-shape")).toBe("auto");
    expect(screen.getByRole("radio", { name: "1:1" }).getAttribute("data-ratio-shape")).toBe("square");
    expect(screen.getByRole("radio", { name: "9:16" }).getAttribute("data-ratio-shape")).toBe("portrait");
    expect(screen.getByRole("radio", { name: "16:9" }).getAttribute("data-ratio-shape")).toBe("landscape");
    expect(screen.queryByText("Auto")).toBeNull();
  });

  test("keeps unsupported ratios visible with a Chinese reason and blocks selection", () => {
    const onChange = vi.fn();
    render(<VideoAspectRatioGrid allowedRatios={["auto", "16:9"]} onChange={onChange} value="16:9" />);

    const unsupported = screen.getByRole("radio", { name: "21:9" });
    expect(unsupported.getAttribute("aria-disabled")).toBe("true");
    expect(unsupported.getAttribute("title")).toBe("当前模型不支持 21:9");

    fireEvent.click(unsupported);
    expect(onChange).not.toHaveBeenCalled();
  });
});
