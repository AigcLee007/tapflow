import { describe, expect, it } from "vitest";

import {
  AgentToolPolicyError,
  evaluateAgentToolPolicy,
} from "../src/modules/agent/agent-tool-policy.js";
import type { ParsedAgentToolCall } from "../src/modules/agent/agent-tool-schemas.js";

function toolCall(input: Partial<ParsedAgentToolCall> & Pick<ParsedAgentToolCall, "toolName">): ParsedAgentToolCall {
  return {
    arguments: {},
    toolCallKey: "call_1",
    ...input,
  } as ParsedAgentToolCall;
}

const baseLimits = {
  allowBatchImage: true,
  allowImageEdit: false,
  allowVideo: false,
  maxEstimatedCredits: 20,
  maxGeneratedItems: 4,
  maxToolRounds: 3,
  requireApproval: true,
};

describe("agent tool policy", () => {
  it("allows a credit-consuming single image call with approval required", () => {
    const result = evaluateAgentToolPolicy({
      call: toolCall({ arguments: { prompt: "Create image" }, toolName: "generate_image" }),
      estimatedCredits: 4,
      generatedItemCount: 1,
      limits: baseLimits,
      successfulGenerationCount: 0,
      toolRoundsUsed: 0,
    });

    expect(result).toEqual({
      allowed: true,
      permissionLevel: "credit_required",
      requiresApproval: true,
    });
  });

  it("rejects disabled batch image calls", () => {
    expect(() => evaluateAgentToolPolicy({
      call: toolCall({ arguments: { images: [] }, toolName: "generate_image_batch" }),
      estimatedCredits: 4,
      generatedItemCount: 2,
      limits: { ...baseLimits, allowBatchImage: false },
      successfulGenerationCount: 0,
      toolRoundsUsed: 0,
    })).toThrow(AgentToolPolicyError);
  });

  it("rejects calls over credit and item limits", () => {
    expect(() => evaluateAgentToolPolicy({
      call: toolCall({ arguments: { prompt: "Create image" }, toolName: "generate_image" }),
      estimatedCredits: 21,
      generatedItemCount: 1,
      limits: baseLimits,
      successfulGenerationCount: 0,
      toolRoundsUsed: 0,
    })).toThrow(/credit limit/i);

    expect(() => evaluateAgentToolPolicy({
      call: toolCall({ arguments: { images: [] }, toolName: "generate_image_batch" }),
      estimatedCredits: 10,
      generatedItemCount: 5,
      limits: baseLimits,
      successfulGenerationCount: 0,
      toolRoundsUsed: 0,
    })).toThrow(/item limit/i);
  });

  it("allows continuation only after a successful generation and within round limit", () => {
    expect(evaluateAgentToolPolicy({
      call: toolCall({ arguments: { reason: "continue" }, toolName: "continue_generation" }),
      estimatedCredits: 0,
      generatedItemCount: 0,
      limits: baseLimits,
      successfulGenerationCount: 1,
      toolRoundsUsed: 1,
    })).toEqual({
      allowed: true,
      permissionLevel: "safe_write",
      requiresApproval: false,
    });

    expect(() => evaluateAgentToolPolicy({
      call: toolCall({ arguments: { reason: "continue" }, toolName: "continue_generation" }),
      estimatedCredits: 0,
      generatedItemCount: 0,
      limits: baseLimits,
      successfulGenerationCount: 0,
      toolRoundsUsed: 1,
    })).toThrow(/successful generation/i);

    expect(() => evaluateAgentToolPolicy({
      call: toolCall({ arguments: { reason: "continue" }, toolName: "continue_generation" }),
      estimatedCredits: 0,
      generatedItemCount: 0,
      limits: baseLimits,
      successfulGenerationCount: 1,
      toolRoundsUsed: 3,
    })).toThrow(/round limit/i);
  });
});
