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

const transitions: ReadonlyMap<AgentV4Status, readonly AgentV4Status[]> = new Map([
  ["draft", ["observing", "cancelled"]],
  ["observing", ["planning", "failed", "cancelled"]],
  ["planning", ["preview_ready", "failed", "cancelled"]],
  ["preview_ready", ["waiting_for_approval", "cancelled"]],
  ["waiting_for_approval", ["generating_base", "cancelled"]],
  ["generating_base", ["generating_batch", "waiting_for_continuation", "verifying", "failed", "cancelled"]],
  ["generating_batch", ["waiting_for_continuation", "verifying", "repairing", "partial_success", "failed", "cancelled"]],
  ["waiting_for_continuation", ["generating_batch", "verifying", "cancelled"]],
  ["verifying", ["repairing", "succeeded", "partial_success", "needs_review", "failed", "cancelled"]],
  ["repairing", ["generating_batch", "verifying", "partial_success", "failed", "cancelled"]],
  ["succeeded", []], ["partial_success", []], ["needs_review", []], ["failed", []], ["cancelled", []],
]);

export function nextV4Status(from: AgentV4Status, to: AgentV4Status): AgentV4Status {
  if (typeof from !== "string" || typeof to !== "string" || !transitions.has(from as AgentV4Status) || !transitions.has(to as AgentV4Status) || !transitions.get(from as AgentV4Status)?.includes(to as AgentV4Status)) {
    throw new Error(`AGENT_V4_INVALID_TRANSITION: ${from} -> ${to}`);
  }
  return to;
}

const safeKeys = new Set(["ok", "status", "taskId", "itemIds", "assetIds", "assetId", "revision", "errorCode", "summary", "items"]);
const itemKeys = new Set(["itemId", "status", "assetId", "nodeId", "errorCode"]);
const forbidden = /provider|credential|authorization|url|base64|blob|rawresponse|raw_response|secret|api[_-]?key/i;
const forbiddenValueExtended = /(?:data\s*:|blob\s*:|(?:^|[\s([{])[a-z][a-z0-9+.-]*:(?:\/\/|[^\s])|\b(?:sk|rk|pk)-[a-z0-9_-]{8,}|\b(?:bearer)\s+[a-z0-9._~+\/-]{8,}|\b(?:token|api[_-]?key|secret)\s*[:=])/i;
const bareHostValue = /(?:^|[\s([{])(?:(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\:\d+)?(?:[\/?#][^\s]*)?|localhost(?:\:\d+)?(?:[\/?#][^\s]*)?|(?:\d{1,3}\.){3}\d{1,3}(?:\:\d+)?(?:[\/?#][^\s]*)?)(?=$|[\s)\]}>,!?;])/i;
const isUnsafeTransportValue = (value: string) => forbidden.test(value) || forbiddenValueExtended.test(value) || bareHostValue.test(value);
const allStatuses = new Set<string>(["draft", "observing", "planning", "preview_ready", "waiting_for_approval", "generating_base", "generating_batch", "waiting_for_continuation", "verifying", "repairing", ...V4_TERMINAL_STATUSES]);

export function safeToolResult(input: unknown): AgentV4SafeToolResult {
  const source = (input && typeof input === "object" && !Array.isArray(input)) ? input as Record<string, unknown> : {};
  const output: Record<string, unknown> = { ok: source.ok === true };
  for (const [key, value] of Object.entries(source)) {
    if (!safeKeys.has(key) || forbidden.test(key)) continue;
    if (key === "items" && Array.isArray(value)) {
      output.items = value.slice(0, 24).map((item) => {
        if (!item || typeof item !== "object") return {};
        const clean: Record<string, unknown> = {};
        for (const [itemKey, itemValue] of Object.entries(item as Record<string, unknown>)) {
          if (!itemKeys.has(itemKey) || forbidden.test(itemKey)) continue;
          if (itemKey === "status" && typeof itemValue === "string" && ["queued", "running", "succeeded", "failed"].includes(itemValue)) clean[itemKey] = itemValue;
          else if (itemKey !== "status" && typeof itemValue === "string" && !forbidden.test(itemValue) && !isUnsafeTransportValue(itemValue)) clean[itemKey] = itemValue.slice(0, 200);
          else if (typeof itemValue === "number" && Number.isFinite(itemValue)) clean[itemKey] = itemValue;
        }
        return clean;
      });
    } else if (!forbidden.test(key)) {
      if (key === "summary") { if (typeof value === "string" && !forbidden.test(value) && !isUnsafeTransportValue(value)) output.summary = value.slice(0, 2000); }
      else if (["taskId", "assetId", "errorCode"].includes(key) && typeof value === "string" && !forbidden.test(value) && !isUnsafeTransportValue(value)) output[key] = value.slice(0, 200);
      else if (["revision"].includes(key) && typeof value === "number" && Number.isFinite(value)) output[key] = value;
      else if (["ok"].includes(key) && typeof value === "boolean") output[key] = value;
      else if (key === "status" && typeof value === "string" && allStatuses.has(value)) output[key] = value;
      else if (["itemIds", "assetIds"].includes(key) && Array.isArray(value) && value.length <= 24 && value.every((item) => typeof item === "string" && !forbidden.test(item) && !isUnsafeTransportValue(item))) output[key] = value.map((item) => item.slice(0, 200));
    }
  }
  return output as AgentV4SafeToolResult;
}

export type AgentV4ToolCall = { name: AgentV4ToolName; arguments: Record<string, unknown> };

export function isV4TerminalStatus(status: AgentV4Status): boolean {
  return (V4_TERMINAL_STATUSES as readonly string[]).includes(status);
}
