import type { ApiEnv } from "../../config/env.js";

export type AgentRuntimeIdentity = "v3_real" | "v2_real" | "unavailable" | "offline_demo";

export function resolveAgentRuntimeIdentity(env: Pick<ApiEnv, "agentV2Enabled" | "agentV2RuntimeEnabled" | "agentV3Enabled" | "agentV3RuntimeEnabled">): AgentRuntimeIdentity {
  if (env.agentV3Enabled || env.agentV3RuntimeEnabled) {
    return env.agentV3Enabled && env.agentV3RuntimeEnabled ? "v3_real" : "unavailable";
  }
  if (env.agentV2Enabled && env.agentV2RuntimeEnabled) {
    return "v2_real";
  }
  return "unavailable";
}
