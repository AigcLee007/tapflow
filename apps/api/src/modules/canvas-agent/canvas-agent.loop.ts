import type { TextGenerationRequest, TextMessage, TextStreamEvent } from "@aigc-flow/ai-gateway-core";

import { buildSystemPrompt } from "./canvas-agent.prompt.js";
import { toolInputSchema, type CanvasAgentTool, type CanvasAgentToolDeps, type CanvasAgentToolOutcome } from "./canvas-agent.tools.js";
import {
  CanvasAgentError,
  type CanvasAgentContext,
  type CanvasAgentEvent,
  type CanvasAgentMessage,
  type CanvasAgentNewMessage,
  type CanvasAgentPending,
  type CanvasAgentSession,
  type CanvasAgentToolCall,
  type CanvasSnapshot,
} from "./canvas-agent.types.js";

export type CanvasAgentTextRuntime = {
  streamText: (context: { tenantId: string; userId: string | null }, request: TextGenerationRequest) => AsyncIterable<TextStreamEvent>;
};

export type CanvasAgentLoopResult = "cancelled" | "completed" | "round_limit" | "waiting";

export const DEFAULT_MAX_ROUNDS = 20;
const MAX_STORED_TOOL_CHARS = 20_000;
const MAX_HISTORY_MESSAGES = 120;

const clipText = (value: string, max: number) => (value.length > max ? `${value.slice(0, max)}…(已截断)` : value);

/** Persistable tool-result message. */
export function toolResultMessage(call: { callId: string; name: string }, outcome: Extract<CanvasAgentToolOutcome, { type: "result" }>, display: Record<string, unknown>): CanvasAgentNewMessage {
  const output = outcome.output ?? null;
  const ok = !(output && typeof output === "object" && "error" in (output as Record<string, unknown>));
  return {
    content: clipText(JSON.stringify(output), MAX_STORED_TOOL_CHARS),
    display: { ok, ...(outcome.summary ? { summary: outcome.summary } : {}), ...display },
    role: "tool",
    toolCallId: call.callId,
    toolCalls: null,
    toolName: call.name,
  };
}

/**
 * Convert stored history into provider messages.
 * - every assistant tool call gets exactly one result (missing ones are filled
 *   in, e.g. after a crash), orphan results are dropped;
 * - history is trimmed from the front, only at a user-message boundary, so a
 *   tool call is never separated from its result.
 */
export function buildModelMessages(systemPrompt: string, history: CanvasAgentMessage[]): TextMessage[] {
  let start = 0;
  if (history.length > MAX_HISTORY_MESSAGES) {
    const cut = history.findIndex((message, index) => index >= history.length - MAX_HISTORY_MESSAGES && message.role === "user");
    start = cut >= 0 ? cut : 0;
  }
  const out: TextMessage[] = [{ content: systemPrompt, role: "system" }];
  let open = new Map<string, string>();
  const closeOpen = () => {
    for (const [callId, name] of open) out.push({ content: JSON.stringify({ error: "NO_RESULT", message: "该工具调用没有返回结果" }), role: "tool", toolCallId: callId, toolName: name });
    open = new Map();
  };
  for (const message of history.slice(start)) {
    if (message.role === "tool") {
      if (!message.toolCallId || !open.has(message.toolCallId)) continue;
      open.delete(message.toolCallId);
      out.push({ content: message.content, role: "tool", toolCallId: message.toolCallId, toolName: message.toolName ?? undefined });
      continue;
    }
    closeOpen();
    if (message.role === "assistant") {
      const calls = message.toolCalls ?? [];
      if (!message.content.trim() && !calls.length) continue;
      out.push({ content: message.content, role: "assistant", ...(calls.length ? { toolCalls: calls } : {}) });
      for (const call of calls) open.set(call.callId, call.name);
      continue;
    }
    out.push({ content: message.content, role: "user" });
  }
  closeOpen();
  return out;
}

const PAUSE_SUMMARY: Record<CanvasAgentPending["kind"], string> = {
  canvas_generate: "正在画布上生成",
  generation_approval: "等待你确认生成",
  questions: "等待你回答",
};
export type CanvasAgentRunInput = {
  canvas: CanvasSnapshot | null;
  ctx: CanvasAgentContext;
  emit: (event: CanvasAgentEvent) => void;
  routeKey: string;
  session: CanvasAgentSession;
  signal: AbortSignal;
};

/**
 * The tool-calling loop: call the model, run the tools it asks for, feed the
 * results back, repeat until it answers without tools, pauses on an
 * interactive tool, is stopped, or hits the round limit.
 */
export class CanvasAgentLoop {
  private readonly tools: Map<string, CanvasAgentTool>;
  private readonly maxRounds: number;

  constructor(private readonly options: {
    deps: CanvasAgentToolDeps;
    maxRounds?: number;
    onToolError?: (error: unknown, tool: string) => void;
    textRuntime: CanvasAgentTextRuntime;
    tools: CanvasAgentTool[];
  }) {
    this.tools = new Map(options.tools.map((tool) => [tool.name, tool]));
    this.maxRounds = options.maxRounds ?? DEFAULT_MAX_ROUNDS;
  }

