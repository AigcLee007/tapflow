import { describe, expect, it } from "vitest";
import { assembleCanvasDirectorContext } from "../src/modules/agent/v3/agent-context-assembler";
import { buildVisualContextRefs } from "../src/modules/agent/v3/agent-visual-context";

const nodes = Array.from({ length: 75 }, (_, index) => ({
  id: `node-${index}`,
  type: index === 0 ? "image" : "text",
  position: { x: index * 120, y: index * 80 },
  data: {
    title: `Node ${index}`,
    provider: "secret-provider",
    credentialId: "credential-secret",
    payload: "data:image/png;base64,AAA",
    signedUrl: "https://storage.test/signed?token=secret",
  },
}));

const input = {
  tenantId: "tenant-1",
  projectId: "project-1",
  flowId: "flow-1",
  graphRevision: 7,
  prompt: "Arrange the selected nodes",
  canvas: {
    nodes,
    edges: [{ id: "edge-1", source: "node-0", target: "node-1" }],
    viewport: { x: 0, y: 0, zoom: 1 },
    selectedNodeIds: Array.from({ length: 20 }, (_, index) => `node-${index}`),
  },
  visual: {
    captures: Array.from({ length: 8 }, (_, index) => ({
      id: `capture-${index}`,
      flowId: "flow-1",
      kind: "viewport",
      width: 800,
      height: 600,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      dataUrl: "data:image/png;base64,secret",
      signedUrl: "https://storage.test/signed?token=secret",
    })),
  },
};

describe("bounded v3 canvas context", () => {
  it("caps graph, selection, runs and visual context and clusters offscreen nodes", async () => {
    const result = await assembleCanvasDirectorContext({
      ...input,
      repositories: {
        catalog: async () => Array.from({ length: 20 }, (_, index) => ({ id: `model-${index}`, displayName: `Model ${index}`, modality: "image", status: "active", provider: "hidden" })),
        recentRuns: async () => Array.from({ length: 20 }, (_, index) => ({ id: `run-${index}`, status: "succeeded", summary: "done" })),
        visual: { findCapture: async (id: string) => ({ id, flowId: "flow-1", kind: "viewport", width: 800, height: 600, expiresAt: new Date(Date.now() + 60_000).toISOString() }) },
      },
    });

    expect(result.graph.nodes).toHaveLength(60);
    expect(result.selection.nodeIds).toHaveLength(12);
    expect(result.recentRuns).toHaveLength(12);
    expect(result.visualContext).toHaveLength(4);
    expect(result.graph.offscreenClusters.length).toBeGreaterThan(0);
  });

  it("only exposes creator-safe model names and redacts internal or media fields", async () => {
    const result = await assembleCanvasDirectorContext({
      ...input,
      repositories: { catalog: async () => [{ id: "model-1", displayName: "Creator Image", modality: "image", provider: "provider-secret", credentialId: "cred-secret", routeKey: "route-secret", authorization: "Bearer top-secret" }] },
    });
    const serialized = JSON.stringify(result);
    expect(result.catalog.productModels).toEqual([{ id: "model-1", displayName: "Creator Image", modality: "image" }]);
    expect(serialized).not.toMatch(/provider-secret|credential-secret|route-secret|top-secret|data:image|signed\?token/);
    expect(serialized).not.toMatch(/base64|dataUrl|signedUrl|credentialId/);
  });

  it("passes tenant scope to repositories and marks models unavailable without pricing", async () => {
    const calls: unknown[][] = [];
    const result = await assembleCanvasDirectorContext({
      ...input,
      repositories: {
        catalog: async (...args: unknown[]) => { calls.push(args); return [{ id: "model-1", displayName: "Creator Image", modality: "image" }]; },
        pricing: async (...args: unknown[]) => { calls.push(args); return []; },
        recentRuns: async (...args: unknown[]) => { calls.push(args); return []; },
      },
    });
    expect(calls.every((args) => args[0] === "tenant-1")).toBe(true);
    expect(result.catalog.pricingAvailability).toEqual([{ modelId: "model-1", available: false }]);
  });
});

describe("visual context references", () => {
  const repository = {
    findCapture: async (id: string) => ({ id, flowId: "flow-1", kind: "viewport", width: 100, height: 80, expiresAt: new Date(Date.now() + 60_000).toISOString(), dataUrl: "data:image/png;base64,raw" }),
  };

  it("enforces ownership, expiry and a four-reference cap without returning payloads", async () => {
    const refs = await buildVisualContextRefs({ flowId: "flow-1", captureIds: ["a", "b", "c", "d", "e"], repository });
    expect(refs).toHaveLength(4);
    expect(refs[0]).toEqual(expect.objectContaining({ id: "a", kind: "viewport", width: 100, height: 80 }));
    expect(JSON.stringify(refs)).not.toMatch(/data:image|base64|signedUrl/);
  });

  it("omits captures belonging to another flow or already expired", async () => {
    const refs = await buildVisualContextRefs({
      flowId: "flow-1",
      captureIds: ["owned", "other", "expired"],
      repository: { findCapture: async (id: string) => ({ id, flowId: id === "other" ? "flow-2" : "flow-1", kind: "viewport", width: 1, height: 1, expiresAt: id === "expired" ? new Date(Date.now() - 1_000).toISOString() : new Date(Date.now() + 60_000).toISOString() }) },
    });
    expect(refs.map((ref) => ref.id)).toEqual(["owned"]);
  });
});
