import { describe, expect, it, vi } from "vitest";

import { clearPerformanceMeasure, markMeasure, markNow } from "./performanceMarks";

describe("markMeasure", () => {
  it("does nothing when performance marks are unavailable", () => {
    expect(() => markMeasure("asset-drawer", "start", "end")).not.toThrow();
  });

  it("forwards marks and clears recorded measures when performance APIs exist", () => {
    const mark = vi.fn();
    const measure = vi.fn();
    const clearMeasures = vi.fn();
    vi.stubGlobal("performance", {
      clearMeasures,
      mark,
      measure,
    });

    markNow("workbench-submit-click");
    markMeasure("workbench-submit-to-created", "workbench-submit-click", "workbench-generation-created");
    clearPerformanceMeasure("workbench-submit-to-created");

    expect(mark).toHaveBeenCalledWith("workbench-submit-click");
    expect(measure).toHaveBeenCalledWith(
      "workbench-submit-to-created",
      "workbench-submit-click",
      "workbench-generation-created",
    );
    expect(clearMeasures).toHaveBeenCalledWith("workbench-submit-to-created");
  });
});
