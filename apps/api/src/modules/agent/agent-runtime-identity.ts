import type { ApiEnv } from "../../config/env.js";

export type AgentRuntimeIdentity = "v4_real" | "v3_real" | "v2_real" | "unavailable" | "offline_demo";

type AgentRuntimeFlags = Pick<ApiEnv, "agentV2Enabled" | "agentV2RuntimeEnabled" | "agentV3Enabled" | "agentV3RuntimeEnabled" | "agentV4Enabled" | "agentV4RuntimeEnabled">;

export function resolveAgentRuntimeIdentity(env: AgentRuntimeFlags): AgentRuntimeIdentity {
  if (env.agentV4Enabled || env.agentV4RuntimeEnabled) {
    return env.agentV4Enabled && env.agentV4RuntimeEnabled ? "v4_real" : "unavailable";
  }
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
  const v4RolloutActive = env.agentV4Enabled === true || env.agentV4RuntimeEnabled === true;
  const v3RolloutActive = env.agentV3Enabled === true || env.agentV3RuntimeEnabled === true;
  return {
    runtimeIdentity,
    agentV4Enabled: env.agentV4Enabled === true,
    agentV4RuntimeEnabled: env.agentV4RuntimeEnabled === true,
    agentV3Enabled: env.agentV3Enabled === true,
    agentV3RuntimeEnabled: env.agentV3RuntimeEnabled === true,
    agentV2Enabled: v4RolloutActive || v3RolloutActive ? false : env.agentV2Enabled === true,
    agentV2RuntimeEnabled: v4RolloutActive || v3RolloutActive ? false : env.agentV2RuntimeEnabled === true,
  };
}
