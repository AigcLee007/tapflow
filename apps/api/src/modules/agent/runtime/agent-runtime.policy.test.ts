import { describe, expect, it } from "vitest";

import { evaluateAgentApprovalPolicy } from "./agent-runtime.policy.js";

describe("agent runtime approval policy", () => {
  it("fails closed when pricing, route, permission, or revision is missing", () => {
    expect(evaluateAgentApprovalPolicy({
      mode: "manual_confirmation",
      requiresConfirmation: true,
      pricing: null,
      route: null,
      permission: false,
      expectedGraphRevision: 4,
      currentGraphRevision: 5,
    })).toEqual({ allowed: false, failClosed: true, reason: "pricing_or_route_missing" });
  });

  it("allows only an approved, priced, current operation", () => {
    expect(evaluateAgentApprovalPolicy({
      mode: "manual_confirmation",
      requiresConfirmation: false,
      pricing: { active: true, credits: 2 },
      route: { active: true },
      permission: true,
      expectedGraphRevision: 4,
      currentGraphRevision: 4,
    })).toEqual({ allowed: true, failClosed: false });
  });
});
