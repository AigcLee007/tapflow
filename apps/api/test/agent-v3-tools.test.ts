import { describe, expect, test } from "vitest";
import { canvasToolRegistry } from "../src/modules/agent/v3/canvas-tool-registry.js";
import { assertCanvasToolAllowed, CanvasToolPolicyError } from "../src/modules/agent/v3/canvas-tool-policy.js";

describe("canvas v3 tools", () => {
  test("keeps namespaced tools and proposals side-effect free", () => {
    expect(canvasToolRegistry.list().map((tool) => tool.namespace)).toEqual(expect.arrayContaining(["read", "proposal", "run", "control"]));
    const proposal = canvasToolRegistry.invoke("proposal", "propose_operations", { summary: "move" });
    expect(proposal.kind).toBe("operation_proposal");
    expect(proposal).not.toHaveProperty("persisted");
    expect(canvasToolRegistry.invoke("run", "estimate_run", { routeKey: "image.default" }).kind).toBe("estimate");
  });

  const context = { tenantId: "t1", projectId: "p1", flowId: "f1", sessionId: "s1", graphRevision: 4, modelVisible: true, pricingPresent: true, risk: "safe" as const, requiresApproval: false };
  test("allows a valid scoped tool and rejects unsafe capabilities", () => {
    expect(assertCanvasToolAllowed({ namespace: "read", toolName: "get_graph" }, context)).toMatchObject({ allowed: true });
    for (const toolName of ["http.fetch", "filesystem.read", "shell.exec", "mcp.call", "browser.open", "code.execute", "url.fetch", "secret.get"]) {
      expect(() => assertCanvasToolAllowed({ namespace: "control", toolName }, context)).toThrow(CanvasToolPolicyError);
    }
  });

  test("denies scope, stale revision, hidden models, missing pricing, and unapproved risks", () => {
    expect(() => assertCanvasToolAllowed({ namespace: "proposal", toolName: "propose_operations", tenantId: "other" }, context)).toThrow("tenant");
    expect(() => assertCanvasToolAllowed({ namespace: "proposal", toolName: "propose_operations", expectedRevision: 3 }, context)).toThrow("revision");
    expect(() => assertCanvasToolAllowed({ namespace: "run", toolName: "estimate_run" }, { ...context, modelVisible: false })).toThrow("model");
    expect(() => assertCanvasToolAllowed({ namespace: "run", toolName: "estimate_run" }, { ...context, pricingPresent: false })).toThrow("pricing");
    expect(() => assertCanvasToolAllowed({ namespace: "run", toolName: "execute_run" }, { ...context, risk: "paid", requiresApproval: true, approvalGranted: false })).toThrow("approval");
  });
});
