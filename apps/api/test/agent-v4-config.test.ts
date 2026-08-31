import { describe, expect, it, afterEach } from "vitest";
import { getApiEnv } from "../src/config/env.js";

const names = ["AGENT_V4_ENABLED", "AGENT_V4_RUNTIME_ENABLED", "AGENT_V4_MAX_ROUNDS", "AGENT_V4_MAX_ITEMS", "AGENT_V4_MAX_REFERENCES", "AGENT_V4_REPAIR_ATTEMPTS"] as const;
const previous = new Map<string, string | undefined>();

afterEach(() => {
  for (const name of names) {
    if (previous.has(name)) {
      const value = previous.get(name);
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
  previous.clear();
});

function set(name: string, value: string) { if (!previous.has(name)) previous.set(name, process.env[name]); process.env[name] = value; }

describe("Agent V4 env flags", () => {
  it("defaults to disabled with bounded defaults", () => {
    for (const name of names) { if (!previous.has(name)) previous.set(name, process.env[name]); delete process.env[name]; }
    const env = getApiEnv();
    expect(env.agentV4Enabled).toBe(false);
    expect(env.agentV4RuntimeEnabled).toBe(false);
    expect(env.agentV4MaxRounds).toBe(12);
    expect(env.agentV4MaxItems).toBe(12);
    expect(env.agentV4MaxReferences).toBe(16);
    expect(env.agentV4RepairAttempts).toBe(1);
  });

  it("clamps numeric limits and parses booleans", () => {
    set("AGENT_V4_ENABLED", "true"); set("AGENT_V4_RUNTIME_ENABLED", "on");
    set("AGENT_V4_MAX_ROUNDS", "999"); set("AGENT_V4_MAX_ITEMS", "0"); set("AGENT_V4_MAX_REFERENCES", "999"); set("AGENT_V4_REPAIR_ATTEMPTS", "-1");
    const env = getApiEnv();
    expect(env.agentV4Enabled).toBe(true); expect(env.agentV4RuntimeEnabled).toBe(true);
    expect(env.agentV4MaxRounds).toBe(20); expect(env.agentV4MaxItems).toBe(1); expect(env.agentV4MaxReferences).toBe(16); expect(env.agentV4RepairAttempts).toBe(0);
  });
});