  async run(input: CanvasAgentRunInput): Promise<CanvasAgentLoopResult> {
    const { ctx, emit, session, signal } = input;
    const repository = this.options.deps.repository;
    const toolDefinitions = [...this.tools.values()].map((tool) => ({
      description: tool.description, inputSchema: toolInputSchema(tool.schema), name: tool.name,
    }));

    for (let round = 0; round < this.maxRounds; round += 1) {
      if (signal.aborted) return "cancelled";
      const [history, files] = await Promise.all([repository.listMessages(ctx, session.id), repository.listFiles(ctx, session.flowId)]);
      const messages = buildModelMessages(buildSystemPrompt({ files, session }), history);
      emit({ phase: round === 0 ? "thinking" : "organizing", type: "status" });

      let text = "";
      const calls: CanvasAgentToolCall[] = [];
      let cancelled = false;
      try {
        const stream = this.options.textRuntime.streamText(ctx, {
          maxTokens: 8000, messages, routeKey: input.routeKey, signal, toolChoice: "auto", tools: toolDefinitions,
        });
        for await (const event of stream) {
          if (event.type === "text_delta") { text += event.text; emit({ text: event.text, type: "text_delta" }); }
          else if (event.type === "tool_call") calls.push({ arguments: event.arguments, callId: event.callId, name: event.name });
          else if (event.type === "cancelled") cancelled = true;
          else if (event.type === "error") throw new CanvasAgentError(502, "CANVAS_AGENT_MODEL_ERROR", event.error.message || "模型调用失败");
        }
      } catch (error) {
        if (!signal.aborted) throw error;
        cancelled = true;
      }
      if (cancelled || signal.aborted) {
        // Keep what the user already saw; drop half-formed tool calls.
        if (text.trim()) await repository.appendMessages(ctx, session.id, [{ content: text, display: { cancelled: true }, role: "assistant", toolCallId: null, toolCalls: null, toolName: null }]);
        return "cancelled";
      }

      await repository.appendMessages(ctx, session.id, [{
        content: text, display: null, role: "assistant", toolCallId: null, toolCalls: calls.length ? calls : null, toolName: null,
      }]);
      if (!calls.length) return "completed";

      emit({ phase: "running_tools", type: "status" });
      let pending: CanvasAgentPending | null = null;
      for (const call of calls) {
        if (pending || signal.aborted) {
          const reason = pending ? "本轮已有一个需要你处理的操作，这个调用未执行，请稍后重新调用" : "用户已停止";
          await repository.appendMessages(ctx, session.id, [toolResultMessage(call, { output: { error: "SKIPPED", message: reason }, type: "result" }, { title: call.name })]);
          continue;
        }
        const outcome = await this.executeTool(call, input);
        if (outcome.type === "pause") pending = outcome.pending;
      }
      if (pending) {
        await repository.updateSession(ctx, session.id, { pending, status: "waiting" });
        emit({ pending, type: "waiting" });
        return "waiting";
      }
      if (signal.aborted) return "cancelled";
    }
    return "round_limit";
  }

  private async executeTool(call: CanvasAgentToolCall, input: CanvasAgentRunInput): Promise<CanvasAgentToolOutcome> {
    const { ctx, emit, session } = input;
    const tool = this.tools.get(call.name);
    const startedAt = Date.now();
    // Real title needs parsed args; until then show the raw tool name.
    let title = call.name;
    let started = false;
    let outcome: CanvasAgentToolOutcome;
    try {
      if (!tool) {
        outcome = { output: { error: "TOOL_NOT_FOUND", message: `没有工具 ${call.name}` }, type: "result" };
      } else {
        let raw: unknown;
        try { raw = JSON.parse(call.arguments || "{}"); } catch { raw = undefined; }
        const parsed = raw === undefined ? null : tool.schema.safeParse(raw);
        if (!parsed?.success) {
          const issues = parsed && !parsed.success ? parsed.error.issues.slice(0, 5).map((issue) => `${issue.path.join(".") || "参数"}: ${issue.message}`) : ["参数不是合法 JSON"];
          outcome = { output: { error: "INVALID_ARGUMENTS", issues }, summary: "参数有误", type: "result" };
        } else {
          title = tool.title(parsed.data);
          emit({ callId: call.callId, name: call.name, title, type: "tool_started" });
          started = true;
          if (tool.permission && !ctx.permissions.includes(tool.permission)) {
            outcome = { output: { error: "PERMISSION_DENIED", message: "当前账号没有这个操作的权限" }, summary: "没有权限", type: "result" };
          } else {
            outcome = await tool.run(parsed.data, { callId: call.callId, canvas: input.canvas, ctx, deps: this.options.deps, emit, session });
          }
        }
      }
    } catch (error) {
      if (!(error instanceof CanvasAgentError)) this.options.onToolError?.(error, call.name);
      const message = error instanceof CanvasAgentError ? error.message : "工具执行出错";
      outcome = { output: { error: error instanceof CanvasAgentError ? error.code : "TOOL_FAILED", message }, summary: message, type: "result" };
    }
    const durationMs = Date.now() - startedAt;
    // Every finished step has a matching started step in the UI.
    if (!started) emit({ callId: call.callId, name: call.name, title, type: "tool_started" });
    if (outcome.type === "pause") {
      emit({ callId: call.callId, durationMs, name: call.name, ok: true, summary: PAUSE_SUMMARY[outcome.pending.kind], title, type: "tool_finished" });
      return outcome;
    }
    const message = toolResultMessage(call, outcome, { durationMs, title });
    await this.options.deps.repository.appendMessages(ctx, session.id, [message]);
    emit({ callId: call.callId, durationMs, name: call.name, ok: message.display?.ok !== false, summary: outcome.summary, title, type: "tool_finished" });
    return outcome;
  }
}
