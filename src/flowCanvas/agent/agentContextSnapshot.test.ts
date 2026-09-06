import { describe, expect, it } from "vitest";
import { buildAgentContextSnapshot, isSnapshotCurrent } from "./agentContextSnapshot";

describe("agent context snapshot", () => {
  const base = { flowId: "flow-1", selectedNodeIds: ["node-2", "node-1"], nodes: [{ id: "node-1", assetId: "asset-1" }, { id: "node-2" }] };

  it("keeps stable, deduplicated safe references", () => {
    const snapshot = buildAgentContextSnapshot({ appIds: ["app-2", "app-2"], assetIds: ["asset-2", "asset-1"], graphRevision: 4, projectId: "project-1", skillIds: ["skill-2", "skill-1"], snapshot: base });
    expect(snapshot).toEqual({ appIds: ["app-2"], assetIds: ["asset-1", "asset-2"], flowId: "flow-1", graphRevision: 4, projectId: "project-1", selectedNodeIds: ["node-1", "node-2"], skillIds: ["skill-1", "skill-2"] });
  });

  it("detects graph or binding drift", () => {
    const snapshot = buildAgentContextSnapshot({ graphRevision: 4, projectId: "project-1", snapshot: base });
    expect(isSnapshotCurrent(snapshot, { flowId: "flow-1", graphRevision: 4, projectId: "project-1" })).toBe(true);
    expect(isSnapshotCurrent(snapshot, { flowId: "flow-1", graphRevision: 5, projectId: "project-1" })).toBe(false);
  });
});
