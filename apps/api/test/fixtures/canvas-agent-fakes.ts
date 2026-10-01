import { randomUUID } from "node:crypto";
import type { TextGenerationRequest, TextStreamEvent } from "@aigc-flow/ai-gateway-core";

import type { CanvasAgentRepository, CanvasAgentSessionPatch } from "../../src/modules/canvas-agent/canvas-agent.repository.js";
import type { CanvasAgentToolDeps } from "../../src/modules/canvas-agent/canvas-agent.tools.js";
import {
  CanvasAgentError,
  type CanvasAgentContext,
  type CanvasAgentFile,
  type CanvasAgentMessage,
  type CanvasAgentMode,
  type CanvasAgentNewMessage,
  type CanvasAgentSession,
} from "../../src/modules/canvas-agent/canvas-agent.types.js";

type StoredSession = CanvasAgentSession & { owner: string; tenantId: string; touchedAt: number };
const clone = <T>(value: T): T => structuredClone(value);

/** In-memory CanvasAgentRepository with the same ownership and run-lease rules as the Pg one. */
export class MemoryCanvasAgentRepository implements CanvasAgentRepository {
  readonly sessions = new Map<string, StoredSession>();
  readonly messages = new Map<string, CanvasAgentMessage[]>();
  readonly files = new Map<string, CanvasAgentFile>();
  private readonly flows = new Map<string, { owner: string; projectId: string }>();

  addFlow(ctx: CanvasAgentContext): string {
    const flowId = randomUUID();
    this.flows.set(flowId, { owner: ctx.userId, projectId: randomUUID() });
    return flowId;
  }

  private session(ctx: CanvasAgentContext, sessionId: string): StoredSession {
    const session = this.sessions.get(sessionId);
    if (!session || session.owner !== ctx.userId || session.tenantId !== ctx.tenantId) {
      throw new CanvasAgentError(404, "CANVAS_AGENT_SESSION_NOT_FOUND", "会话不存在。");
    }
    return session;
  }

  private view({ owner: _o, tenantId: _t, touchedAt: _u, ...session }: StoredSession): CanvasAgentSession { return clone(session); }

  async assertFlowAccess(ctx: CanvasAgentContext, flowId: string) {
    const flow = this.flows.get(flowId);
    if (!flow || flow.owner !== ctx.userId) throw new CanvasAgentError(404, "CANVAS_AGENT_FLOW_NOT_FOUND", "画布不存在或无权访问。");
    return { projectId: flow.projectId };
  }

  async createSession(ctx: CanvasAgentContext, input: { flowId: string; mode: CanvasAgentMode; projectId: string }) {
    const now = new Date().toISOString();
    const session: StoredSession = {
      createdAt: now, flowId: input.flowId, id: randomUUID(), messageSeq: 0, mode: input.mode, owner: ctx.userId, pending: null,
      projectId: input.projectId, status: "idle", tenantId: ctx.tenantId, textRouteKey: null, title: "新建对话", touchedAt: Date.now(), updatedAt: now,
    };
    this.sessions.set(session.id, session);
    this.messages.set(session.id, []);
    return this.view(session);
  }

  async listSessions(ctx: CanvasAgentContext, flowId: string, limit: number) {
    return [...this.sessions.values()].filter((s) => s.flowId === flowId && s.owner === ctx.userId).slice(0, limit).map((s) => this.view(s));
  }

  async getSession(ctx: CanvasAgentContext, sessionId: string) { return this.view(this.session(ctx, sessionId)); }

  async updateSession(ctx: CanvasAgentContext, sessionId: string, patch: CanvasAgentSessionPatch) {
    const session = this.session(ctx, sessionId);
    Object.assign(session, clone(patch), { touchedAt: Date.now(), updatedAt: new Date().toISOString() });
    return this.view(session);
  }

  async claimRun(ctx: CanvasAgentContext, sessionId: string, staleAfterMs: number) {
    const session = this.session(ctx, sessionId);
    if (session.status === "running" && Date.now() - session.touchedAt < staleAfterMs) {
      throw new CanvasAgentError(409, "CANVAS_AGENT_BUSY", "Agent 正在处理上一条消息，请稍候或先停止。");
    }
    return this.updateSession(ctx, sessionId, { status: "running" });
  }

  async touchRun(ctx: CanvasAgentContext, sessionId: string) {
    const session = this.session(ctx, sessionId);
    if (session.status === "running") session.touchedAt = Date.now();
  }

  async appendMessages(ctx: CanvasAgentContext, sessionId: string, messages: CanvasAgentNewMessage[]) {
    const session = this.session(ctx, sessionId);
    const stored = messages.map((message) => {
      session.messageSeq += 1;
      return { ...clone(message), createdAt: new Date().toISOString(), id: randomUUID(), seq: session.messageSeq };
    });
    this.messages.get(sessionId)!.push(...stored);
    return clone(stored);
  }

