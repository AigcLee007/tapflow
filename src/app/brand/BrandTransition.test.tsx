import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { BrandTransition } from "./BrandTransition";

describe("BrandTransition", () => {
  test("renders workspace loading copy with an animated visual", () => {
    render(<BrandTransition label="正在加载工作区..." variant="workspace" />);

    expect(screen.getByText("正在加载工作区...")).toBeTruthy();
    expect(screen.getByTestId("brand-transition").getAttribute("data-variant")).toBe("workspace");
  });

  test("renders canvas variant for project transitions", () => {
    render(<BrandTransition label="正在打开项目画布..." variant="canvas" />);

    expect(screen.getByText("正在打开项目画布...")).toBeTruthy();
    expect(screen.getByTestId("brand-transition").getAttribute("data-variant")).toBe("canvas");
  });

  test("supports inline mode for contextual loading areas", () => {
    render(<BrandTransition label="正在加载项目..." variant="workspace" mode="inline" />);

    expect(screen.getByTestId("brand-transition").getAttribute("data-mode")).toBe("inline");
  });
});
