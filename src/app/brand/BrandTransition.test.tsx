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

  test("supports inline mode for contextual loading areas", () => {
    render(<BrandTransition label="Loading project..." variant="workspace" mode="inline" />);

    expect(screen.getByTestId("brand-transition").getAttribute("data-mode")).toBe("inline");
  });

  test("uses the enlarged cinematic animated brand mark", () => {
    render(<BrandTransition label="Loading workspace..." variant="workspace" />);

    expect(screen.getByTestId("brand-mark").getAttribute("data-size")).toBe("large");
    expect(screen.getByTestId("brand-mark-infinity-particle")).toBeTruthy();
    expect(screen.getByTestId("brand-mark-infinity-center-pulse")).toBeTruthy();
  });
});
