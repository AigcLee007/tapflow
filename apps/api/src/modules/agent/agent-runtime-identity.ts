import type { ApiEnv } from "../../config/env.js";

export type AgentRuntimeIdentity = "v3_real" | "v2_real" | "unavailable" | "offline_demo";

type AgentRuntimeFlags = Pick<ApiEnv, "agentV2Enabled" | "agentV2RuntimeEnabled" | "agentV3Enabled" | "agentV3RuntimeEnabled">;

export function resolveAgentRuntimeIdentity(env: AgentRuntimeFlags): AgentRuntimeIdentity {
  if (env.agentV3Enabled || env.agentV3RuntimeEnabled) {
    return env.agentV3Enabled && env.agentV3RuntimeEnabled ? "v3_real" : "unavailable";
  }
  if (env.agentV2Enabled && env.agentV2RuntimeEnabled) {
    return "v2_real";
  }
  return "unavailable";
}

export function projectAgentRuntimeCapabilities(env: AgentRuntimeFlags) {
  const runtimeIdentity = resolveAgentRuntimeIdentity(env);
  const v3RolloutActive = env.agentV3Enabled === true || env.agentV3RuntimeEnabled === true;
  return {
    runtimeIdentity,
    agentV2Enabled: v3RolloutActive ? false : env.agentV2Enabled === true,
    agentV2RuntimeEnabled: v3RolloutActive ? false : env.agentV2RuntimeEnabled === true,
  };
}
