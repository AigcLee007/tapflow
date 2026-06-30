import { describe, expect, it, vi } from "vitest";

import { createTapflowAgentBridge } from "../src/bridge.js";

describe("tapflow agent bridge", () => {
  it("creates a session on demand and applies canvas ops through the TapFlow API", async () => {
    const fetchMock = vi.fn(async (input: URL | RequestInfo | string, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/v2/agent/sessions") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            createdAt: "2026-06-30T00:00:00.000Z",
            flowId: "flow-1",
            id: "session-1",
            projectId: "project-1",
            status: "open",
            title: "TapFlow Agent Bridge",
            updatedAt: "2026-06-30T00:00:00.000Z",
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.endsWith("/api/v2/agent/sessions/session-1/canvas-ops") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            applied: {
              createdNodeIds: ["node-1"],
              edgeIds: [],
              runNodeIds: [],
              updatedNodeIds: [],
            },
            draft: {
              createdAt: "2026-06-30T00:00:00.000Z",
              flowId: "flow-1",
              graph: {
                edges: [],
                nodes: [],
                viewport: { x: 0, y: 0, zoom: 1 },
              },
              id: "draft-1",
              lastSavedBy: "user-1",
              projectId: "project-1",
              revision: 4,
              tenantId: "tenant-1",
              updatedAt: "2026-06-30T00:00:00.000Z",
            },
            event: {
              createdAt: "2026-06-30T00:00:00.000Z",
              eventJson: { createdNodeIds: ["node-1"], edgeIds: [], flowId: "flow-1", updatedNodeIds: [] },
              eventType: "canvas_op_applied",
              id: "event-1",
              seq: 12,
              sessionId: "session-1",
              taskId: null,
              turnId: "turn-1",
            },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    const bridge = createTapflowAgentBridge(
      {
        tapflowAccessToken: "token-1",
        tapflowApiUrl: "https://tapflow.example",
        tapflowFlowId: "flow-1",
        tapflowProjectId: "project-1",
      },
      { fetch: fetchMock as typeof fetch },
    );

    const response = await bridge.handleRequest({
      id: 1,
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        arguments: {
          ops: [
            {
              clientId: "client-text",
              data: { text: "Hello", title: "Prompt" },
              kind: "text",
              position: { x: 100, y: 120 },
              type: "add_node",
            },
          ],
        },
        name: "tapflow_apply_canvas_ops",
      },
    });

    expect(response).toMatchObject({
      id: 1,
      jsonrpc: "2.0",
      result: {
        content: [
          {
            type: "text",
          },
        ],
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const requestedUrls = fetchMock.mock.calls.map(([input]) => String(input));
    expect(requestedUrls.some((url) => url.includes("/api/v2/agent/sessions"))).toBe(true);
    expect(requestedUrls.some((url) => url.includes("/api/v2/agent/sessions/session-1/canvas-ops"))).toBe(true);
  });
});
