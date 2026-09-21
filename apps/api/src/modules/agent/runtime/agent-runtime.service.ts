import type { AgentContextSnapshot, AgentDecisionType, ConversationBlock } from "./agent-protocol.js";
import type { AgentRuntimeContext, AgentRuntimeRepository, AgentRuntimeTurn } from "./agent-runtime.repository.js";

export type AgentTurnResponse = {
  sessionId: string;
  turnId: string;
  phase: string;
  blocks: ConversationBlock[];
  contextSnapshot: AgentContextSnapshot;
  pendingDecision: Record<string, unknown> | null;
  executionState: string;
  graphRevision: number;
};

export type AgentRuntimeTurnInput = {
  prompt: string;
  contextSnapshot: AgentContextSnapshot;
  idempotencyKey: string;
};

export type AgentRuntimeServiceDependencies = {
  repository: AgentRuntimeRepository;
  planner: { understand(input: { prompt: string; contextSnapshot: AgentContextSnapshot }): Promise<unknown> };
  policy: { evaluate(input: Record<string, unknown>): { allowed: boolean; failClosed: boolean; reason?: string } };
  execution: { reserveAndEnqueue(input: Record<string, unknown>): Promise<{ runId: string }> };
};

function isFirstLastFramePrompt(prompt: string): boolean {
  return /首尾帧|首帧|尾帧|first\s*frame|last\s*frame/i.test(prompt);
}

function buildUnderstanding(prompt: string): ConversationBlock {
  return { type: "understanding", id: "understanding-1", text: isFirstLastFramePrompt(prompt)
    ? "我理解你的目标：准备首帧图片、尾帧图片，并生成一份首尾帧视频提示词。"
    : `我先把你的目标整理成可执行任务：${prompt.trim().slice(0, 400)}` };
}

function buildQuestions(): ConversationBlock {
  return {
    type: "question_set",
    id: "questions-1",
    questions: [
      { id: "subject", prompt: "首帧和尾帧中的主体是什么？", kind: "text", required: true },
      { id: "transition", prompt: "首帧到尾帧需要发生什么变化？", kind: "text", required: true },
      { id: "ratio", prompt: "图片比例是什么？例如 16:9、9:16 或 1:1。", kind: "text", required: true },
      { id: "duration", prompt: "视频时长是多少秒？", kind: "text", required: true },
    ],
  };
}

function buildPlan(): ConversationBlock {
  return {
    type: "plan",
    id: "plan-first-last-frame",
    summary: "生成首帧图、尾帧图和首尾帧视频提示词，视频本身等待下一次确认。",
    deliverables: [
      { id: "first-frame", label: "首帧图片", kind: "image", quantity: 1 },
      { id: "last-frame", label: "尾帧图片", kind: "image", quantity: 1 },
      { id: "video-prompt", label: "首尾帧视频提示词", kind: "text", quantity: 1 },
    ],
    capabilities: ["asset.generate_image", "asset.generate_image", "text.generate_prompt"],
    quantity: 3,
    estimatedCredits: 0,
    writes: ["assets", "agent result group"],
    requiresConfirmation: true,
  };
}

function buildConfirmation(): ConversationBlock {
  return {
    type: "confirmation",
    id: "confirmation-first-last-frame",
    text: "将生成两张图片和一份首尾帧视频提示词，并保存到素材库；视频任务暂不执行。",
    risk: "会产生图片生成费用，结果会写入素材库。",
    costCredits: 0,
    quantity: 3,
    writes: ["assets", "agent result group"],
    confirmLabel: "确认生成图片和提示词",
    reviseLabel: "修改计划",
  };
}

export class AgentRuntimeService {
  constructor(private readonly dependencies: AgentRuntimeServiceDependencies) {}

