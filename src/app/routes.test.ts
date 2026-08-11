import { describe, expect, test } from "vitest";

import { FORGOT_PASSWORD_ROUTE, LOGIN_ROUTE, PRODUCT_ROUTES, REGISTER_ROUTE, getAppRouteTransitionKey } from "./routes";

describe("getAppRouteTransitionKey", () => {
  test("keeps prompt plaza and prompt detail in one route family", () => {
    expect(getAppRouteTransitionKey("/prompts")).toBe("/prompts");
    expect(getAppRouteTransitionKey("/prompts/prompt-1")).toBe("/prompts");
    expect(getAppRouteTransitionKey("/assets")).toBe("/assets");
  });
});

describe("public auth routes", () => {
  test("keeps login, registration, and password recovery as supported product routes", () => {
    expect(PRODUCT_ROUTES).toEqual(expect.arrayContaining([LOGIN_ROUTE, REGISTER_ROUTE, FORGOT_PASSWORD_ROUTE]));
  });
});
