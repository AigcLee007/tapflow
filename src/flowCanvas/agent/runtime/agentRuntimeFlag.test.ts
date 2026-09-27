import { describe, expect, it } from "vitest";
import { shouldUseCanonicalAgentRuntime } from "../CanvasAgentPanel";

describe("canonical Agent Runtime build flag", () => {
  it("keeps the legacy UI as the default", () => {
    expect(shouldUseCanonicalAgentRuntime(undefined)).toBe(false);
    expect(shouldUseCanonicalAgentRuntime("false")).toBe(false);
  });
  it("selects canonical UI only when explicitly enabled", () => {
    expect(shouldUseCanonicalAgentRuntime("true")).toBe(true);
  });
});
