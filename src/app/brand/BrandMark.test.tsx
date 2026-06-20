import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { BrandMark } from "./BrandMark";

describe("BrandMark", () => {
  test("renders the logo with an accessible label", () => {
    render(<BrandMark />);

    const logo = screen.getByRole("img", { name: "Aittco" });
    expect(logo).toBeTruthy();
    expect(logo.getAttribute("src")).toBe("/logo-2.png");
  });

  test("renders the transparent PNG without a framed logo surface", () => {
    render(<BrandMark />);

    const orb = screen.getByTestId("brand-mark-orb");
    expect(orb.className).toContain("brand-mark__orb--transparent");
    expect(orb.className).not.toContain("brand-mark__orb--bare");
    expect(orb.className).not.toContain("rounded-full");
  });

  test("supports 300 by 200 ratio compact and canvas sizes", () => {
    const { rerender } = render(<BrandMark size="compact" />);
    expect(screen.getByTestId("brand-mark").getAttribute("data-size")).toBe("compact");
    expect(screen.getByTestId("brand-mark-orb").className).toContain("h-8 w-12");

    rerender(<BrandMark size="canvas" />);
    expect(screen.getByTestId("brand-mark").getAttribute("data-size")).toBe("canvas");
    expect(screen.getByTestId("brand-mark-orb").className).toContain("h-12 w-[72px]");
  });

  test("supports a 300 by 200 ratio header logo", () => {
    render(<BrandMark size="header" />);

    expect(screen.getByTestId("brand-mark").getAttribute("data-size")).toBe("header");
    expect(screen.getByTestId("brand-mark-orb").className).toContain("h-20 w-[120px]");
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
