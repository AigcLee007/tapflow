import { AiGatewayError } from "@aigc-flow/ai-gateway-core";

import type { AgentRunSettingsService } from "../agent/agent-run-settings.service.js";
import { resolveGenerationApproval, resolveGenerationResults, resolveQuestionAnswers } from "./canvas-agent.interactive-tools.js";
import { toolResultMessage, type CanvasAgentLoop, type CanvasAgentLoopResult } from "./canvas-agent.loop.js";
import type { CanvasAgentRepository } from "./canvas-agent.repository.js";
import type { CanvasAgentToolDeps, CanvasAgentToolOutcome } from "./canvas-agent.tools.js";
import {
  CanvasAgentError,
  type CanvasAgentContext,
  type CanvasAgentEvent,
  type CanvasAgentMessage,
  type CanvasAgentMode,
  type CanvasAgentNewMessage,
  type CanvasAgentPending,
  type CanvasAgentSession,
  type CanvasSnapshot,
} from "./canvas-agent.types.js";

/** Started by the route right after a successful start*() call; resolves when the stream is over. */
export type CanvasAgentRun = (emit: (event: CanvasAgentEvent) => void, signal: AbortSignal) => Promise<void>;

type Logger = { error: (details: Record<string, unknown>, message: string) => void };

export type CanvasAgentMessageView = Omit<CanvasAgentMessage, "toolCalls"> & { toolCalls: Array<{ callId: string; name: string }> | null };

const DEFAULT_TITLE = "新建对话";
const PENDING_TITLE: Record<CanvasAgentPending["kind"], string> = {
  canvas_generate: "在画布上生成图片",
  generation_approval: "确认生成",
  questions: "向你确认关键方向",
};

/** The tool call a pending interaction belongs to, in the shape toolResultMessage expects. */
const pendingCall = (pending: CanvasAgentPending) => ({ callId: pending.callId, name: pending.toolName });

function pendingCard(pending: CanvasAgentPending): Record<string, unknown> {
  return pending.kind === "questions"
    ? { kind: "questions", questions: pending.questions }
    : { kind: "generation", plan: pending.plan };
}

export class CanvasAgentService {
  private readonly active = new Map<string, AbortController>();
  private readonly repository: CanvasAgentRepository;
  private readonly staleAfterMs: number;
  private readonly heartbeatMs: number;

  constructor(private readonly options: {
    defaultRouteKey: string;
    deps: CanvasAgentToolDeps;
    heartbeatMs?: number;
    logger?: Logger;
    loop: Pick<CanvasAgentLoop, "run">;
    runSettings?: Pick<AgentRunSettingsService, "listImageRunSettings">;
    staleAfterMs?: number;
    textRuntime: { getTextStreamingCapabilities: (ctx: { tenantId: string; userId: string | null }, routeKey: string | null) => Promise<unknown> };
  }) {
    this.repository = options.deps.repository;
    this.staleAfterMs = options.staleAfterMs ?? 90_000;
    this.heartbeatMs = options.heartbeatMs ?? 20_000;
  }

  // ---------- sessions & files ----------

  async createSession(ctx: CanvasAgentContext, input: { flowId: string; mode?: CanvasAgentMode }): Promise<CanvasAgentSession> {
    const { projectId } = await this.repository.assertFlowAccess(ctx, input.flowId);
    return this.repository.createSession(ctx, { flowId: input.flowId, mode: input.mode ?? "manual", projectId });
  }

  async listSessions(ctx: CanvasAgentContext, flowId: string): Promise<CanvasAgentSession[]> {
    await this.repository.assertFlowAccess(ctx, flowId);
    return this.repository.listSessions(ctx, flowId, 30);
  }

  async getSessionDetail(ctx: CanvasAgentContext, sessionId: string): Promise<{ messages: CanvasAgentMessageView[]; session: CanvasAgentSession }> {
    const [session, messages] = await Promise.all([this.repository.getSession(ctx, sessionId), this.repository.listMessages(ctx, sessionId)]);
    return {
      // Raw tool output stays server-side; the UI renders tool steps from `display`.
      messages: messages.map((message) => ({
        ...message,
        content: message.role === "tool" ? "" : message.content,
        toolCalls: message.toolCalls?.map(({ callId, name }) => ({ callId, name })) ?? null,
      })),
      session,
    };
  }

  async updateSession(ctx: CanvasAgentContext, sessionId: string, patch: { mode?: CanvasAgentMode; title?: string }): Promise<CanvasAgentSession> {
    return this.repository.updateSession(ctx, sessionId, patch);
  }

  async listFiles(ctx: CanvasAgentContext, flowId: string) {
    await this.repository.assertFlowAccess(ctx, flowId);
    return (await this.repository.listFiles(ctx, flowId)).map(({ content, ...file }) => ({ ...file, chars: content.length }));
  }

  async readFile(ctx: CanvasAgentContext, flowId: string, path: string) {
    await this.repository.assertFlowAccess(ctx, flowId);
    const file = await this.repository.readFile(ctx, flowId, path);
    if (!file) throw new CanvasAgentError(404, "CANVAS_AGENT_FILE_NOT_FOUND", "文件不存在。");
    return file;
  }

