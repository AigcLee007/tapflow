import { describe, expect, it } from "vitest";
import { checkSkillDelivery } from "../src/modules/agent/skill-delivery-checks.js";

describe("skill delivery checks", () => {
  it("requires a real text artifact and reports review for partial output", () => {
    const result = checkSkillDelivery({ modality: "text", requiredArtifactCount: 2, run: { steps: [
      { action: "text", approvalState: "not_required", assetId: null, error: null, id: "step-1", nodeId: "n1", output: { text: "done" }, retryCount: 0, status: "succeeded", stepIndex: 0, workflowRunId: "run-1" },
      { action: "text", approvalState: "not_required", assetId: null, error: null, id: "step-2", nodeId: "n2", output: {}, retryCount: 0, status: "succeeded", stepIndex: 1, workflowRunId: "run-2" },
    ] } });
    expect(result.status).toBe("reviewing");
    expect(result.completedArtifacts).toBe(1);
    expect(result.issues.map((issue) => issue.code)).toContain("SKILL_DELIVERY_ARTIFACT_MISSING");
  });

  it("checks media kind, duration, aspect ratio, and text length before succeeding", () => {
    const result = checkSkillDelivery({
      modality: "video",
      requirements: { aspectRatio: "16:9", durationMs: 10_000, requiredArtifactCount: 1 },
      run: { steps: [{
        action: "video", approvalState: "not_required", assetId: "asset-1", error: null, id: "step-1", nodeId: "n1",
        output: { assetKind: "image", durationMs: 4_000, width: 1000, height: 1000 }, retryCount: 0, status: "succeeded", stepIndex: 0, workflowRunId: "run-1",
      }] },
    });
    expect(result.status).toBe("reviewing");
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "SKILL_DELIVERY_MODALITY_MISMATCH",
      "SKILL_DELIVERY_DURATION_MISMATCH",
      "SKILL_DELIVERY_ASPECT_MISMATCH",
    ]));
  });

  it("requires a minimum text length for text delivery", () => {
    const result = checkSkillDelivery({
      modality: "text",
      requirements: { textMinLength: 20 },
      run: { steps: [{
        action: "text", approvalState: "not_required", assetId: null, error: null, id: "step-1", nodeId: "n1",
        output: { text: "short" }, retryCount: 0, status: "succeeded", stepIndex: 0, workflowRunId: null,
      }] },
    });
    expect(result.status).toBe("reviewing");
    expect(result.issues.map((issue) => issue.code)).toContain("SKILL_DELIVERY_TEXT_TOO_SHORT");
  });
});
