import { afterEach, describe, expect, test } from "vitest";

import { getSafeReturnTo, navigateAuthMode } from "./authNavigation";

describe("auth navigation", () => {
  afterEach(() => window.history.replaceState(null, "", "/"));

  test("keeps only same-origin non-auth return targets", () => {
    window.history.replaceState(null, "", "/login?returnTo=%2Fprojects%2Fproject-1%3Ftab%3Dcanvas");
    expect(getSafeReturnTo()).toBe("/projects/project-1?tab=canvas");
  });

  test.each(["//evil.example", "https://evil.example/workspace", "projects/project-1", "/login", "/register?x=1", "/forgot-password"]) (
    "rejects unsafe or looping return target %s",
    (returnTo) => {
      window.history.replaceState(null, "", `/login?returnTo=${encodeURIComponent(returnTo)}`);
      expect(getSafeReturnTo()).toBe("/workspace");
    },
  );

  test("preserves a safe return target when switching modes", () => {
    window.history.replaceState(null, "", "/login?returnTo=%2Fassets");
    navigateAuthMode("register");
    expect(window.location.pathname + window.location.search).toBe("/register?returnTo=%2Fassets");
  });
});
