import { describe, expect, it } from "vitest";
import { assembleAgentContext } from "../src/modules/agent/runtime/agent-runtime-context.js";

const scope = { projectId: "project", flowId: "flow" };
const draft = { projectId: "project", flowId: "flow", revision: 4, graph: { nodes: [{ id: "n1", data: { assetId: "a1", title: "商品" } }], edges: [] } };
const snapshot = { ...scope, graphRevision: 4, refs: [{ refId: "r1", source: "canvas" as const, nodeId: "n1", role: "subject" as const, label: "商品" }], skillIds: [], appIds: [], modelKey: null };

describe("authoritative Agent context", () => {
  it("resolves the node asset from the server draft and keeps the explicit role", async () => {
    const result = await assembleAgentContext(scope, snapshot, draft, async (ids) => ids);
    expect(result.refs[0]).toEqual({ ...snapshot.refs[0], assetId: "a1" });
  });
  it("rejects stale drafts, foreign scope, substituted assets and unavailable references", async () => {
    for (const bad of [{ ...snapshot, graphRevision: 3 }, { ...snapshot, flowId: "other" }, { ...snapshot, refs: [{ ...snapshot.refs[0], assetId: "foreign" }] }]) {
      await expect(assembleAgentContext(scope, bad, draft, async (ids) => ids)).rejects.toThrow();
    }
    await expect(assembleAgentContext(scope, snapshot, draft, async () => [])).rejects.toThrow("AGENT_REFERENCE_UNAVAILABLE");
  });
  it("rejects unsupported executable app/skill claims instead of silently ignoring them", async () => {
    await expect(assembleAgentContext(scope, { ...snapshot, appIds: ["uninstalled"] }, draft, async (ids) => ids)).rejects.toThrow("AGENT_CAPABILITY_UNAVAILABLE");
  });
});
