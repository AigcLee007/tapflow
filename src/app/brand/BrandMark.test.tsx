import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { BrandMark } from "./BrandMark";

describe("BrandMark", () => {
  test("renders the logo with an accessible label", () => {
    render(<BrandMark />);

    expect(screen.getByRole("img", { name: "Aittco" })).toBeTruthy();
  });

  test("supports compact and canvas sizes", () => {
    const { rerender } = render(<BrandMark size="compact" />);
    expect(screen.getByTestId("brand-mark").getAttribute("data-size")).toBe("compact");

    rerender(<BrandMark size="canvas" />);
    expect(screen.getByTestId("brand-mark").getAttribute("data-size")).toBe("canvas");
  });

  test("can render without the text caption inside tight canvas chrome", () => {
    render(<BrandMark showCaption={false} />);

    expect(screen.queryByText("Aittco")).toBeNull();
  });

  test("can render an animated infinity highlight for transition states", () => {
    render(<BrandMark animated />);

    expect(screen.getByTestId("brand-mark").getAttribute("data-animated")).toBe("true");
    expect(screen.getByTestId("brand-mark-infinity")).toBeTruthy();
  });

  test("renders cinematic animation layers when animated", () => {
    render(<BrandMark animated size="large" />);

    expect(screen.getByTestId("brand-mark-orb")).toBeTruthy();
    expect(screen.getByTestId("brand-mark-infinity-particle")).toBeTruthy();
    expect(screen.getByTestId("brand-mark-infinity-center-pulse")).toBeTruthy();
    expect(screen.getByTestId("brand-mark").getAttribute("data-size")).toBe("large");
  });
});
