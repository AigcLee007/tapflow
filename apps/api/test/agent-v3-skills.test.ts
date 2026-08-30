import { describe, expect, it } from "vitest";
import { projectSkillV1ToV2, skillManifestV2Schema } from "../src/modules/agent/v3/skill-contract-v2.js";

describe("Skill Contract V2", () => {
  it("projects a v1 skill into an allowlisted executable manifest", () => { const result = projectSkillV1ToV2({ id: "s", version: 1, name: "Poster", summary: "poster", modality: "image", normalized: { inputHints: [], methodSteps: [{ id: "make", action: "image", instruction: "make" }], deliveryChecks: ["asset"] } }); expect(result.available).toBe(true); expect(result.allowedTools).toEqual(["canvas.image"]); });
  it("rejects provider and credential fields", () => { expect(() => skillManifestV2Schema.parse({ schemaVersion: 2, id: "s", version: 1, name: "x", summary: "x", modality: "text", intent: "x", inputs: [], outputs: [], allowedTools: ["canvas.text"], steps: [{ id: "x", tool: "canvas.text", input: { provider: "secret" } }], approvalPolicy: { requiresApproval: false, requiresPricing: false }, pricingPolicy: { requiresPricing: false }, retryPolicy: { maxAttempts: 1 }, deliveryChecks: [] })).toThrow(); });
});
