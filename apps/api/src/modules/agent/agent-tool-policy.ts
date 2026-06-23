import type { AgentToolName, ParsedAgentToolCall } from "./agent-tool-schemas.js";

export type AgentToolPolicyLimits = {
  allowBatchImage: boolean;
  allowImageEdit: boolean;
  allowVideo: boolean;
  maxEstimatedCredits: number;
  maxGeneratedItems: number;
  maxToolRounds: number;
  requireApproval: boolean;
};

export type AgentToolPermissionLevel = "safe_write" | "credit_required";

export type AgentToolPolicyResult = {
  allowed: true;
  permissionLevel: AgentToolPermissionLevel;
  requiresApproval: boolean;
};

export type AgentToolPolicyCall = Omit<ParsedAgentToolCall, "toolName"> & {
  toolName: AgentToolName;
};

export class AgentToolPolicyError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "AgentToolPolicyError";
  }
}

export function evaluateAgentToolPolicy(input: {
  call: AgentToolPolicyCall;
  estimatedCredits: number;
  generatedItemCount: number;
  limits: AgentToolPolicyLimits;
  successfulGenerationCount: number;
  toolRoundsUsed: number;
}): AgentToolPolicyResult {
  if (input.toolRoundsUsed >= input.limits.maxToolRounds) {
    throw new AgentToolPolicyError("AGENT_TOOL_ROUND_LIMIT_EXCEEDED", "Agent tool round limit exceeded.");
  }

  if (input.call.toolName === "generate_image_batch" && !input.limits.allowBatchImage) {
    throw new AgentToolPolicyError("AGENT_TOOL_DISABLED", "Batch image generation is disabled.");
  }

  if (input.call.toolName === "edit_image" && !input.limits.allowImageEdit) {
    throw new AgentToolPolicyError("AGENT_TOOL_DISABLED", "Image editing is disabled.");
  }

  if (input.generatedItemCount > input.limits.maxGeneratedItems) {
    throw new AgentToolPolicyError("AGENT_TOOL_ITEM_LIMIT_EXCEEDED", "Agent generated item limit exceeded.");
  }

  if (input.estimatedCredits > input.limits.maxEstimatedCredits) {
    throw new AgentToolPolicyError("AGENT_TOOL_CREDIT_LIMIT_EXCEEDED", "Agent credit limit exceeded.");
  }

  if (input.call.toolName === "continue_generation") {
    if (input.successfulGenerationCount <= 0) {
      throw new AgentToolPolicyError(
        "AGENT_CONTINUATION_REQUIRES_GENERATION",
        "Agent continuation requires at least one successful generation.",
      );
    }

    return {
      allowed: true,
      permissionLevel: "safe_write",
      requiresApproval: false,
    };
  }

  return {
    allowed: true,
    permissionLevel: "credit_required",
    requiresApproval: input.limits.requireApproval,
  };
}
