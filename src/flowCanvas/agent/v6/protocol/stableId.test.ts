import { describe, expect, it } from "vitest";
import { normalizeStableId } from "./stableId";

describe("Agent V6 stable IDs", () => {
  it("accepts bounded ASCII IDs with internal hyphens and underscores", () => {
    expect(normalizeStableId("a")).toBe("a");
    expect(normalizeStableId("node_01-safe")).toBe("node_01-safe");
    expect(normalizeStableId("550e8400-e29b-41d4-a716-446655440000")).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(normalizeStableId("a".repeat(128))).toBe("a".repeat(128));
  });

  it("rejects empty, oversized, separator-edged, and non-ASCII IDs", () => {
    for (const value of ["", `a${"b".repeat(128)}`, "-id", "id-", "_id", "id_", "a.b", "a:b", "中文-id"]) {
      expect(normalizeStableId(value), value).toBeUndefined();
    }
  });

  it("rejects URLs, JWTs, base64-like values, and credential-shaped prefixes", () => {
    for (const value of [
      "https://example.com/id",
      "data:text/plain;base64,abc",
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature",
      "eyJhbGciOiJIUzI1NiJ9_fake_token_value",
      "c2Vuc2l0aXZlLXRva2VuLXZhbHVl",
      "sk-test-secret",
      "AIzaSyExampleKey",
      "ghp_example_token",
    ]) {
      expect(normalizeStableId(value), value).toBeUndefined();
    }
  });
});
