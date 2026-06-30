import { tapflowAgentConfigSchema, type TapflowAgentConfig } from "./config.js";
import { tapflowCanvasOpSchema, tapflowCanvasStateSchema } from "./schemas.js";

export type JsonRpcRequest = {
  id?: number | string | null;
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
};

export type JsonRpcResponse = {
  id: number | string | null;
  jsonrpc: "2.0";
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

type BridgeOptions = {
  fetch?: typeof fetch;
  sessionId?: string;
};

function normalizeRequestParams(params: unknown): Record<string, unknown> {
  return params && typeof params === "object" && !Array.isArray(params) ? (params as Record<string, unknown>) : {};
}

export function createTapflowAgentBridge(configInput: TapflowAgentConfig, options: BridgeOptions = {}) {
  const config = tapflowAgentConfigSchema.parse(configInput);
  const fetchImpl = options.fetch ?? fetch;

  async function sendRequest(path: string, init: RequestInit) {
    const response = await fetchImpl(new URL(path, config.tapflowApiUrl), {
      ...init,
      headers: {
        Authorization: `Bearer ${config.tapflowAccessToken}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    const text = await response.text();
    const body = text ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new Error(body?.error?.message || body?.message || `HTTP ${response.status}`);
    }
    return body;
  }

  async function getCanvasState() {
    const state = await sendRequest(`/api/v2/flows/${config.tapflowFlowId}/draft`, { method: "GET" });
    return tapflowCanvasStateSchema.parse({
      edges: state.graph.edges,
      nodes: state.graph.nodes,
      revision: state.revision,
      viewport: state.graph.viewport,
    });
  }

  async function listSessions() {
    return sendRequest(
      `/api/v2/agent/sessions?projectId=${encodeURIComponent(config.tapflowProjectId)}&flowId=${encodeURIComponent(config.tapflowFlowId)}&limit=10`,
      { method: "GET" },
    );
  }

  async function ensureSessionId() {
    if (options.sessionId) return options.sessionId;
    const session = await sendRequest("/api/v2/agent/sessions", {
      body: JSON.stringify({
        flowId: config.tapflowFlowId,
        projectId: config.tapflowProjectId,
        title: "TapFlow Agent Bridge",
      }),
      method: "POST",
    });
    if (!session?.id) {
      throw new Error("TapFlow agent session creation did not return an id.");
    }
    return String(session.id);
  }

  async function applyCanvasOps(input: unknown) {
    const parsedInput = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
    const parsedOps = tapflowCanvasOpSchema.array().parse(parsedInput.ops ?? input);
    const sessionId = await ensureSessionId();
    return sendRequest(`/api/v2/agent/sessions/${sessionId}/canvas-ops`, {
      body: JSON.stringify({
        flowId: config.tapflowFlowId,
        ops: parsedOps,
        turnId: "00000000-0000-0000-0000-000000000000",
      }),
      method: "POST",
    });
  }

  async function handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    if (request.method === "initialize") {
      return {
        id: request.id ?? null,
        jsonrpc: "2.0",
        result: {
          capabilities: { tools: {} },
          serverInfo: { name: "tapflow-agent", version: "0.1.0" },
        },
      };
    }

    if (request.method === "tools/list") {
      return {
        id: request.id ?? null,
        jsonrpc: "2.0",
        result: {
          tools: [
            { description: "Read the current canvas draft.", name: "tapflow_get_canvas_state" },
            { description: "List recent agent sessions.", name: "tapflow_list_agent_sessions" },
            { description: "Apply canvas ops through TapFlow.", name: "tapflow_apply_canvas_ops" },
          ],
        },
      };
    }

    if (request.method === "tools/call") {
      const params = normalizeRequestParams(request.params);
      const name = String(params.name ?? "");
      const args = params.arguments;

      if (name === "tapflow_get_canvas_state") {
        return {
          id: request.id ?? null,
          jsonrpc: "2.0",
          result: { content: [{ type: "text", text: JSON.stringify(await getCanvasState()) }] },
        };
      }

      if (name === "tapflow_list_agent_sessions") {
        return {
          id: request.id ?? null,
          jsonrpc: "2.0",
          result: { content: [{ type: "text", text: JSON.stringify(await listSessions()) }] },
        };
      }

      if (name === "tapflow_apply_canvas_ops") {
        return {
          id: request.id ?? null,
          jsonrpc: "2.0",
          result: { content: [{ type: "text", text: JSON.stringify(await applyCanvasOps(args)) }] },
        };
      }

      return { id: request.id ?? null, jsonrpc: "2.0", error: { code: -32601, message: `Unknown tool: ${name}` } };
    }

    return { id: request.id ?? null, jsonrpc: "2.0", error: { code: -32601, message: `Unknown method: ${request.method}` } };
  }

  return {
    handleRequest,
    applyCanvasOps,
  };
}
