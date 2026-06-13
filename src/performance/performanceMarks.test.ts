import { describe, expect, it } from "vitest";

import { markMeasure } from "./performanceMarks";

describe("markMeasure", () => {
  it("does nothing when performance marks are unavailable", () => {
    expect(() => markMeasure("asset-drawer", "start", "end")).not.toThrow();
  });
});
