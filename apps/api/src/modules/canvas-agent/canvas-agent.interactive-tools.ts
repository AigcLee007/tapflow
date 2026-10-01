import { z } from "zod";

import { defineTool, result, type CanvasAgentTool, type CanvasAgentToolContext, type CanvasAgentToolOutcome } from "./canvas-agent.tools.js";
import {
  CanvasAgentError,
  type CanvasAgentGenerationPlan,
  type CanvasAgentPending,
  type CanvasAgentQuestion,
} from "./canvas-agent.types.js";

// ---------- ask_user ----------

const questionSchema = z.object({
  allowFreeText: z.boolean().optional().describe("是否允许用户直接打字回答，默认 true"),
  id: z.string().trim().regex(/^[a-z0-9_]{1,40}$/),
  options: z.array(z.object({
    description: z.string().trim().max(120).optional(),
    id: z.string().trim().regex(/^[a-z0-9_]{1,40}$/),
    label: z.string().trim().min(1).max(40),
    recommended: z.boolean().optional(),
  }).strict()).max(6),
  prompt: z.string().trim().min(1).max(200),
  selection: z.enum(["single", "multiple"]).optional().describe("默认 single"),
  tag: z.string().trim().max(8).optional().describe("问题短标签，如 素材现状、风格定位"),
}).strict();

const askUserSchema = z.object({
  questions: z.array(questionSchema).min(1).max(4),
}).strict().refine((value) => new Set(value.questions.map((q) => q.id)).size === value.questions.length, "问题 id 不能重复");

const askUser = defineTool({
  name: "ask_user",
  description: "向用户提出 1~4 个关键问题并暂停，等用户回答后继续。每个问题给 2~4 个选项并标出一个推荐项。只问真正影响结果的问题，已知信息不要再问。",
  schema: askUserSchema,
  title: () => "向你确认关键方向",
  async run(args, { callId }) {
    const questions: CanvasAgentQuestion[] = args.questions.map((question) => ({
      ...question,
      // A question without options can only be answered by typing.
      allowFreeText: question.options.length === 0 ? true : question.allowFreeText ?? true,
      selection: question.selection ?? "single",
    }));
    return { pending: { callId, kind: "questions", questions, toolName: "ask_user" }, type: "pause" };
  },
});

export const questionAnswersSchema = z.object({
  answers: z.array(z.object({
    optionIds: z.array(z.string().trim().max(40)).max(6).optional(),
    questionId: z.string().trim().max(40),
    text: z.string().trim().max(1000).optional(),
  }).strict()).max(4),
}).strict();

/** Validate the user's answers against the pending questions and build the tool result for the model. */
export function resolveQuestionAnswers(
  pending: Extract<CanvasAgentPending, { kind: "questions" }>,
  payload: unknown,
): CanvasAgentToolOutcome {
  const parsed = questionAnswersSchema.safeParse(payload);
  if (!parsed.success) throw new CanvasAgentError(400, "CANVAS_AGENT_ANSWER_INVALID", "回答格式不正确。");
  const byId = new Map(pending.questions.map((question) => [question.id, question]));
  const answers = parsed.data.answers.map((answer) => {
    const question = byId.get(answer.questionId);
    if (!question) throw new CanvasAgentError(400, "CANVAS_AGENT_ANSWER_INVALID", "回答了不存在的问题。");
    const optionIds = answer.optionIds ?? [];
    if (question.selection === "single" && optionIds.length > 1) {
      throw new CanvasAgentError(400, "CANVAS_AGENT_ANSWER_INVALID", `「${question.prompt}」只能选一个。`);
    }
    const labels = optionIds.map((optionId) => {
      const option = question.options.find((item) => item.id === optionId);
      if (!option) throw new CanvasAgentError(400, "CANVAS_AGENT_ANSWER_INVALID", "选择了不存在的选项。");
      return option.label;
    });
    if (answer.text && !question.allowFreeText) {
      throw new CanvasAgentError(400, "CANVAS_AGENT_ANSWER_INVALID", `「${question.prompt}」不支持自由回答。`);
    }
    return { question: question.prompt, questionId: question.id, selected: labels, ...(answer.text ? { text: answer.text } : {}) };
  });
  const answeredIds = new Set(answers.map((answer) => answer.questionId));
  const skipped = pending.questions.filter((question) => !answeredIds.has(question.id)).map((question) => question.prompt);
  return result(
    { answers, ...(skipped.length ? { skipped, note: "用户未回答的问题请按推荐项或合理默认处理" } : {}) },
    answers.map((answer) => answer.text ?? answer.selected.join("、")).filter(Boolean).join("；") || "已跳过",
  );
}
// ---------- propose_generation ----------

