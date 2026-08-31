export const V4_TERMINAL_STATUSES = ["succeeded", "partial_success", "needs_review", "failed", "cancelled"] as const;

export type AgentV4Status =
  | "draft" | "observing" | "planning" | "preview_ready" | "waiting_for_approval"
  | "generating_base" | "generating_batch" | "waiting_for_continuation" | "verifying" | "repairing"
  | typeof V4_TERMINAL_STATUSES[number];

export const V4_TOOL_NAMES = [
  "canvas.observe", "reference.inspect", "product.analyze", "suite.plan", "visual_bible.create", "prompt_set.create",
  "image.generate_base", "image.generate_batch", "generation.continue", "canvas.preview_operations", "canvas.commit_operations",
] as const;
export type AgentV4ToolName = typeof V4_TOOL_NAMES[number];

export type AgentV4GenerationItem = {
  itemId: string;
  pageKey: string;
  prompt: string;
  referenceAssetIds: string[];
  status: "queued" | "running" | "succeeded" | "failed";
  assetId?: string;
  nodeId?: string;
  errorCode?: string;
};

export type AgentV4SafeToolResult = {
  ok: boolean;
  status?: AgentV4Status;
  taskId?: string;
  itemIds?: string[];
  assetIds?: string[];
  assetId?: string;
  revision?: number;
  errorCode?: string;
  summary?: string;
  items?: Array<Pick<AgentV4GenerationItem, "itemId" | "status" | "assetId" | "nodeId" | "errorCode">>;
};

const transitions: Record<AgentV4Status, readonly AgentV4Status[]> = {
  draft: ["observing", "cancelled"],
  observing: ["planning", "failed", "cancelled"],
  planning: ["preview_ready", "failed", "cancelled"],
  preview_ready: ["waiting_for_approval", "generating_base", "cancelled"],
  waiting_for_approval: ["generating_base", "cancelled"],
  generating_base: ["generating_batch", "waiting_for_continuation", "verifying", "failed", "cancelled"],
  generating_batch: ["waiting_for_continuation", "verifying", "repairing", "partial_success", "failed", "cancelled"],
  waiting_for_continuation: ["generating_batch", "verifying", "cancelled"],
  verifying: ["repairing", "succeeded", "partial_success", "needs_review", "failed", "cancelled"],
  repairing: ["generating_batch", "verifying", "partial_success", "failed", "cancelled"],
  succeeded: [], partial_success: [], needs_review: [], failed: [], cancelled: [],
};

export function nextV4Status(from: AgentV4Status, to: AgentV4Status): AgentV4Status {
  if (typeof from !== "string" || typeof to !== "string" || !(from in transitions) || !(to in transitions) || !transitions[from as AgentV4Status].includes(to as AgentV4Status)) {
    throw new Error(`AGENT_V4_INVALID_TRANSITION: ${from} -> ${to}`);
  }
  return to;
}

const safeKeys = new Set(["ok", "status", "taskId", "itemIds", "assetIds", "assetId", "revision", "errorCode", "summary", "items"]);
const itemKeys = new Set(["itemId", "status", "assetId", "nodeId", "errorCode"]);
const forbidden = /provider|credential|authorization|url|base64|blob|rawresponse|raw_response|secret|api[_-]?key/i;

export function safeToolResult(input: unknown): AgentV4SafeToolResult {
  const source = (input && typeof input === "object" && !Array.isArray(input)) ? input as Record<string, unknown> : {};
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (!safeKeys.has(key) || forbidden.test(key)) continue;
    if (key === "items" && Array.isArray(value)) {
      output.items = value.map((item) => {
        if (!item || typeof item !== "object") return {};
        const clean: Record<string, unknown> = {};
        for (const [itemKey, itemValue] of Object.entries(item as Record<string, unknown>)) if (itemKeys.has(itemKey) && !forbidden.test(itemKey)) clean[itemKey] = itemValue;
        return clean;
      });
    } else if (!forbidden.test(key)) {
      output[key] = value;
    }
  }
  return output as AgentV4SafeToolResult;
}

export type AgentV4ToolCall = { name: AgentV4ToolName; arguments: Record<string, unknown> };

export function isV4TerminalStatus(status: AgentV4Status): boolean {
  return (V4_TERMINAL_STATUSES as readonly string[]).includes(status);
}

export { parseV4ToolCall } from "./agent-v4-schemas.js";