  async listImageModels(ctx: CanvasAgentContext) {
    if (!this.options.runSettings) return { models: [] };
    return this.options.runSettings.listImageRunSettings(ctx);
  }

  // ---------- runs ----------

  /** New user message. Validates and claims the session before the SSE stream opens. */
  async startMessage(ctx: CanvasAgentContext, sessionId: string, input: { canvas: CanvasSnapshot | null; content: string }): Promise<CanvasAgentRun> {
    const content = input.content.trim();
    if (!content) throw new CanvasAgentError(400, "CANVAS_AGENT_MESSAGE_EMPTY", "消息不能为空。");
    const before = await this.repository.getSession(ctx, sessionId);
    const routeKey = before.textRouteKey ?? this.options.defaultRouteKey;
    await this.ensureRouteReady(ctx, routeKey);
    const session = await this.repository.claimRun(ctx, sessionId, this.staleAfterMs);
    try {
      const messages: CanvasAgentNewMessage[] = [];
      if (session.pending) {
        // The user typed instead of answering the card: close the open call so history stays valid.
        messages.push(toolResultMessage(pendingCall(session.pending), {
          output: { error: "SUPERSEDED", message: "用户没有处理这一步，直接发送了新消息" }, type: "result",
        }, { card: pendingCard(session.pending), superseded: true, title: PENDING_TITLE[session.pending.kind] }));
      }
      messages.push({ content, display: null, role: "user", toolCallId: null, toolCalls: null, toolName: null });
      await this.repository.appendMessages(ctx, sessionId, messages);
      const updated = await this.repository.updateSession(ctx, sessionId, {
        pending: null,
        ...(session.messageSeq === 0 && session.title === DEFAULT_TITLE ? { title: content.slice(0, 24) } : {}),
      });
      return (emit, signal) => this.execute(ctx, updated, routeKey, input.canvas, emit, signal);
    } catch (error) {
      await this.releaseRun(ctx, sessionId, session.pending);
      throw error;
    }
  }

  /** The user answered a card, or the browser reports canvas generation results. */
  async startResume(ctx: CanvasAgentContext, sessionId: string, input: { callId: string; canvas: CanvasSnapshot | null; payload: unknown }): Promise<CanvasAgentRun> {
    const before = await this.repository.getSession(ctx, sessionId);
    const pending = this.requirePending(before, input.callId);
    const routeKey = before.textRouteKey ?? this.options.defaultRouteKey;
    const toolDeps = { ctx, deps: this.options.deps };

    // Validate before claiming so a bad payload never changes session state.
    let outcome: CanvasAgentToolOutcome | null = null;
    let card: Record<string, unknown> = pendingCard(pending);
    let next: CanvasAgentPending | null = null;
    // Images from the batch that just finished; the model reviews them in its next round.
    let reviewAssetIds: string[] = [];
    if (pending.kind === "questions") {
      outcome = resolveQuestionAnswers(pending, input.payload);
      card = { ...card, answers: (outcome as { output: { answers: unknown } }).output.answers };
    } else if (pending.kind === "generation_approval") {
      const decision = await resolveGenerationApproval(pending, input.payload, toolDeps);
      if (decision.type === "rejected") { outcome = decision.outcome; card = { ...card, approved: false }; }
      else next = { callId: pending.callId, kind: "canvas_generate", plan: decision.plan, toolName: "propose_generation" };
    } else {
      outcome = resolveGenerationResults(pending, input.payload);
      const results = (outcome as { output: { results: Array<{ assetIds: string[]; status: string }> } }).output.results;
      card = { ...card, results };
      reviewAssetIds = results.filter((item) => item.status === "succeeded").flatMap((item) => item.assetIds);
    }
    if (outcome) await this.ensureRouteReady(ctx, routeKey);

    const session = await this.repository.claimRun(ctx, sessionId, this.staleAfterMs);
    try {
      // Another request may have resolved this call between our read and the claim.
      // (Status is now "running" because we hold the claim, so only the call id is compared.)
      if (session.pending?.callId !== input.callId) {
        throw new CanvasAgentError(409, "CANVAS_AGENT_PENDING_MISMATCH", "这一步已经处理过了，请刷新。");
      }
      if (next) {
        // Approved: hand the plan to the browser, no model call needed yet.
        const waiting = next;
        await this.repository.updateSession(ctx, sessionId, { pending: waiting, status: "waiting" });
        return async (emit) => { emit({ pending: waiting, type: "waiting" }); emit({ reason: "waiting", type: "done" }); };
      }
      await this.repository.appendMessages(ctx, sessionId, [
        toolResultMessage(pendingCall(pending), outcome as Extract<CanvasAgentToolOutcome, { type: "result" }>, { card, title: PENDING_TITLE[pending.kind] }),
      ]);
      const updated = await this.repository.updateSession(ctx, sessionId, { pending: null });
      return (emit, signal) => this.execute(ctx, updated, routeKey, input.canvas, emit, signal, reviewAssetIds);
    } catch (error) {
      await this.releaseRun(ctx, sessionId, session.pending);
      throw error;
    }
  }

