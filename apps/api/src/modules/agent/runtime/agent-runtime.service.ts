import { randomUUID } from "node:crypto";
import { normalizeConversationBlocks, type AgentContextSnapshot, type ConversationBlock } from "./agent-protocol.js";
import type { AgentRuntimeContext, AgentRuntimeRepository, AgentRuntimeSession, AgentRuntimeStateInput, AgentRuntimeTurn } from "./agent-runtime.repository.js";
import type { AgentRequirementPlanner, AgentRequirementPlan } from "./agent-requirement-planner.js";
import type { AgentRuntimeContextService } from "./agent-runtime-context.js";
import type { AgentExecutionAdapter, AgentExecutionStep } from "./agent-execution-adapter.js";
import { agentRuntimeDecisionSchema, agentRuntimeTurnSchema, type AgentRuntimeDecisionRequest } from "./agent-runtime.schemas.js";

export type AgentServiceContext = AgentRuntimeContext & { permissions?: string[] };
export type AgentTurnResponse = Omit<AgentRuntimeTurn, "planJson" | "idempotencyKey" | "id"> & { turnId: string };
export type AgentRuntimeTurnInput = { prompt: string; contextSnapshot: AgentContextSnapshot; idempotencyKey: string };
type Quote = Awaited<ReturnType<AgentExecutionAdapter["quote"]>>;
type Execution = { key: string; runId?: string; nodeIds?: Record<string, string> };
type RuntimePlan = { requirement?: AgentRequirementPlan; answers?: Record<string, string | string[]>; steps?: AgentExecutionStep[]; quote?: Quote; execution?: Execution; context?: AgentContextSnapshot; resultGroupId?: string };
export type AgentRuntimeServiceDependencies = {
  repository: AgentRuntimeRepository; planner: Pick<AgentRequirementPlanner, "plan"> & { understand?: (...args: never[]) => Promise<unknown> };
  context: Pick<AgentRuntimeContextService, "assemble" | "models" | "resolveSteps" | "placementGraph">;
  execution: Pick<AgentExecutionAdapter, "quote" | "start" | "get" | "cancel"> & { reserveAndEnqueue?: (input: Record<string, unknown>) => Promise<{ runId: string }> };
};
function requirePermission(ctx: AgentServiceContext, permission: string) {
  if (!ctx.userId || !ctx.permissions?.includes(permission)) throw new Error("AGENT_PERMISSION_DENIED");
}
export function publicAgentTurn(turn: AgentRuntimeTurn): AgentTurnResponse {
  const { planJson: _plan, idempotencyKey: _key, id, ...rest } = turn;
  return { ...rest, turnId: id };
}
const storedPlan = (turn: AgentRuntimeTurn) => turn.planJson as RuntimePlan;
const pending = (turn: AgentRuntimeTurn, blockId: string, allowedTypes: string[]) => ({ id: randomUUID(), blockId, graphRevision: turn.graphRevision, allowedTypes });
function state(turn: AgentRuntimeTurn, patch: Partial<AgentRuntimeStateInput>): AgentRuntimeStateInput {
  return { sessionId: turn.sessionId, turnId: turn.id, expectedStateVersion: turn.stateVersion, expectedGraphRevision: turn.graphRevision, graphRevision: turn.graphRevision, phase: turn.phase, executionState: turn.executionState, blocks: turn.blocks, pendingDecision: turn.pendingDecision, ...patch };
}
function failureMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  if (code.includes("PRICING") || code.includes("QUOTE")) return "模型费用发生变化或缺少有效定价，请重新规划后确认。";
  if (code.includes("MODEL") || code.includes("ROUTE")) return "当前没有可执行的模型，请在模型配置恢复后重试。";
  if (code.includes("GRAPH") || code.includes("CONTEXT")) return "画布已发生变化，请刷新上下文后重新提交。";
  if (code.includes("REFERENCE")) return "引用素材不可用，请重新选择素材。";
  if (code.includes("PLANNER")) return "暂时无法完成需求规划，请重试；本次没有启动生成。";
  return "任务暂未完成，可重试恢复或修改计划。";
}

export class AgentRuntimeService {
  constructor(private readonly dependencies: AgentRuntimeServiceDependencies) {}

