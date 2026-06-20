import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { BrandTransition } from "./BrandTransition";

describe("BrandTransition", () => {
  test("renders workspace loading copy with an animated visual", () => {
    render(<BrandTransition label="Loading workspace..." variant="workspace" />);

    expect(screen.getByText("Loading workspace...")).toBeTruthy();
    expect(screen.getByTestId("brand-transition").getAttribute("data-variant")).toBe("workspace");
  });

  test("renders canvas variant for project transitions", () => {
    render(<BrandTransition label="Opening project canvas..." variant="canvas" />);

    expect(screen.getByText("Opening project canvas...")).toBeTruthy();
    expect(screen.getByTestId("brand-transition").getAttribute("data-variant")).toBe("canvas");
  });

  test("floats the transparent logo without a rectangular loading card", () => {
    render(<BrandTransition label="Opening project canvas..." variant="canvas" />);

    const core = screen.getByTestId("brand-transition-core");
    expect(core.className).toContain("brand-transition__float");
    expect(core.className).not.toContain("brand-transition__core");
    expect(screen.getByRole("img", { name: "Aittco" }).getAttribute("src")).toBe("/logo-2.png");
    expect(screen.getByTestId("brand-mark-orb").className).toContain("brand-mark__orb--transparent");
  });

  test("supports inline mode for contextual loading areas", () => {
    render(<BrandTransition label="Loading project..." variant="workspace" mode="inline" />);

    expect(screen.getByTestId("brand-transition").getAttribute("data-mode")).toBe("inline");
  });

  test("uses a static transparent brand mark for transition states", () => {
    render(<BrandTransition label="Loading workspace..." variant="workspace" />);

    expect(screen.getByTestId("brand-mark").getAttribute("data-size")).toBe("large");
    expect(screen.queryByTestId("brand-mark-infinity-particle")).toBeNull();
    expect(screen.queryByTestId("brand-mark-infinity-center-pulse")).toBeNull();
  });
});
