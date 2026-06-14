import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { MenuSelect } from "./MenuSelect";

describe("MenuSelect", () => {
  test("opens a styled option list and selects a value", () => {
    const onChange = vi.fn();

    render(
      <MenuSelect
        label="排序"
        onChange={onChange}
        options={[
          { label: "最近更新", value: "updated" },
          { label: "最近创建", value: "created" },
        ]}
        value="updated"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "排序 最近更新" }));
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitem", { name: "最近创建" }));
    expect(onChange).toHaveBeenCalledWith("created");
  });

  test("supports compact full-width and disabled trigger states", () => {
    render(
      <MenuSelect
        label="服务商"
        disabled
        fullWidth
        onChange={() => undefined}
        options={[
          { label: "全部服务商", value: "" },
          { label: "OpenAI", value: "openai" },
        ]}
        size="compact"
        value=""
      />,
    );

    const trigger = screen.getByRole("button", { name: "服务商 全部服务商" });
    expect(trigger.className).toContain("w-full");
    expect(trigger.className).toContain("h-[38px]");
    expect(trigger).toHaveProperty("disabled", true);
  });
});
