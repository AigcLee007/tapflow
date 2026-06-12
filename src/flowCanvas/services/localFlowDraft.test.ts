import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  clearLocalFlowDraft,
  getLocalFlowDraftKey,
  isLocalDraftNewer,
  readLocalFlowDraft,
  writeLocalFlowDraft,
} from "./localFlowDraft";
import type { FlowDraftGraph } from "./flowProjectApi";

const graph = (nodeId: string): FlowDraftGraph => ({
  edges: [],
  nodes: [
    {
      id: nodeId,
      position: { x: 0, y: 0 },
      type: "image",
      data: {
        assetId: `asset-${nodeId}`,
        progress: 50,
        thumbnailUrl: `https://cdn.test/${nodeId}.png?X-Amz-Signature=temporary`,
        updatedAt: Date.now(),
      },
    },
  ],
  viewport: { x: 0, y: 0, zoom: 1 },
});

describe("localFlowDraft", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("stores canonical local drafts by tenant and flow", () => {
    const saved = writeLocalFlowDraft({
      flowId: "flow-a",
      graph: graph("node-a"),
      lastServerRevision: 7,
      tenantId: "tenant-a",
    });

    expect(saved?.localVersion).toBe(1);
    expect(window.localStorage.getItem(getLocalFlowDraftKey({ flowId: "flow-a", tenantId: "tenant-a" }))).toBeTruthy();

    const restored = readLocalFlowDraft({
      flowId: "flow-a",
      tenantId: "tenant-a",
    });

    expect(restored?.lastServerRevision).toBe(7);
    expect(restored?.canonicalGraph.nodes[0]).toMatchObject({
      data: {
        assetId: "asset-node-a",
      },
      id: "node-a",
    });
    expect(JSON.stringify(restored?.canonicalGraph)).not.toContain("X-Amz-Signature");
    expect(JSON.stringify(restored?.canonicalGraph)).not.toContain("progress");
  });

  it("reports newer local drafts without comparing transient graph noise", () => {
    const localDraft = writeLocalFlowDraft({
      flowId: "flow-a",
      graph: graph("node-a"),
      lastServerRevision: 7,
      tenantId: "tenant-a",
    });

    expect(isLocalDraftNewer({
      localDraft,
      serverGraph: graph("node-b"),
      serverUpdatedAt: "2020-01-01T00:00:00.000Z",
    })).toBe(true);

    expect(isLocalDraftNewer({
      localDraft,
      serverGraph: graph("node-a"),
      serverUpdatedAt: "2020-01-01T00:00:00.000Z",
    })).toBe(false);
  });

  it("clears stored local drafts by tenant and flow", () => {
    writeLocalFlowDraft({
      flowId: "flow-a",
      graph: graph("node-a"),
      lastServerRevision: 7,
      tenantId: "tenant-a",
    });

    clearLocalFlowDraft({
      flowId: "flow-a",
      tenantId: "tenant-a",
    });

    expect(window.localStorage.getItem(getLocalFlowDraftKey({ flowId: "flow-a", tenantId: "tenant-a" }))).toBeNull();
  });
});
