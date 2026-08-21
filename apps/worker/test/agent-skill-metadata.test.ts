import { describe, expect, it } from "vitest";

import { extractAgentSkillMetadata } from "../src/workflow-runtime/service.js";

describe("Agent Skill worker metadata", () => {
  it("keeps only durable Skill identifiers and drops provider configuration", () => {
    expect(extractAgentSkillMetadata({
      agentSkillRunId: "run-1",
      agentSkillStepId: "step-1",
      agentSkillVersionId: "version-1",
      apiKey: "secret",
      baseUrl: "https://provider.invalid",
      routeKey: "provider-internal-route",
    })).toEqual({
      agentSkillRunId: "run-1",
      agentSkillStepId: "step-1",
      agentSkillVersionId: "version-1",
    });
  });

  it("returns null identifiers when a workflow is not Skill-backed", () => {
    expect(extractAgentSkillMetadata({ runMode: "target_node" })).toEqual({
      agentSkillRunId: null,
      agentSkillStepId: null,
      agentSkillVersionId: null,
    });
  });
});
