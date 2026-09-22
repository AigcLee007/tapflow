import { describe, expect, it } from "vitest";
import { verifyAgentDeliveryGroup } from "../src/modules/agent/runtime/agent-runtime.service.js";

const expectedSteps = [
  { id: "first", label: "首帧", kind: "image" as const },
  { id: "last", label: "尾帧", kind: "image" as const },
  { id: "prompt", label: "视频提示词", kind: "text" as const },
];

const result = (stepId: string, kind: "image" | "text", overrides: Record<string, unknown> = {}) => ({
  id: `result-${stepId}`,
  resultGroupId: "group",
  assetId: kind === "image" ? `asset-${stepId}` : null,
  runId: "run",
  kind,
  label: expectedSteps.find((step) => step.id === stepId)?.label ?? stepId,
  sourceRefs: [],
  lineage: { stepId, nodeId: `node-${stepId}` },
  placedNodeId: null,
  status: "ready",
  contentText: kind === "text" ? "camera moves forward" : null,
  ...overrides,
});

describe("Agent delivery verification", () => {
  it("requires every planned step to have a valid asset or text delivery", () => {
    expect(() => verifyAgentDeliveryGroup([
      result("first", "image"),
      result("last", "image", { assetId: null }),
      result("prompt", "text", { contentText: "" }),
    ] as never, expectedSteps)).toThrow("AGENT_DELIVERY_INVALID_RESULT");
  });

  it("accepts a complete first-last-frame delivery group with empty source references", () => {
    expect(verifyAgentDeliveryGroup([
      result("first", "image"),
      result("last", "image"),
      result("prompt", "text"),
    ] as never, expectedSteps)).toHaveLength(3);
  });

  it("rejects incomplete workflow or missing node evidence before completion", () => {
    const results = expectedSteps.map((step) => result(step.id, step.kind));
    expect(() => verifyAgentDeliveryGroup(results as never, expectedSteps, {
      workflowStatus: "running",
      nodeRuns: expectedSteps.map((step) => ({ nodeId: `node-${step.id}`, status: "succeeded" })),
    })).toThrow("AGENT_DELIVERY_WORKFLOW_NOT_COMPLETED");

    expect(() => verifyAgentDeliveryGroup(results as never, expectedSteps, {
      workflowStatus: "succeeded",
      nodeRuns: expectedSteps.slice(0, 2).map((step) => ({ nodeId: `node-${step.id}`, status: "succeeded" })),
    })).toThrow("AGENT_DELIVERY_NODE_MISSING");
  });

  it("does not satisfy a run with a result from another run even when the step id matches", () => {
    const stale = result("first", "image", { runId: "old-run" });
    expect(() => verifyAgentDeliveryGroup([stale] as never, [expectedSteps[0]], { workflowStatus: "succeeded", runId: "current-run" })).toThrow("AGENT_DELIVERY_RESULT_MISSING");
  });
});
