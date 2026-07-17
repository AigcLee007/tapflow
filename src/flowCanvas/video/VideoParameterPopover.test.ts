import { describe, expect, test } from "vitest";

import { getVideoParameterPopoverPosition } from "./VideoParameterPopover";

describe("VideoParameterPopover positioning", () => {
  test("places the panel above its anchor when there is enough room", () => {
    expect(getVideoParameterPopoverPosition(
      { bottom: 760, left: 720, right: 820, top: 720 },
      { height: 900, width: 1440 },
      { height: 620, width: 480 },
    )).toEqual({ left: 720, placement: "top", top: 92 });
  });

  test("places the panel below a top anchor and clamps it inside a narrow viewport", () => {
    expect(getVideoParameterPopoverPosition(
      { bottom: 70, left: -20, right: 80, top: 32 },
      { height: 844, width: 390 },
      { height: 620, width: 358 },
    )).toEqual({ left: 16, placement: "bottom", top: 78 });
  });
});