  async createSession(ctx: AgentServiceContext, input: { projectId: string | null; flowId: string | null; title?: string }) { requirePermission(ctx, "flow:read"); return this.dependencies.repository.createSession(ctx, input); }
  async listSessions(ctx: AgentServiceContext, filter: { projectId?: string | null; flowId?: string | null; limit?: number } = {}) { requirePermission(ctx, "flow:read"); return this.dependencies.repository.listSessions(ctx, filter); }
  async getSession(ctx: AgentServiceContext, sessionId: string) { requirePermission(ctx, "flow:read"); return this.dependencies.repository.getSession(ctx, sessionId); }
  async getHistory(ctx: AgentServiceContext, sessionId: string, options: { limit?: number; cursor?: string | null } = {}) { requirePermission(ctx, "flow:read"); return this.dependencies.repository.getHistory(ctx, sessionId, options); }
  async getEvents(ctx: AgentServiceContext, sessionId: string, afterSeq = 0) { requirePermission(ctx, "flow:read"); return this.dependencies.repository.listEvents(ctx, sessionId, afterSeq); }
  async updateSession(ctx: AgentServiceContext, sessionId: string, input: { mode?: "auto" | "manual_confirmation"; title?: string }) { requirePermission(ctx, "flow:read"); return this.dependencies.repository.updateSession(ctx, sessionId, input); }
  async refreshExecution(ctx: AgentServiceContext, sessionId: string, turnId: string): Promise<AgentTurnResponse> {
    requirePermission(ctx, "flow:read");
    const session = await this.dependencies.repository.getSession(ctx, sessionId);
    const turn = await this.dependencies.repository.getTurn(ctx, sessionId, turnId);
    const stored = storedPlan(turn);
    if (!stored.execution?.runId || !session.flowId) return publicAgentTurn(turn);
    const run = await this.dependencies.execution.get(ctx, { flowId: session.flowId, runId: stored.execution.runId });
    const nodes = run.nodeRuns ?? [];
    if (run.workflowRun.status === "succeeded" && nodes.length) {
      const groupId = stored.resultGroupId ?? await this.dependencies.repository.saveResultGroup(ctx, { sessionId, turnId, runId: stored.execution.runId, status: "ready", idempotencyKey: `group:${stored.execution.runId}` });
      const existing = await this.dependencies.repository.listResultRefs(ctx, sessionId, turnId);
      const existingKeys = new Set(existing.map(item => `${item.kind}:${item.label}`));
      for (const step of stored.requirement?.steps ?? []) {
        const nodeId = stored.execution.nodeIds?.[step.id];
        const node = nodes.find(item => item.nodeId === nodeId);
        if (!node || node.status !== "succeeded") continue;
        const output = node.outputJson ?? {};
        const assets = Array.isArray(output.assets) ? output.assets : [];
        const assetId = typeof output.assetId === "string" ? output.assetId : (assets[0] && typeof assets[0] === "object" && typeof (assets[0] as Record<string, unknown>).assetId === "string" ? (assets[0] as Record<string, unknown>).assetId as string : null);
        const contentText = typeof output.text === "string" ? output.text : null;
        if ((step.kind === "text" && !contentText) || (step.kind !== "text" && !assetId) || existingKeys.has(`${step.kind}:${step.label}`)) continue;
        await this.dependencies.repository.saveResultRef(ctx, { resultGroupId: groupId, runId: stored.execution.runId, assetId, contentText, kind: step.kind, label: step.label, sourceRefs: step.referenceIds, lineage: { sessionId, turnId, stepId: step.id, nodeId }, idempotencyKey: `result:${stored.execution.runId}:${step.id}` });
      }
      const results = await this.dependencies.repository.listResultRefs(ctx, sessionId, turnId);
      return publicAgentTurn(await this.dependencies.repository.saveTurnStateCAS(ctx, state(turn, { phase: "presenting_results", executionState: "completed", pendingDecision: pending(turn, "results", ["result_action"]), planJson: { ...stored, resultGroupId: groupId }, blocks: [{ type: "result_group", id: groupId, results: results.map(item => ({ id: item.id, label: item.label, kind: item.kind, assetId: item.assetId ?? undefined, runId: item.runId ?? undefined, status: item.status === "ready" ? "ready" : "failed", sourceRefs: item.sourceRefs, contentText: item.contentText ?? undefined, placedNodeId: item.placedNodeId ?? undefined })) }] })));
    }
    return publicAgentTurn(turn);
  }

