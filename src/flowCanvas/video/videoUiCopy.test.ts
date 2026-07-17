import { describe, expect, test } from "vitest";

import { VIDEO_UI_COPY, VIDEO_UI_MODE_COPY, VIDEO_UI_REFERENCE_ROLE_COPY } from "./videoUiCopy";

const MOJIBAKE_TOKENS = ["\uFFFD", "\u00E9\u00A2\u0091", "\u00E7\u0094\u009F", "\u00E8\u00A7\u0086", "\u00A6\u0086"];

function collectCopyValues(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  return Object.values(value).flatMap(collectCopyValues);
}

describe("VIDEO_UI_COPY", () => {
  test("provides non-empty Chinese creator copy without replacement characters or mojibake", () => {
    const values = collectCopyValues({
      VIDEO_UI_COPY,
      VIDEO_UI_MODE_COPY,
      VIDEO_UI_REFERENCE_ROLE_COPY,
    });

    expect(values.length).toBeGreaterThan(20);
    for (const value of values) {
      expect(value.trim()).not.toBe("");
      expect(value).toMatch(/[\u3400-\u9FFF]/u);
      for (const token of MOJIBAKE_TOKENS) expect(value).not.toContain(token);
    }
  });
});
