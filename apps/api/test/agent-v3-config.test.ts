import { afterEach, describe, expect, test } from "vitest";

import { getApiEnv } from "../src/config/env.js";
import { projectAgentRuntimeCapabilities, resolveAgentRuntimeIdentity } from "../src/modules/agent/agent-runtime-identity.js";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("Agent V3 configuration", () => {
  test("fails closed when V3 is partially enabled even if V2 is available", () => {
    expect(resolveAgentRuntimeIdentity({
      agentV2Enabled: true,
      agentV2RuntimeEnabled: true,
      agentV3Enabled: true,
      agentV3RuntimeEnabled: false,
    })).toBe("unavailable");
  });

  test.each([
    [{ agentV2Enabled: true, agentV2RuntimeEnabled: true, agentV3Enabled: true, agentV3RuntimeEnabled: true }, "v3_real"],
    [{ agentV2Enabled: true, agentV2RuntimeEnabled: true, agentV3Enabled: false, agentV3RuntimeEnabled: false }, "v2_real"],
    [{ agentV2Enabled: false, agentV2RuntimeEnabled: false, agentV3Enabled: true, agentV3RuntimeEnabled: false }, "unavailable"],
    [{ agentV2Enabled: false, agentV2RuntimeEnabled: false, agentV3Enabled: false, agentV3RuntimeEnabled: true }, "unavailable"],
  ] as const)("resolves runtime identity for rollout combination %#", (env, expected) => {
    expect(resolveAgentRuntimeIdentity(env)).toBe(expected);
  });

  test("suppresses V2 capability flags during any V3 rollout", () => {
    expect(projectAgentRuntimeCapabilities({
      agentV2Enabled: true,
      agentV2RuntimeEnabled: true,
      agentV3Enabled: true,
      agentV3RuntimeEnabled: false,
    })).toMatchObject({ agentV2Enabled: false, agentV2RuntimeEnabled: false, runtimeIdentity: "unavailable" });
  });

  test("defaults V3 rollout flags and tool rounds safely", () => {
    process.env = { ...originalEnv, NODE_ENV: "development" };

    const env = getApiEnv();

    expect(env.agentV3Enabled).toBe(false);
    expect(env.agentV3RuntimeEnabled).toBe(false);
    expect(env.agentV3MaxToolRounds).toBe(8);
  });

  test.each([
    ["0", 1],
    ["1", 1],
    ["8", 8],
    ["99", 8],
  ])("clamps AGENT_V3_MAX_TOOL_ROUNDS=%s to %s", (value, expected) => {
    process.env = { ...originalEnv, NODE_ENV: "development", AGENT_V3_MAX_TOOL_ROUNDS: value };

    expect(getApiEnv().agentV3MaxToolRounds).toBe(expected);
  });

  test("rejects non-integer AGENT_V3_MAX_TOOL_ROUNDS", () => {
    process.env = { ...originalEnv, NODE_ENV: "development", AGENT_V3_MAX_TOOL_ROUNDS: "2.5" };
    expect(() => getApiEnv()).toThrow("AGENT_V3_MAX_TOOL_ROUNDS must be an integer when provided");
  });
});
