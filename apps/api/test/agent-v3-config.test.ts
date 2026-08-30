import { afterEach, describe, expect, test } from "vitest";

import { getApiEnv } from "../src/config/env.js";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("Agent V3 configuration", () => {
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
});