  async submitTurn(ctx: AgentRuntimeContext, sessionId: string, input: AgentRuntimeTurnInput): Promise<AgentTurnResponse> {
    const session = await this.dependencies.repository.getSession(ctx, sessionId);
    const turn = await this.dependencies.repository.createTurnIdempotent(ctx, {
      contextSnapshot: input.contextSnapshot,
      graphRevision: input.contextSnapshot.graphRevision,
      idempotencyKey: input.idempotencyKey,
      prompt: input.prompt,
      sessionId,
    });
    const blocks = isFirstLastFramePrompt(input.prompt)
      ? [buildUnderstanding(input.prompt), buildQuestions()]
      : [buildUnderstanding(input.prompt), buildQuestions()];
    const phase = "waiting_for_input";
    await this.dependencies.repository.saveTurnStateCAS(ctx, {
      blocks,
      executionState: "idle",
      expectedGraphRevision: turn.graphRevision,
      graphRevision: turn.graphRevision,
      pendingDecision: null,
      phase,
      sessionId,
      status: "planned",
      turnId: turn.id,
    });
    await this.dependencies.repository.appendEvent(ctx, {
      event: { blocks, phase, prompt: input.prompt },
      eventType: "blocks_updated",
      graphRevision: turn.graphRevision,
      sessionId,
      turnId: turn.id,
    });
    return this.response(session, turn, phase, blocks, input.contextSnapshot, null, "idle");
  }

  async submitDecision(ctx: AgentRuntimeContext, sessionId: string, turnId: string, input: { blockId: string; type: AgentDecisionType; payload: Record<string, unknown>; idempotencyKey: string }): Promise<AgentTurnResponse> {
    const session = await this.dependencies.repository.getSession(ctx, sessionId);
    const turn = await this.dependencies.repository.getTurn(ctx, sessionId, turnId);
    await this.dependencies.repository.createDecisionIdempotent(ctx, { blockId: input.blockId, decisionType: input.type, idempotencyKey: input.idempotencyKey, payload: input.payload, sessionId, turnId });
    if (input.type === "approve_plan") {
      const policy = this.dependencies.policy.evaluate({
        currentGraphRevision: typeof input.payload.currentGraphRevision === "number" ? input.payload.currentGraphRevision : turn.graphRevision,
        expectedGraphRevision: turn.graphRevision,
        mode: session.mode,
        permission: input.payload.permission === true,
        pricing: typeof input.payload.pricing === "object" && input.payload.pricing !== null ? input.payload.pricing : null,
        requiresConfirmation: true,
        route: typeof input.payload.route === "object" && input.payload.route !== null ? input.payload.route : null,
      });
      if (!policy.allowed) throw new Error(policy.reason ?? "AGENT_APPROVAL_REQUIRED");
      const execution = await this.dependencies.execution.reserveAndEnqueue({ sessionId, turnId, payload: input.payload });
      const progress: ConversationBlock = { type: "progress", id: `progress-${execution.runId}`, steps: [{ id: execution.runId, label: "正在生成首帧、尾帧和视频提示词", status: "running" }] };
      return this.response(session, turn, "executing", [progress], turn.contextSnapshot, null, "running");
    }
    const blocks = input.type === "answer_question" ? [buildPlan(), buildConfirmation()] : turn.blocks;
    const phase = input.type === "answer_question" ? "waiting_for_confirmation" : "refining";
    await this.dependencies.repository.saveTurnStateCAS(ctx, { blocks, executionState: "idle", expectedGraphRevision: turn.graphRevision, graphRevision: turn.graphRevision, pendingDecision: phase === "waiting_for_confirmation" ? { blockId: "confirmation-first-last-frame", type: "approve_plan" } : null, phase, sessionId, status: "planned", turnId });
    return this.response(session, turn, phase, blocks, turn.contextSnapshot, phase === "waiting_for_confirmation" ? { blockId: "confirmation-first-last-frame", type: "approve_plan" } : null, "idle");
  }

  private response(session: { id: string }, turn: AgentRuntimeTurn, phase: string, blocks: ConversationBlock[], contextSnapshot: AgentContextSnapshot, pendingDecision: Record<string, unknown> | null, executionState: string): AgentTurnResponse {
    return { blocks, contextSnapshot, executionState, graphRevision: turn.graphRevision, pendingDecision, phase, sessionId: session.id, turnId: turn.id };
  }
}
