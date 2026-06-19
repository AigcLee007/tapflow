import { describe, expect, test } from "vitest";

import {
  APP_VERSION_CHECK_INTERVAL_MS,
  hasVersionChanged,
  normalizeVersionManifest,
} from "./versionReminder";

describe("version reminder helpers", () => {
  test("uses a one hour check interval", () => {
    expect(APP_VERSION_CHECK_INTERVAL_MS).toBe(60 * 60 * 1000);
  });

  test("does not report a change when versions match", () => {
    expect(hasVersionChanged("abc123", { version: "abc123" })).toBe(false);
  });

  test("reports a change when the fetched version differs from the current version", () => {
    expect(hasVersionChanged("abc123", { version: "def456" })).toBe(true);
  });

  test("ignores empty current or fetched versions", () => {
    expect(hasVersionChanged("", { version: "def456" })).toBe(false);
    expect(hasVersionChanged("abc123", { version: "" })).toBe(false);
  });

  test("normalizes valid manifest payloads", () => {
    expect(
      normalizeVersionManifest({
        builtAt: "2026-06-19T00:00:00.000Z",
        commit: "abc123",
        version: "release-1",
      }),
    ).toEqual({
      builtAt: "2026-06-19T00:00:00.000Z",
      commit: "abc123",
      version: "release-1",
    });
  });

  test("rejects malformed manifest payloads", () => {
    expect(normalizeVersionManifest(null)).toBeNull();
    expect(normalizeVersionManifest({ version: 123 })).toBeNull();
    expect(normalizeVersionManifest({ builtAt: "date" })).toBeNull();
  });
});