  async listMessages(ctx: CanvasAgentContext, sessionId: string) { this.session(ctx, sessionId); return clone(this.messages.get(sessionId)!); }

  async listFiles(_ctx: CanvasAgentContext, flowId: string) {
    return [...this.files.entries()].filter(([key]) => key.startsWith(`${flowId}:`)).map(([, file]) => clone(file));
  }

  async readFile(_ctx: CanvasAgentContext, flowId: string, path: string) { return clone(this.files.get(`${flowId}:${path}`) ?? null); }

  async writeFile(_ctx: CanvasAgentContext, input: { content: string; flowId: string; path: string }) {
    const key = `${input.flowId}:${input.path}`;
    const file = { content: input.content, path: input.path, updatedAt: new Date().toISOString(), version: (this.files.get(key)?.version ?? 0) + 1 };
    this.files.set(key, file);
    return clone(file);
  }
}

// ---------- scripted model ----------

type Round = TextStreamEvent[] | ((request: TextGenerationRequest) => TextStreamEvent[] | Promise<TextStreamEvent[]>);

/** Fake text runtime: each streamText call plays the next scripted round and records the request. */
export function scriptedRuntime(rounds: Round[]) {
  const requests: Array<Omit<TextGenerationRequest, "signal">> = [];
  return {
    requests,
    async getTextStreamingCapabilities() { return { supportsTextStreaming: true, supportsToolCalling: true }; },
    async *streamText(_ctx: unknown, request: TextGenerationRequest): AsyncGenerator<TextStreamEvent> {
      const { signal, ...rest } = request;
      requests.push(structuredClone(rest));
      const round = rounds.shift();
      if (!round) throw new Error(`no scripted round for model call #${requests.length}`);
      const events = typeof round === "function" ? await round(request) : round;
      for (const event of events) {
        yield event;
        if (signal?.aborted) { yield { type: "cancelled" }; return; }
      }
    },
  };
}

export const say = (text: string): TextStreamEvent[] => [{ text, type: "text_delta" }, { finishReason: "stop", type: "done" }];

export function calls(...items: Array<[name: string, args: unknown, callId?: string]>): TextStreamEvent[] {
  return [
    ...items.map(([name, args, callId], index): TextStreamEvent => ({
      arguments: typeof args === "string" ? args : JSON.stringify(args), callId: callId ?? `call_${name}_${index}`, name, type: "tool_call",
    })),
    { finishReason: "tool_calls", type: "done" },
  ];
}

// ---------- fake services ----------

export const IMAGE_MODEL = "seedream-5-pro";
export const IMAGE_ROUTE = "image.seedream.line1";
export const CREDITS_PER_IMAGE = 6;

export function fakeDeps(repository: CanvasAgentRepository): CanvasAgentToolDeps & { savedToFolder: string[] } {
  const savedToFolder: string[] = [];
  const folders: Array<{ id: string; name: string; parentFolderId: string | null }> = [];
  const deps = {
    assets: {
      async addAssetToFolder(_ctx: unknown, _folderId: string, assetId: string) { savedToFolder.push(assetId); return { ok: true }; },
      async createFolder(_ctx: unknown, input: { name: string }) { const folder = { id: randomUUID(), name: input.name, parentFolderId: null }; folders.push(folder); return folder; },
      async listAssets() { return { items: [], page: 1, pageSize: 12, total: 0 }; },
      async listFolders() { return folders; },
    },
    catalog: {
      async listModels() { return [{ defaultRouteKey: IMAGE_ROUTE, displayName: "Seedream 5.0 Pro", modelKey: IMAGE_MODEL }]; },
      async listRoutesForModel(_ctx: unknown, modelKey: string) {
        if (modelKey !== IMAGE_MODEL) return [];
        return [{
          capabilities: { aspectRatios: ["1:1", "3:4", "4:3"], maxCount: 4, maxImages: 4, resolutions: ["1K", "2K", "4K"], supportedGenerationModes: [], supportedVideoWorkflows: [], supportsImageInput: true },
          estimatedCredits: CREDITS_PER_IMAGE, routeKey: IMAGE_ROUTE, routeLabel: "线路一",
        }];
      },
    },
    costEstimator: {
      async estimateGenerateImage(input: { n?: number }) {
        return { items: [], route: { modelKey: IMAGE_MODEL, providerKey: "fake", routeKey: IMAGE_ROUTE }, totalCredits: CREDITS_PER_IMAGE * (input.n ?? 1), unit: "credits" };
      },
    },
    repository,
    savedToFolder,
  };
  return deps as unknown as CanvasAgentToolDeps & { savedToFolder: string[] };
}
