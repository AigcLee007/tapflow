import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { VideoSegmentedControl } from "./VideoSegmentedControl";

describe("VideoSegmentedControl", () => {
  test("exposes equal radio options and never calls back for a disabled option", () => {
    const onChange = vi.fn();
    render(
      <VideoSegmentedControl
        ariaLabel="清晰度"
        onChange={onChange}
        options={[
          { label: "480P", value: "480P" },
          { disabled: true, disabledReason: "当前模型不支持 4K", label: "4K", value: "4K" },
        ]}
        value="480P"
      />,
    );

    expect(screen.getByRole("radiogroup", { name: "清晰度" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "480P" }).getAttribute("aria-checked")).toBe("true");
    const unavailable = screen.getByRole("radio", { name: "4K" });
    expect(unavailable.getAttribute("aria-disabled")).toBe("true");
    expect(unavailable.getAttribute("title")).toBe("当前模型不支持 4K");

    fireEvent.click(unavailable);
    expect(onChange).not.toHaveBeenCalled();
  });

  test("keeps keyboard focus on the actual radio button", () => {
    render(
      <VideoSegmentedControl
        ariaLabel="生成数量"
        onChange={vi.fn()}
        options={[{ label: "1个", value: "1" }, { label: "2个", value: "2" }]}
        value="1"
      />,
    );

    const first = screen.getByRole("radio", { name: "1个" });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(document.activeElement).toBe(first);
  });
});
