import { parseV4ToolCall } from "./agent-v4-schemas.js";
import type { AgentV4SafeToolResult, AgentV4Status, AgentV4TaskRecord, AgentV4ToolCall, AgentV4ToolName } from "./agent-v4-types.js";
import { safeToolResult } from "./agent-v4-types.js";

export type AgentV4GatewayContext = { tenantId: string; userId: string | null };
export type AgentV4GatewayInput = { task: AgentV4TaskRecord; context: AgentV4GatewayContext; call: AgentV4ToolCall & { callId: string }; idempotencyKey: string };
export type AgentV4ToolHandler = (input: AgentV4GatewayInput) => Promise<unknown>;

const approvalRequired = new Set<AgentV4ToolName>(["image.generate_base", "image.generate_batch", "generation.continue", "canvas.commit_operations"]);

export class AgentV4ToolGatewayError extends Error {
  constructor(readonly code: string, message = code) { super(message); this.name = "AgentV4ToolGatewayError"; }
}

/** Server-side boundary between model tool calls and privileged product services. */
export class AgentV4ToolGateway {
  private readonly handlers: Partial<Record<AgentV4ToolName, AgentV4ToolHandler>>;
  constructor(options: { handlers?: Partial<Record<AgentV4ToolName, AgentV4ToolHandler>> } = {}) { this.handlers = options.handlers ?? {}; }

  async execute(input: AgentV4GatewayInput): Promise<AgentV4SafeToolResult> {
    if (!input || input.context.tenantId !== input.task.tenantId) throw new AgentV4ToolGatewayError("AGENT_V4_TENANT_MISMATCH");
    const parsed = parseV4ToolCall({ name: input.call.name, arguments: input.call.arguments });
    if (approvalRequired.has(parsed.name) && input.task.status !== "waiting_for_approval") {
      return { ok: false, status: "waiting_for_approval", taskId: input.task.id, errorCode: "AGENT_V4_APPROVAL_REQUIRED", summary: "Approval is required before this operation." };
    }
    const handler = this.handlers[parsed.name];
    if (!handler) return { ok: false, status: "needs_review", taskId: input.task.id, errorCode: "AGENT_V4_TOOL_NOT_CONFIGURED", summary: "This tool is not configured." };
    const result = await handler({ ...input, call: { ...parsed, callId: input.call.callId } });
    return safeToolResult(result);
  }
}

export const v4ApprovalRequiredTools = [...approvalRequired];
