import { afterEach, describe, expect, test, vi } from "vitest";

import {
  clearRememberedEmail,
  getRememberedEmail,
  setRememberedEmail,
} from "./rememberedEmailPreference";

describe("remembered email preference", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  test("normalizes a remembered email without storing credentials", () => {
    setRememberedEmail(" Creator@Example.COM ");
    expect(getRememberedEmail()).toBe("creator@example.com");
    expect(window.localStorage.getItem("tapflow-auth-remembered-email-v1")).toBe("creator@example.com");
  });

  test("ignores malformed values and storage failures", () => {
    window.localStorage.setItem("tapflow-auth-remembered-email-v1", "not-an-email");
    expect(getRememberedEmail()).toBe("");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new DOMException("Blocked", "SecurityError"); });
    expect(getRememberedEmail()).toBe("");
    expect(() => clearRememberedEmail()).not.toThrow();
  });
});