  /** Stop a live run on this instance, or cancel the interaction the session is waiting on. */
  async stop(ctx: CanvasAgentContext, sessionId: string): Promise<{ stopped: boolean }> {
    const session = await this.repository.getSession(ctx, sessionId);
    const controller = this.active.get(sessionId);
    if (controller) { controller.abort(); return { stopped: true }; }
    if (session.status === "waiting" && session.pending) {
      await this.repository.appendMessages(ctx, sessionId, [toolResultMessage(pendingCall(session.pending), {
        output: { error: "CANCELLED", message: "用户停止了这一步" }, type: "result",
      }, { card: pendingCard(session.pending), cancelled: true, title: PENDING_TITLE[session.pending.kind] })]);
      await this.repository.updateSession(ctx, sessionId, { pending: null, status: "idle" });
      return { stopped: true };
    }
    // A run held by another API instance cannot be aborted from here; its lease expires on its own.
    return { stopped: false };
  }

  private async execute(
    ctx: CanvasAgentContext, session: CanvasAgentSession, routeKey: string, canvas: CanvasSnapshot | null,
    emit: (event: CanvasAgentEvent) => void, clientSignal: AbortSignal, reviewAssetIds: string[] = [],
  ): Promise<void> {
    const controller = new AbortController();
    const onClientGone = () => controller.abort();
    clientSignal.addEventListener("abort", onClientGone);
    if (clientSignal.aborted) controller.abort();
    this.active.set(session.id, controller);
    const heartbeat = setInterval(() => { void this.repository.touchRun(ctx, session.id).catch(() => undefined); }, this.heartbeatMs);
    let outcome: CanvasAgentLoopResult = "cancelled";
    try {
      outcome = await this.options.loop.run({ canvas, ctx, emit, reviewAssetIds, routeKey, session, signal: controller.signal });
      if (outcome === "round_limit") emit({ code: "CANVAS_AGENT_ROUND_LIMIT", message: "这一轮步骤太多，已暂停。回复「继续」可以接着做。", type: "error" });
      emit({ reason: outcome, type: "done" });
    } catch (error) {
      const mapped = this.mapError(error);
      if (mapped.statusCode >= 500 && !(error instanceof CanvasAgentError)) {
        this.options.logger?.error({ err: error, sessionId: session.id }, "canvas agent run failed");
      }
      emit({ code: mapped.code, message: mapped.message, type: "error" });
      emit({ reason: "completed", type: "done" });
    } finally {
      clearInterval(heartbeat);
      clientSignal.removeEventListener("abort", onClientGone);
      if (this.active.get(session.id) === controller) this.active.delete(session.id);
      if (outcome !== "waiting") await this.repository.updateSession(ctx, session.id, { status: "idle" }).catch(() => undefined);
    }
  }

  private requirePending(session: CanvasAgentSession, callId: string): CanvasAgentPending {
    if (session.status !== "waiting" || !session.pending) {
      throw new CanvasAgentError(409, "CANVAS_AGENT_NOTHING_PENDING", "当前没有等待处理的操作，请刷新。");
    }
    if (session.pending.callId !== callId) {
      throw new CanvasAgentError(409, "CANVAS_AGENT_PENDING_MISMATCH", "这一步已经处理过了，请刷新。");
    }
    return session.pending;
  }

  /** Undo a claim when setup fails after claimRun. */
  private async releaseRun(ctx: CanvasAgentContext, sessionId: string, pending: CanvasAgentPending | null): Promise<void> {
    await this.repository.updateSession(ctx, sessionId, { status: pending ? "waiting" : "idle" }).catch(() => undefined);
  }

  private async ensureRouteReady(ctx: CanvasAgentContext, routeKey: string): Promise<void> {
    try {
      await this.options.textRuntime.getTextStreamingCapabilities(ctx, routeKey);
    } catch (error) {
      const code = error instanceof AiGatewayError ? error.code : "";
      if (code === "AGENT_ROUTE_CAPABILITY_REQUIRED") {
        throw new CanvasAgentError(503, "CANVAS_AGENT_ROUTE_NOT_ENABLED", "Agent 使用的文本线路还没开启工具调用：请到 模型中心 → 文本 → 编辑线路，勾选「供画布 Agent 使用」。");
      }
      if (code === "ROUTE_NOT_FOUND") {
        throw new CanvasAgentError(503, "CANVAS_AGENT_ROUTE_NOT_FOUND", `找不到 Agent 文本线路 ${routeKey}，请检查 AGENT_TEXT_ROUTE_KEY 配置。`);
      }
      throw error;
    }
  }

  private mapError(error: unknown): { code: string; message: string; statusCode: number } {
    if (error instanceof CanvasAgentError) return { code: error.code, message: error.message, statusCode: error.statusCode };
    if (error instanceof AiGatewayError) {
      return { code: error.code, message: "模型服务暂时不可用，请稍后重试。", statusCode: error.statusCode };
    }
    return { code: "CANVAS_AGENT_INTERNAL_ERROR", message: "Agent 出错了，请稍后重试。", statusCode: 500 };
  }
}