  async submitTurn(ctx: AgentServiceContext, sessionId: string, raw: AgentRuntimeTurnInput): Promise<AgentTurnResponse> {
    requirePermission(ctx, "flow:read");
    const input = agentRuntimeTurnSchema.parse(raw);
    const session = await this.dependencies.repository.getSession(ctx, sessionId);
    const turn = await this.dependencies.repository.createTurnIdempotent(ctx, { ...input, sessionId, graphRevision: input.contextSnapshot.graphRevision });
    if (turn.stateVersion > 0 || turn.blocks.length) return publicAgentTurn(turn);
    try { return publicAgentTurn(await this.plan(ctx, session, turn, {})); }
    catch (error) { return publicAgentTurn(await this.fail(ctx, turn, error)); }
  }

  async submitDecision(ctx: AgentServiceContext, sessionId: string, turnId: string, raw: AgentRuntimeDecisionRequest): Promise<AgentTurnResponse> {
    const parsed = agentRuntimeDecisionSchema.parse(raw);
    requirePermission(ctx, ["approve_plan", "cancel_execution", "retry_execution"].includes(parsed.type) ? "flow:run" : parsed.type === "result_action" && parsed.payload.action === "place" ? "flow:update" : "flow:read");
    const session = await this.dependencies.repository.getSession(ctx, sessionId);
    const current = await this.dependencies.repository.getTurn(ctx, sessionId, turnId);
    const input = { ...parsed, decisionId: parsed.decisionId ?? String(current.pendingDecision?.id ?? randomUUID()), blockId: parsed.blockId ?? String(current.pendingDecision?.blockId ?? "approval"), idempotencyKey: parsed.idempotencyKey ?? `decision:${turnId}:${parsed.type}` } as AgentRuntimeDecisionRequest & { decisionId: string; blockId: string; idempotencyKey: string };
    if (input.type === "answer_question" && current.pendingDecision) this.validateAnswers(current, input.payload.answers);
    const claim = await this.dependencies.repository.beginDecision(ctx, { ...input, sessionId, turnId });
    if (claim.replay && claim.decision.resultState === "completed") return publicAgentTurn(claim.turn);
    const owner = randomUUID();
    if (this.dependencies.repository.claimExecution && !await this.dependencies.repository.claimExecution(ctx, { sessionId, turnId, owner, leaseMs: 300_000 })) return publicAgentTurn(claim.turn);
    let turn = claim.turn;
    let decisionCompleted = false;
    const complete = async (patch: Partial<AgentRuntimeStateInput>) => {
      const next = await this.dependencies.repository.completeDecision(ctx, { ...state(turn, patch), decisionId: claim.decision.id });
      decisionCompleted = true;
      return next;
    };
    try {
      const stored = storedPlan(turn);
      if (input.type === "answer_question" || input.type === "edit_brief" || input.type === "revise_plan") {
        const answers = { ...stored.answers, ...(input.type === "answer_question" ? input.payload.answers : { revision: input.payload.instruction }) };
        return publicAgentTurn(await this.plan(ctx, session, turn, answers, claim.decision.id));
      }
      if (input.type === "approve_plan") {
        if (!stored.steps?.length || !stored.quote || !stored.requirement) throw new Error("AGENT_PLAN_MISSING");
        await this.dependencies.context.assemble(ctx, session, turn.contextSnapshot);
        const execution = { key: "turn:" + turn.id + ":approval:" + claim.decision.id };
        turn = await complete({ phase: "executing", executionState: "queued", pendingDecision: null, planJson: { ...stored, execution }, blocks: [...turn.blocks.filter(block => block.type !== "confirmation"), this.progress(stored.requirement)] });
        return publicAgentTurn(await this.start(ctx, session, turn));
      }
      if (input.type === "cancel_execution") {
        if (!stored.execution?.runId || !session.flowId) throw new Error("AGENT_EXECUTION_MISSING");
        await this.dependencies.execution.cancel(ctx, { flowId: session.flowId, runId: stored.execution.runId });
        return publicAgentTurn(await complete({ phase: "executing", executionState: "running", pendingDecision: null, blocks: [{ type: "progress", id: "cancelling", steps: [{ id: "cancel", label: "正在取消任务并核对费用释放状态", status: "running" }] }] }));
      }
      if (input.type === "retry_execution") {
        if (stored.execution) {
          turn = await complete({ phase: "executing", executionState: "queued", pendingDecision: null });
          return publicAgentTurn(await this.start(ctx, session, turn));
        }
        return publicAgentTurn(await this.plan(ctx, session, turn, stored.answers ?? {}, claim.decision.id));
      }
      if (input.type === "result_action") {
        if (input.payload.action === "place") {
          const result = await this.dependencies.repository.getResultRef(ctx, input.payload.resultIds[0]!);
          if (!session.flowId) throw new Error("AGENT_CONTEXT_SCOPE_CONFLICT");
          const placement = await this.dependencies.context.placementGraph(ctx, session, result);
          const placed = await this.dependencies.repository.placeResultAtomic(ctx, { resultId: result.id, placedNodeId: placement.placedNodeId, expectedGraphRevision: placement.expectedGraphRevision, graph: placement.graph });
          const results = await this.dependencies.repository.listResultRefs(ctx, sessionId, turnId);
          return publicAgentTurn(await complete({
            phase: "presenting_results",
            executionState: "completed",
            graphRevision: placed.graphRevision,
            pendingDecision: pending({ ...turn, graphRevision: placed.graphRevision }, "results", ["result_action"]),
            blocks: [{
              type: "result_group",
              id: stored.resultGroupId,
              results: results.map(item => ({
                id: item.id,
                label: item.label,
                kind: item.kind,
                assetId: item.assetId ?? undefined,
                runId: item.runId ?? undefined,
                status: item.status === "ready" || item.status === "placed" ? "ready" : "failed",
                sourceRefs: item.sourceRefs,
                contentText: item.contentText ?? undefined,
                placedNodeId: item.placedNodeId ?? undefined,
              })),
            }],
          }));
        }
        return publicAgentTurn(await complete({ phase: "presenting_results", executionState: "completed", pendingDecision: pending(turn, "results", ["result_action"]) }));
      }
      throw new Error("AGENT_RESULT_ACTION_REQUIRES_RESULT_CONTROLLER");
    } catch (error) { return publicAgentTurn(await this.fail(ctx, turn, error, decisionCompleted ? undefined : claim.decision.id)); }
    finally { if (this.dependencies.repository.releaseExecution) await this.dependencies.repository.releaseExecution(ctx, { sessionId, turnId, owner }); }
  }