const SIZES = ["1K", "2K", "4K"] as const;

const generationTaskSchema = z.object({
  prompt: z.string().trim().min(1).max(4000).describe("完整生成提示词"),
  referenceAssetIds: z.array(z.string().uuid()).max(8).optional().describe("参考图素材 id（来自画布或素材库）"),
  title: z.string().trim().min(1).max(40).describe("画布节点标题，如 款式候选A·苔原墨绿"),
}).strict();

const proposeGenerationSchema = z.object({
  aspectRatio: z.string().trim().max(10).optional().describe("如 3:4；必须是 model_contract 返回的比例"),
  count: z.number().int().min(1).max(4).optional().describe("每个任务出几张，默认 1"),
  modelKey: z.string().trim().min(1).max(120),
  routeKey: z.string().trim().max(200).optional().describe("不填则用模型默认线路"),
  size: z.enum(SIZES).optional().describe("默认 2K"),
  tasks: z.array(generationTaskSchema).min(1).max(12),
}).strict();

type GenerationInput = z.infer<typeof proposeGenerationSchema>;

/** Validate against the live catalog and price every task. Throws CanvasAgentError with a user-readable message. */
export async function buildGenerationPlan(input: GenerationInput, { ctx, deps }: Pick<CanvasAgentToolContext, "ctx" | "deps">): Promise<CanvasAgentGenerationPlan> {
  const invalid = (message: string) => new CanvasAgentError(400, "CANVAS_AGENT_GENERATION_INVALID", message);
  const routes = await deps.catalog.listRoutesForModel(ctx, input.modelKey, { environment: "production" });
  if (!routes.length) throw invalid(`模型 ${input.modelKey} 当前不可用。`);
  const route = input.routeKey ? routes.find((item) => item.routeKey === input.routeKey) : routes[0];
  if (!route) throw invalid(`模型 ${input.modelKey} 没有线路 ${input.routeKey}。`);
  const capabilities = route.capabilities;

  const ratios = capabilities.aspectRatios?.length ? capabilities.aspectRatios : null;
  const aspectRatio = input.aspectRatio ?? (ratios?.includes("1:1") || !ratios ? "1:1" : ratios[0]!);
  if (ratios && !ratios.includes(aspectRatio)) throw invalid(`该模型不支持比例 ${aspectRatio}，可选：${ratios.join("、")}。`);

  const sizes = (capabilities.resolutions ?? []).filter((value): value is (typeof SIZES)[number] => (SIZES as readonly string[]).includes(value));
  const size = input.size ?? (!sizes.length || sizes.includes("2K") ? "2K" : sizes[0]!);
  if (sizes.length && !sizes.includes(size)) throw invalid(`该模型不支持 ${size}，可选：${sizes.join("、")}。`);

  const count = input.count ?? 1;
  if (capabilities.maxCount && count > capabilities.maxCount) throw invalid(`该模型每次最多 ${capabilities.maxCount} 张。`);
  for (const task of input.tasks) {
    const refs = task.referenceAssetIds?.length ?? 0;
    if (refs && capabilities.supportsImageInput === false) throw invalid("该模型不支持参考图。");
    if (capabilities.maxImages && refs > capabilities.maxImages) throw invalid(`该模型最多 ${capabilities.maxImages} 张参考图。`);
  }

  let estimatedCredits = 0;
  for (const task of input.tasks) {
    try {
      const estimate = await deps.costEstimator.estimateGenerateImage({
        n: count, prompt: task.prompt, routeKey: route.routeKey, size, tenantId: ctx.tenantId, userId: ctx.userId,
      });
      estimatedCredits += estimate.totalCredits;
    } catch {
      throw invalid("这条线路还没有配置价格，暂时不能生成。");
    }
  }

  return {
    estimatedCredits,
    modelKey: input.modelKey,
    routeKey: route.routeKey,
    tasks: input.tasks.map((task) => ({
      aspectRatio, count, prompt: task.prompt, referenceAssetIds: task.referenceAssetIds ?? [], size, title: task.title,
    })),
  };
}

const proposeGeneration = defineTool({
  name: "propose_generation",
  description: "提交一批图片生成任务。手动确认模式下会先给用户看确认卡（任务、模型、比例、分辨率、预估积分），确认后才在画布上生成；返回每个任务的生成结果。一批最多 12 个任务，同一批共用模型/比例/分辨率/张数。",
  schema: proposeGenerationSchema,
  title: (args) => `准备生成 ${args.tasks.length} 个图片任务`,
  async run(args, context) {
    let plan: CanvasAgentGenerationPlan;
    try {
      plan = await buildGenerationPlan(args, context);
    } catch (error) {
      // Let the model fix its own parameters instead of failing the turn.
      if (error instanceof CanvasAgentError) return result({ error: error.code, message: error.message }, error.message);
      throw error;
    }
    const kind = context.session.mode === "auto" ? "canvas_generate" : "generation_approval";
    return { pending: { callId: context.callId, kind, plan, toolName: "propose_generation" }, type: "pause" };
  },
});

