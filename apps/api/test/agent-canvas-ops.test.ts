import { describe, expect, it, vi } from "vitest";

import { FlowsApiError } from "../src/modules/flows/flows.service.js";
import { AgentCanvasService } from "../src/modules/agent/agent-canvas.service.js";

const context = {
  tenantId: "tenant-1",
  userId: "user-1",
};

function createDraft(revision = 3) {
  return {
    createdAt: "2026-06-25T00:00:00.000Z",
    flowId: "flow-1",
    graph: {
      edges: [
        {
          data: { dataType: "any" },
          id: "edge-1",
          source: "text-1",
          sourceHandle: "out",
          target: "image-1",
          targetHandle: "in",
          type: "smart",
        },
      ],
      nodes: [
        {
          data: {
            createdAt: 1,
            generationStatus: "idle",
            height: 120,
            kind: "text",
            status: "idle",
            title: "Prompt",
            updatedAt: 1,
            width: 220,
          },
          id: "text-1",
          position: { x: 0, y: 0 },
          type: "text",
        },
        {
          data: {
            createdAt: 1,
            generationPrompt: "forest sports day",
            generationStatus: "idle",
            height: 220,
            kind: "image",
            status: "idle",
            title: "Image",
            updatedAt: 1,
            width: 220,
          },
          id: "image-1",
          position: { x: 320, y: 0 },
          type: "image",
        },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
    },
    id: "draft-1",
    lastSavedBy: "user-1",
    projectId: "project-1",
    revision,
    tenantId: "tenant-1",
    updatedAt: "2026-06-25T00:00:00.000Z",
  };
}

describe("AgentCanvasService", () => {
  it("applies create, update, and connect ops to the flow draft and appends an event", async () => {
    const draft = createDraft();
    const savedDraft = {
      ...draft,
      graph: {
        ...draft.graph,
        edges: [
          ...draft.graph.edges,
          expect.objectContaining({
            source: expect.any(String),
            target: "image-1",
          }),
        ],
        nodes: [
          ...draft.graph.nodes,
          expect.objectContaining({
            data: expect.objectContaining({
              agentMetadata: expect.objectContaining({
                agentSessionId: "session-1",
                agentTurnId: "turn-1",
              }),
              text: "Animal poster layout",
              title: "Agent Text",
            }),
            type: "text",
          }),
        ],
      },
      revision: 4,
    };

    const getFlowDraft = vi
      .fn()
      .mockResolvedValueOnce(draft);
    const saveFlowDraft = vi.fn().mockResolvedValue(savedDraft);
    const appendSessionEvent = vi.fn().mockResolvedValue({
      createdAt: "2026-06-25T00:00:02.000Z",
      eventJson: {
        createdNodeIds: ["node-created-1"],
        edgeIds: ["edge-created-1"],
        flowId: "flow-1",
        updatedNodeIds: ["image-1"],
      },
      eventType: "canvas_op_applied",
      id: "event-1",
      seq: 9,
      sessionId: "session-1",
      taskId: null,
      turnId: "turn-1",
    });

    const service = new AgentCanvasService({
      eventRepository: { appendSessionEvent },
      flowsService: {
        getFlowDraft,
        saveFlowDraft,
      },
      now: () => 1234,
      randomId: (() => {
        const ids = ["node-created-1", "edge-created-1"];
        return () => ids.shift() ?? "random-id";
      })(),
      sessionRepository: {
        getSession: vi.fn().mockResolvedValue({
          flowId: "flow-1",
          id: "session-1",
          projectId: "project-1",
          tenantId: "tenant-1",
        }),
      },
    });

    const result = await service.applyOps(context, "session-1", {
      expectedRevision: 3,
      flowId: "flow-1",
      ops: [
        {
          clientId: "agent-text",
          data: { text: "Animal poster layout", title: "Agent Text" },
          kind: "text",
          position: { x: 680, y: 40 },
          type: "add_node",
        },
        {
          nodeId: "image-1",
          patch: { title: "Updated Image Title" },
          type: "update_node_data",
        },
        {
          source: "client:agent-text",
          sourceHandle: "out",
          target: "image-1",
          targetHandle: "in",
          type: "connect_nodes",
        },
      ],
      turnId: "turn-1",
    });

    expect(getFlowDraft).toHaveBeenCalledWith(context, "flow-1");
    expect(saveFlowDraft).toHaveBeenCalledWith(
      context,
      "flow-1",
      expect.objectContaining({
        expectedRevision: 3,
        graph: expect.objectContaining({
          edges: expect.arrayContaining([
            expect.objectContaining({
              id: "edge-created-1",
              source: "node-created-1",
              target: "image-1",
            }),
          ]),
          nodes: expect.arrayContaining([
            expect.objectContaining({
              data: expect.objectContaining({
                agentMetadata: expect.objectContaining({
                  agentSessionId: "session-1",
                  agentTurnId: "turn-1",
                }),
                title: "Updated Image Title",
              }),
              id: "image-1",
            }),
            expect.objectContaining({
              data: expect.objectContaining({
                agentMetadata: expect.objectContaining({
                  agentSessionId: "session-1",
                  agentTurnId: "turn-1",
                }),
                text: "Animal poster layout",
              }),
              id: "node-created-1",
            }),
          ]),
        }),
      }),
    );
    expect(appendSessionEvent).toHaveBeenCalledWith(
      context,
      expect.objectContaining({
        eventJson: expect.objectContaining({
          createdNodeIds: ["node-created-1"],
          edgeIds: ["edge-created-1"],
          flowId: "flow-1",
          updatedNodeIds: ["image-1"],
        }),
        eventType: "canvas_op_applied",
        sessionId: "session-1",
        turnId: "turn-1",
      }),
    );
    expect(result).toMatchObject({
      applied: {
        createdNodeIds: ["node-created-1"],
        edgeIds: ["edge-created-1"],
        runNodeIds: [],
        updatedNodeIds: ["image-1"],
      },
      event: expect.objectContaining({
        eventType: "canvas_op_applied",
      }),
    });
  });

  it("rejects canvas ops that target nodes outside the current flow draft", async () => {
    const service = new AgentCanvasService({
      eventRepository: { appendSessionEvent: vi.fn() },
      flowsService: {
        getFlowDraft: vi.fn().mockResolvedValue(createDraft()),
        saveFlowDraft: vi.fn(),
      },
      sessionRepository: {
        getSession: vi.fn().mockResolvedValue({
          flowId: "flow-1",
          id: "session-1",
          projectId: "project-1",
          tenantId: "tenant-1",
        }),
      },
    });

    await expect(
      service.applyOps(context, "session-1", {
        flowId: "flow-1",
        ops: [
          {
            nodeId: "image-outside-flow",
            patch: { title: "Should fail" },
            type: "update_node_data",
          },
        ],
        turnId: "turn-1",
      }),
    ).rejects.toMatchObject({
      code: "AGENT_CANVAS_NODE_NOT_FOUND",
      statusCode: 400,
    });
  });

  it("reloads the draft and retries once after a revision conflict", async () => {
    const initialDraft = createDraft(3);
    const latestDraft = createDraft(4);
    const savedDraft = { ...latestDraft, revision: 5 };
    const getFlowDraft = vi
      .fn()
      .mockResolvedValueOnce(initialDraft)
      .mockResolvedValueOnce(latestDraft);
    const saveFlowDraft = vi
      .fn()
      .mockRejectedValueOnce(
        new FlowsApiError(
          409,
          "FLOW_DRAFT_REVISION_CONFLICT",
          "Conflict",
        ),
      )
      .mockResolvedValueOnce(savedDraft);

    const service = new AgentCanvasService({
      eventRepository: { appendSessionEvent: vi.fn().mockResolvedValue(null) },
      flowsService: {
        getFlowDraft,
        saveFlowDraft,
      },
      randomId: (() => {
        const ids = ["node-created-1"];
        return () => ids.shift() ?? "random-id";
      })(),
      sessionRepository: {
        getSession: vi.fn().mockResolvedValue({
          flowId: "flow-1",
          id: "session-1",
          projectId: "project-1",
          tenantId: "tenant-1",
        }),
      },
    });

    const result = await service.applyOps(context, "session-1", {
      flowId: "flow-1",
      ops: [
        {
          clientId: "agent-text",
          data: { text: "Retry node", title: "Retry node" },
          kind: "text",
          position: { x: 640, y: 20 },
          type: "add_node",
        },
      ],
      turnId: "turn-1",
    });

    expect(getFlowDraft).toHaveBeenCalledTimes(2);
    expect(saveFlowDraft).toHaveBeenCalledTimes(2);
    expect(saveFlowDraft).toHaveBeenNthCalledWith(
      1,
      context,
      "flow-1",
      expect.objectContaining({ expectedRevision: 3 }),
    );
    expect(saveFlowDraft).toHaveBeenNthCalledWith(
      2,
      context,
      "flow-1",
      expect.objectContaining({ expectedRevision: 4 }),
    );
    expect(result.draft.revision).toBe(5);
  });

  it("rejects a V2 canvas write on a revision conflict without rebasing", async () => {
    const draft = createDraft(3);
    const saveFlowDraft = vi.fn().mockRejectedValue(new FlowsApiError(409, "FLOW_DRAFT_REVISION_CONFLICT", "stale"));
    const service = new AgentCanvasService({
      eventRepository: { appendSessionEvent: vi.fn() },
      flowsService: { getFlowDraft: vi.fn().mockResolvedValue(draft), saveFlowDraft },
      sessionRepository: { getSession: vi.fn().mockResolvedValue({ flowId: "flow-1", id: "session-1", projectId: "project-1", tenantId: "tenant-1" }) },
    });
    await expect(service.applyOps(context, "session-1", {
      expectedRevision: 3,
      strictRevision: true,
      flowId: "flow-1",
      ops: [{ type: "update_node_data", nodeId: "text-1", patch: { text: "v2" } }],
      turnId: "turn-1",
    })).rejects.toMatchObject({ code: "FLOW_DRAFT_REVISION_CONFLICT" });
    expect(saveFlowDraft).toHaveBeenCalledTimes(1);
  });

  it("places safe text and asset result nodes without persisting media URLs", async () => {
    const draft = createDraft(3);
    const saveFlowDraft = vi.fn().mockImplementation(async (_context, _flowId, input) => ({ ...draft, revision: input.expectedRevision + 1, graph: input.graph }));
    const service = new AgentCanvasService({
      eventRepository: { appendSessionEvent: vi.fn().mockResolvedValue(null) },
      flowsService: { getFlowDraft: vi.fn().mockResolvedValue(draft), saveFlowDraft },
      randomId: (() => { const ids = ["result-text", "result-image"]; return () => ids.shift()!; })(),
      sessionRepository: { getSession: vi.fn().mockResolvedValue({ flowId: "flow-1", id: "session-1", projectId: "project-1", tenantId: "tenant-1" }) },
    });

    const result = await service.placeSkillResults(context, "session-1", {
      expectedRevision: 3,
      flowId: "flow-1",
      results: [
        { kind: "text", text: "可编辑的最终文案", title: "文案结果" },
        { assetId: "asset-123", kind: "image", previewUrl: "https://private.example/signed", title: "图片结果" },
      ],
      skillRunId: "run-1",
      skillStepId: "step-1",
      turnId: "turn-1",
    });

    const nodes = saveFlowDraft.mock.calls[0][2].graph.nodes;
    expect(result.applied.createdNodeIds).toEqual(["result-text", "result-image"]);
    expect(nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "result-text", data: expect.objectContaining({ text: "可编辑的最终文案", skillRunId: "run-1" }) }),
      expect.objectContaining({ id: "result-image", data: expect.objectContaining({ assetId: "asset-123", skillStepId: "step-1" }) }),
    ]));
    expect(JSON.stringify(nodes)).not.toContain("signed");
  });
});