  private validateAnswers(turn: AgentRuntimeTurn, answers: Record<string, string | string[]>) {
    const questions = storedPlan(turn).requirement?.questions ?? [];
    if (!questions.length || Object.keys(answers).some(id => !questions.some(question => question.id === id))) throw new Error("AGENT_ANSWER_INVALID");
    for (const question of questions) {
      const answer = answers[question.id];
      if (answer === undefined) continue;
      const values = Array.isArray(answer) ? answer : answer ? [answer] : [];
      if (question.required && !values.length) throw new Error("AGENT_ANSWER_REQUIRED");
      if (question.kind !== "multiple" && Array.isArray(answer)) throw new Error("AGENT_ANSWER_INVALID");
      if (question.kind !== "text" && values.some(value => !question.options?.some(option => option.id === value))) throw new Error("AGENT_ANSWER_INVALID");
    }
  }

  private async plan(ctx: AgentServiceContext, session: AgentRuntimeSession, turn: AgentRuntimeTurn, answers: Record<string, string | string[]>, decisionId?: string): Promise<AgentRuntimeTurn> {
    const context = await this.dependencies.context.assemble(ctx, session, turn.contextSnapshot);
    const models = await this.dependencies.context.models(ctx);
    const requirement = await this.dependencies.planner.plan(ctx, { prompt: turn.prompt, contextSnapshot: context, answers, previousPlan: storedPlan(turn).requirement ?? null, models });
    const blocks: ConversationBlock[] = [{ type: "understanding", id: "understanding", text: requirement.understanding }];
    if (requirement.brief.length) blocks.push({ type: "brief", id: "brief", fields: requirement.brief, editable: true });
    let patch: Partial<AgentRuntimeStateInput>;
    if (requirement.questions.length) {
      blocks.push({ type: "question_set", id: "questions", questions: requirement.questions });
      patch = { phase: "waiting_for_input", executionState: "idle", blocks, pendingDecision: pending(turn, "questions", ["answer_question", "revise_plan"]), planJson: { requirement, answers, context } };
    } else {
      if (!session.flowId) throw new Error("AGENT_CONTEXT_SCOPE_CONFLICT");
      const steps = await this.dependencies.context.resolveSteps(ctx, requirement, context);
      const quote = await this.dependencies.execution.quote(ctx, { flowId: session.flowId, graphRevision: turn.graphRevision, steps });
      if (!Number.isFinite(quote.credits) || quote.credits < 0 || !quote.fingerprint) throw new Error("PRICING_NOT_FOUND");
      const modelNames = [...new Set(quote.steps.map(step => step.modelDisplayName).filter(Boolean))].join("、");
      blocks.push({ type: "plan", id: "plan", summary: requirement.understanding + (modelNames ? " 使用模型：" + modelNames + "。" : ""), deliverables: requirement.steps.map(step => ({ id: step.id, label: step.label, kind: step.kind, quantity: 1 })), quantity: steps.length, estimatedCredits: quote.credits, references: context.refs.map(ref => ref.refId), capabilities: [...new Set(steps.map(step => step.kind + ".generate"))], writes: ["素材库", "会话结果"], requiresConfirmation: true });
      blocks.push({ type: "confirmation", id: "approval", text: "确认按此计划生成并保存结果，完成后可选择放入画布。", costCredits: quote.credits, quantity: steps.length, writes: ["素材库", "会话结果"], confirmLabel: "确认生成", reviseLabel: "修改计划" });
      patch = { phase: "waiting_for_confirmation", executionState: "idle", blocks, pendingDecision: pending(turn, "approval", ["approve_plan", "revise_plan", "edit_brief"]), planJson: { requirement, answers, context, steps, quote } };
    }
    const next = state(turn, { ...patch, status: "planned", blocks: normalizeConversationBlocks(blocks) });
    return decisionId ? this.dependencies.repository.completeDecision(ctx, { ...next, decisionId }) : this.dependencies.repository.saveTurnStateCAS(ctx, next);
  }

