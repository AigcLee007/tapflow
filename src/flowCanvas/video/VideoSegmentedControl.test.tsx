import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { VideoSegmentedControl } from "./VideoSegmentedControl";

describe("VideoSegmentedControl", () => {
  test("describes disabled options in Chinese beyond a title", () => {
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

    const unavailable = screen.getByRole("radio", { name: /^4K/ });
    const descriptionId = unavailable.getAttribute("aria-describedby");
    expect(unavailable.getAttribute("aria-disabled")).toBe("true");
    expect(document.getElementById(descriptionId!)?.textContent).toContain("当前模型不支持 4K");

    fireEvent.focus(unavailable);
    expect(screen.getByRole("note").textContent).toContain("当前模型不支持 4K");
    fireEvent.click(unavailable);
    expect(onChange).not.toHaveBeenCalled();
  });

  test("uses arrows and Home/End to skip disabled options and select the focused option", () => {
    const onChange = vi.fn();
    render(
      <VideoSegmentedControl
        ariaLabel="生成数量"
        onChange={onChange}
        options={[
          { label: "1个", value: "1" },
          { disabled: true, label: "2个", value: "2" },
          { label: "4个", value: "4" },
        ]}
        value="1"
      />,
    );

    const first = screen.getByRole("radio", { name: "1个" });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "4个" }));
    expect(screen.getByRole("radio", { name: "4个" }).getAttribute("tabindex")).toBe("0");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith("4");

    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect(document.activeElement).toBe(first);
    expect(first.getAttribute("tabindex")).toBe("0");
    expect(onChange).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(first, { key: "End" });
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "4个" }));
    expect(onChange).toHaveBeenCalledTimes(3);
  });
});
