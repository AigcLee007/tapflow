import { describe, expect, test } from "vitest";

import { getAppRouteTransitionKey } from "./routes";

describe("getAppRouteTransitionKey", () => {
  test("keeps prompt plaza and prompt detail in one route family", () => {
    expect(getAppRouteTransitionKey("/prompts")).toBe("/prompts");
    expect(getAppRouteTransitionKey("/prompts/prompt-1")).toBe("/prompts");
    expect(getAppRouteTransitionKey("/assets")).toBe("/assets");
  });
});
