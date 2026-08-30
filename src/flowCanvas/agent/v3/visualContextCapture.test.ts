import { describe, expect, it } from "vitest";
import { buildVisualCaptureMetadata } from "./visualContextCapture";

describe("visual context capture", () => {
  it("keeps bounded server-authorized metadata only", () => { const value = buildVisualCaptureMetadata({ id: "cap", kind: "selection", width: 800, height: 600, expiresAt: new Date(Date.now() + 60_000).toISOString() }); expect(value).toEqual(expect.objectContaining({ id: "cap", width: 800, height: 600 })); expect(JSON.stringify(value)).not.toMatch(/data:|blob:|base64/i); });
  it("rejects expired and oversized captures", () => { expect(buildVisualCaptureMetadata({ id: "cap", kind: "viewport", width: 5000, height: 5000, expiresAt: new Date(Date.now() + 60_000).toISOString() })).toBeNull(); expect(buildVisualCaptureMetadata({ id: "cap", kind: "viewport", width: 10, height: 10, expiresAt: new Date(Date.now() - 1).toISOString() })).toBeNull(); });
});
