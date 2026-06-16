import type { AiGatewayTextResult, DatabaseTextGenerationRuntime } from "@aigc-flow/ai-gateway-core";
import type { z } from "zod";

import type { ApiEnv } from "../../config/env.js";
import { buildAgentPlannerContext } from "./agent-context-builder.js";
import { parseAgentPlannerOutput } from "./agent-planner-parser.js";
import { AGENT_SYSTEM_PROMPT, buildAgentRepairPrompt } from "./agent-planner-prompt.js";
import type { CanvasAgentSnapshotInput } from "./agent.schemas.js";

export class AgentPlannerRuntimeError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "AgentPlannerRuntimeError";
  }
}

type RuntimeContext = {
  tenantId: string;
  userId: string | null;
};

type PlannerSchema<T> = z.ZodSchema<T>;

export class AgentPlannerService<T> {
  constructor(
    private readonly env: ApiEnv,
    private readonly textRuntime: Pick<DatabaseTextGenerationRuntime, "generateText">,
    private readonly schema: PlannerSchema<T>,
  ) {}

  async planWithLlm(context: RuntimeContext, prompt: string, snapshot: CanvasAgentSnapshotInput): Promise<T> {
    if (!this.env.agentPlannerEnabled) {
      throw new AgentPlannerRuntimeError("AGENT_PLANNER_NOT_ENABLED", "Agent planner is not enabled.");
    }
    if (!this.env.agentTextRouteKey.trim()) {
      throw new AgentPlannerRuntimeError("AGENT_TEXT_ROUTE_NOT_CONFIGURED", "Agent text route is not configured.");
    }

    const baseMessages = [
      { content: AGENT_SYSTEM_PROMPT, role: "system" as const },
      { content: buildAgentPlannerContext({ prompt, snapshot }), role: "user" as const },
    ];

    const attempts = Math.max(0, this.env.agentPlannerRepairAttempts);
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= attempts; attempt += 1) {
      let runtimeResult: AiGatewayTextResult;
      try {
        runtimeResult = await this.textRuntime.generateText(context, {
          maxTokens: 2000,
          messages:
            attempt === 0
              ? baseMessages
              : [
                  ...baseMessages,
                  { content: buildAgentRepairPrompt([lastError?.message ?? "Unknown validation error"]), role: "system" as const },
                ],
          routeKey: this.env.agentTextRouteKey,
          temperature: 0.2,
        });
      } catch (error) {
        throw new AgentPlannerRuntimeError(
          "AGENT_PLANNER_RUNTIME_FAILED",
          error instanceof Error ? error.message : String(error),
        );
      }

      try {
        return parseAgentPlannerOutput(runtimeResult.outputText, this.schema);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    throw new AgentPlannerRuntimeError(
      "AGENT_PLANNER_INVALID_OUTPUT",
      lastError?.message ?? "Agent planner returned an invalid plan.",
    );
  }
}
