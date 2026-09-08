import { describe, expect, it } from "vitest";
import { normalizeStableId } from "./stableId";

describe("normalizeStableId", () => {
  it("accepts bounded stable identifiers", () => {
    expect(normalizeStableId("asset-1:preview_2.v1")).toBe("asset-1:preview_2.v1");
  });

  it("rejects transient URLs, tokens, whitespace, and overlong values", () => {
    for (const value of [
      "data:image/png;base64,abc",
      "blob:https://example.test/asset",
      "https://signed.example.test/file?token=secret",
      "asset id",
      "x".repeat(201),
    ]) {
      expect(normalizeStableId(value)).toBeUndefined();
    }
  });
});