export const generationApprovalSchema = z.object({
  approved: z.boolean(),
  feedback: z.string().trim().max(1000).optional(),
  overrides: proposeGenerationSchema.pick({ aspectRatio: true, count: true, modelKey: true, routeKey: true, size: true }).partial().optional(),
  /** Indexes of tasks the user kept (the card lets them remove tasks). Omit to keep all. */
  taskIndexes: z.array(z.number().int().min(0).max(11)).min(1).max(12).optional(),
}).strict();

/**
 * Apply the user's decision on a generation card.
 * - rejected → a tool result the model sees, loop continues
 * - approved → (re-validated) plan ready for the browser to execute on the canvas
 */
export async function resolveGenerationApproval(
  pending: Extract<CanvasAgentPending, { kind: "generation_approval" }>,
  payload: unknown,
  context: Pick<CanvasAgentToolContext, "ctx" | "deps">,
): Promise<{ outcome: CanvasAgentToolOutcome; type: "rejected" } | { plan: CanvasAgentGenerationPlan; type: "approved" }> {
  const parsed = generationApprovalSchema.safeParse(payload);
  if (!parsed.success) throw new CanvasAgentError(400, "CANVAS_AGENT_DECISION_INVALID", "确认信息格式不正确。");
  const decision = parsed.data;
  if (!decision.approved) {
    return { outcome: result({ approved: false, feedback: decision.feedback ?? null }, decision.feedback ? `已取消：${decision.feedback}` : "用户取消了这批生成"), type: "rejected" };
  }
  const kept = decision.taskIndexes ? [...new Set(decision.taskIndexes)].sort((a, b) => a - b) : pending.plan.tasks.map((_task, index) => index);
  if (kept.some((index) => index >= pending.plan.tasks.length)) throw new CanvasAgentError(400, "CANVAS_AGENT_DECISION_INVALID", "任务序号超出范围。");
  const first = pending.plan.tasks[0]!;
  const plan = await buildGenerationPlan({
    aspectRatio: decision.overrides?.aspectRatio ?? first.aspectRatio,
    count: decision.overrides?.count ?? first.count,
    modelKey: decision.overrides?.modelKey ?? pending.plan.modelKey,
    // A different model means its own default route.
    routeKey: decision.overrides?.routeKey ?? (decision.overrides?.modelKey && decision.overrides.modelKey !== pending.plan.modelKey ? undefined : pending.plan.routeKey),
    size: decision.overrides?.size ?? first.size,
    tasks: kept.map((index) => {
      const task = pending.plan.tasks[index]!;
      return { prompt: task.prompt, referenceAssetIds: task.referenceAssetIds, title: task.title };
    }),
  }, context);
  return { plan, type: "approved" };
}

export const generationResultsSchema = z.object({
  results: z.array(z.object({
    assetIds: z.array(z.string().uuid()).max(8),
    error: z.string().trim().max(300).optional(),
    nodeIds: z.array(z.string().trim().min(1).max(120)).max(8),
    status: z.enum(["succeeded", "failed", "cancelled"]),
    taskIndex: z.number().int().min(0).max(11),
  }).strict()).max(12),
}).strict();

/** The browser reports what happened on the canvas; becomes the propose_generation tool result. */
export function resolveGenerationResults(
  pending: Extract<CanvasAgentPending, { kind: "canvas_generate" }>,
  payload: unknown,
): CanvasAgentToolOutcome {
  const parsed = generationResultsSchema.safeParse(payload);
  if (!parsed.success) throw new CanvasAgentError(400, "CANVAS_AGENT_RESULTS_INVALID", "生成结果格式不正确。");
  if (parsed.data.results.some((item) => item.taskIndex >= pending.plan.tasks.length)) {
    throw new CanvasAgentError(400, "CANVAS_AGENT_RESULTS_INVALID", "任务序号超出范围。");
  }
  const results = parsed.data.results.map((item) => ({ ...item, title: pending.plan.tasks[item.taskIndex]!.title }));
  const succeeded = results.filter((item) => item.status === "succeeded").length;
  return result(
    { modelKey: pending.plan.modelKey, results, routeKey: pending.plan.routeKey },
    `${succeeded}/${pending.plan.tasks.length} 个任务生成成功`,
  );
}

export const interactiveTools: CanvasAgentTool[] = [askUser, proposeGeneration];
