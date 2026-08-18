import { describe, expect, test } from "vitest";

import { getWorkbenchEstimatedCredits } from "./workbenchPricing";

describe("getWorkbenchEstimatedCredits", () => {
  test.each([
    [{ quantity: 1, size: "2K" }, 2],
    [{ quantity: 4, size: "2k" }, 8],
    [{ quantity: 1, size: "4K" }, 4],
    [{ quantity: 0, size: "2K" }, 2],
  ])("estimates %j as %d credits", (draft, expected) => {
    expect(getWorkbenchEstimatedCredits(draft)).toBe(expected);
  });
});
