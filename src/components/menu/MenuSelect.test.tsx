import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { MenuSelect } from "./MenuSelect";

describe("MenuSelect", () => {
  test("opens a styled option list and selects a value", () => {
    render(
      <MenuSelect
        label="排序"
        onChange={() => undefined}
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
  });
});
