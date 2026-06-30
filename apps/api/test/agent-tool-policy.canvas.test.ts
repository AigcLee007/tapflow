import { describe, expect, it } from "vitest";

import { evaluateAgentToolPolicy } from "../src/modules/agent/agent-tool-policy.js";

const limits = {
  allowBatchImage: true,
  allowImageEdit: true,
  allowVideo: false,
  maxEstimatedCredits: 50,
  maxGeneratedItems: 8,
  maxToolRounds: 8,
  requireApproval: true,
};

describe("agent tool policy canvas", () => {
  it("marks create canvas tools as safe writes", () => {
    const result = evaluateAgentToolPolicy({
      call: {
        arguments: {
          nodes: [
            {
              data: { title: "Prompt" },
              kind: "text",
              position: { x: 10, y: 20 },
            },
          ],
        },
        toolCallKey: "canvas-1",
        toolName: "create_canvas_nodes",
      },
      estimatedCredits: 0,
      generatedItemCount: 0,
      limits,
      successfulGenerationCount: 0,
      toolRoundsUsed: 0,
    });

    expect(result).toMatchObject({
      allowed: true,
      permissionLevel: "safe_write",
      requiresApproval: false,
    });
  });

  it("marks run canvas node as credit required", () => {
    const result = evaluateAgentToolPolicy({
      call: {
        arguments: {
          nodeId: "image-1",
          runMode: "target_node",
        },
        toolCallKey: "canvas-run-1",
        toolName: "run_canvas_node",
      },
      estimatedCredits: 4,
      generatedItemCount: 1,
      limits,
      successfulGenerationCount: 0,
      toolRoundsUsed: 0,
    });

    expect(result.permissionLevel).toBe("credit_required");
    expect(result.requiresApproval).toBe(true);
  });
});