  private progress(requirement: AgentRequirementPlan): ConversationBlock {
    return { type: "progress", id: "execution-progress", steps: requirement.steps.map(step => ({ id: step.id, label: step.label, status: "pending" })) };
  }
  private async start(ctx: AgentServiceContext, session: AgentRuntimeSession, turn: AgentRuntimeTurn): Promise<AgentRuntimeTurn> {
    requirePermission(ctx, "flow:run");
    const stored = storedPlan(turn);
    if (!stored.execution || !stored.steps || !stored.quote || !session.flowId) throw new Error("AGENT_EXECUTION_MISSING");
    const run = await this.dependencies.execution.start(ctx, { flowId: session.flowId, graphRevision: stored.context?.graphRevision ?? turn.graphRevision, steps: stored.steps, executionKey: stored.execution.key, expectedQuoteFingerprint: stored.quote.fingerprint });
    return this.dependencies.repository.saveTurnStateCAS(ctx, state(turn, { phase: "executing", executionState: "running", pendingDecision: pending(turn, "execution-progress", ["cancel_execution"]), planJson: { ...stored, execution: { ...stored.execution, runId: run.runId, nodeIds: run.nodeIdsByStepId } } }));
  }
  private async fail(ctx: AgentServiceContext, turn: AgentRuntimeTurn, error: unknown, decisionId?: string): Promise<AgentRuntimeTurn> {
    if (error instanceof Error && error.message === "AGENT_STATE_VERSION_CONFLICT") return this.dependencies.repository.getTurn(ctx, turn.sessionId, turn.id);
    const next = state(turn, { phase: "recoverable_error", executionState: "failed", status: "failed", blocks: [...turn.blocks.filter(block => !["confirmation", "error_recovery"].includes(block.type)), { type: "error_recovery", id: "recovery", message: failureMessage(error), actions: [{ id: "retry", label: "重试恢复", action: "retry" }, { id: "revise", label: "修改计划", action: "revise" }] }], pendingDecision: pending(turn, "recovery", ["retry_execution", "revise_plan"]) });
    return decisionId ? this.dependencies.repository.completeDecision(ctx, { ...next, decisionId }) : this.dependencies.repository.saveTurnStateCAS(ctx, next);
  }
}
