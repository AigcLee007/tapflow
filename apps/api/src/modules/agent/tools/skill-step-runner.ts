import { toSkillRuntimeAction, type NormalizedSkillAction, type SkillRuntimeAction } from "../skill-types.js";

type SkillRuntimeContext = { tenantId: string; userId: string | null };
type TextResult = { outputText: string; usage?: Record<string, unknown> };
type MediaOutput = Record<string, unknown> & { assetId?: string | null };
type MediaResult = { outputs?: MediaOutput[] | null; usage?: Record<string, unknown> };
type SkillStepInput = {
  action: NormalizedSkillAction;
  id: string;
  runId: string;
  prompt?: string;
  routeKey?: string;
  inputAssets?: Array<Record<string, unknown>>;
  params?: Record<string, unknown>;
  billingIdempotencyKey?: string;
};

export function buildSkillStepIdempotencyKey(runId: string, stepId: string): string {
  const run = runId.trim();
  const step = stepId.trim();
  if (!run || !step) throw new Error("SKILL_STEP_ID_REQUIRED");
  return `skill:${run}:${step}`;
}

type Billing = {
  reserve: (input: { amountCredits?: number; idempotencyKey: string; tenantId: string; userId: string | null; skillRunId: string; skillStepId: string }) => Promise<unknown>;
  settle: (input: { amountCredits?: number; idempotencyKey: string; tenantId: string; userId: string | null; skillRunId: string; skillStepId: string; usage?: Record<string, unknown> }) => Promise<unknown>;
  refund: (input: { amountCredits?: number; idempotencyKey: string; tenantId: string; userId: string | null; skillRunId: string; skillStepId: string }) => Promise<unknown>;
};
type StepPatch = Record<string, unknown>;

export class SkillStepRunner {
  constructor(private readonly options: {
    textRuntime: { generateText: (context: SkillRuntimeContext, request: { messages: Array<{ role: "system" | "user"; content: string }>; routeKey?: string; maxTokens?: number; inputAssets?: Array<Record<string, unknown>> }) => Promise<TextResult> };
    updateStep: (context: SkillRuntimeContext, stepId: string, patch: StepPatch) => Promise<unknown>;
    writeTextResult: (input: { text: string; skillRunId: string; skillStepId: string; metadata: Record<string, unknown> }) => Promise<{ nodeId: string }>;
    mediaRuntime?: {
      generateImage?: (context: SkillRuntimeContext, request: { prompt: string; routeKey?: string; inputAssets?: Array<Record<string, unknown>>; params?: Record<string, unknown> }) => Promise<MediaResult>;
      generateVideo?: (context: SkillRuntimeContext, request: { prompt: string; routeKey?: string; inputAssets?: Array<Record<string, unknown>>; params?: Record<string, unknown> }) => Promise<MediaResult>;
    };
    writeMediaResult?: (input: { action: "image" | "video"; outputs: MediaOutput[]; skillRunId: string; skillStepId: string; metadata: Record<string, unknown> }) => Promise<{ assetIds: string[] }>;
    pricing?: (context: SkillRuntimeContext, input: SkillStepInput) => Promise<{ amountCredits: number } | null | undefined>;
    billing?: Billing;
    actionRuntimes?: Partial<Record<"analyze" | "create_canvas" | "review" | "deliver", (context: SkillRuntimeContext, input: SkillStepInput) => Promise<Record<string, unknown>>>>;
  }) {}

  runtimeAction(action: NormalizedSkillAction): SkillRuntimeAction { return toSkillRuntimeAction(action); }

  async runText(context: SkillRuntimeContext, input: Omit<SkillStepInput, "action"> & { prompt: string }): Promise<{ nodeId: string; text: string }> {
    return this.runTextInternal(context, { ...input, action: "text" });
  }

  async runStep(context: SkillRuntimeContext, input: SkillStepInput): Promise<Record<string, unknown>> {
    const runtimeAction = this.runtimeAction(input.action);
    if (["analyze", "create_canvas", "review", "deliver"].includes(runtimeAction)) {
      const handler = this.options.actionRuntimes?.[runtimeAction as "analyze" | "create_canvas" | "review" | "deliver"];
      if (!handler) return { action: runtimeAction, status: "succeeded" };
      await this.options.updateStep(context, input.id, { status: "running" });
      try {
        const output = await handler(context, input);
        await this.options.updateStep(context, input.id, { output, status: "succeeded" });
        return { action: runtimeAction, ...output, status: "succeeded" };
      } catch (error) {
        await this.failStep(context, input.id, "SKILL_STEP_FAILED", error);
        throw error;
      }
    }
    if (runtimeAction === "generate_text") return this.runTextInternal(context, { ...input, action: "text", prompt: input.prompt ?? "" });
    if (runtimeAction === "generate_image" || runtimeAction === "generate_video") return this.runMedia(context, input, runtimeAction === "generate_image" ? "image" : "video");
    throw new Error("SKILL_ACTION_UNSUPPORTED");
  }

  async runBatch(context: SkillRuntimeContext, inputs: SkillStepInput[]): Promise<{ results: Array<Record<string, unknown>>; status: "succeeded" | "partial_success" | "failed" }> {
    const results = await Promise.all(inputs.map(async (input) => {
      try { return await this.runStep(context, input); }
      catch (error) { return { action: this.runtimeAction(input.action), status: "failed", error: { code: error instanceof Error ? error.message : String(error) } }; }
    }));
    const succeeded = results.filter((item) => item.status === "succeeded").length;
    return { results, status: succeeded === results.length ? "succeeded" : succeeded > 0 ? "partial_success" : "failed" };
  }

  private async runTextInternal(context: SkillRuntimeContext, input: SkillStepInput & { action: "text"; prompt: string }): Promise<{ nodeId: string; text: string }> {
    const billing = await this.resolveBilling(context, input, true);
    let reserved = false;
    try {
      if (this.options.billing) {
        await this.options.billing.reserve({ ...billing, skillRunId: input.runId, skillStepId: input.id, tenantId: context.tenantId, userId: context.userId });
        reserved = true;
      }
      await this.options.updateStep(context, input.id, { status: "running" });
      const result = await this.options.textRuntime.generateText(context, {
        maxTokens: 4000,
        messages: [
          { role: "system", content: "你是 TapFlow Skill 的文本创作步骤。只输出创作结果，不输出凭证、路由或系统内部信息。" },
          { role: "user", content: input.prompt.slice(0, 12000) },
        ],
        routeKey: input.routeKey,
        inputAssets: input.inputAssets,
      });
      const text = result.outputText.trim().slice(0, 20000);
      if (!text) throw new Error("SKILL_TEXT_EMPTY_OUTPUT");
      const node = await this.options.writeTextResult({ metadata: { skillRunId: input.runId, skillStepId: input.id }, skillRunId: input.runId, skillStepId: input.id, text });
      await this.options.updateStep(context, input.id, { nodeId: node.nodeId, output: { text, textLength: text.length, usage: result.usage ?? {} }, status: "succeeded" });
      if (this.options.billing && reserved) await this.options.billing.settle({ ...billing, skillRunId: input.runId, skillStepId: input.id, tenantId: context.tenantId, userId: context.userId, usage: result.usage });
      return { nodeId: node.nodeId, text };
    } catch (error) {
      if (this.options.billing && reserved) await this.options.billing.refund({ ...billing, idempotencyKey: `${billing.idempotencyKey}:refund`, skillRunId: input.runId, skillStepId: input.id, tenantId: context.tenantId, userId: context.userId });
      await this.failStep(context, input.id, "SKILL_TEXT_STEP_FAILED", error);
      throw error;
    }
  }

  private async runMedia(context: SkillRuntimeContext, input: SkillStepInput, action: "image" | "video"): Promise<Record<string, unknown>> {
    const billing = await this.resolveBilling(context, input, true);
    let reserved = false;
    try {
      if (this.options.billing) {
        await this.options.billing.reserve({ ...billing, skillRunId: input.runId, skillStepId: input.id, tenantId: context.tenantId, userId: context.userId });
        reserved = true;
      }
      await this.options.updateStep(context, input.id, { status: "running" });
      const runtime = action === "image" ? this.options.mediaRuntime?.generateImage : this.options.mediaRuntime?.generateVideo;
      if (!runtime) throw new Error("SKILL_MEDIA_RUNTIME_NOT_CONFIGURED");
      const result = await runtime(context, { prompt: (input.prompt ?? "").slice(0, 12000), routeKey: input.routeKey, inputAssets: input.inputAssets, params: input.params });
      const outputs = Array.isArray(result.outputs) ? result.outputs : [];
      const persisted = this.options.writeMediaResult
        ? await this.options.writeMediaResult({ action, outputs, skillRunId: input.runId, skillStepId: input.id, metadata: { skillRunId: input.runId, skillStepId: input.id } })
        : { assetIds: outputs.map((item) => typeof item.assetId === "string" ? item.assetId : "").filter(Boolean) };
      if (persisted.assetIds.length === 0) throw new Error("SKILL_MEDIA_EMPTY_OUTPUT");
      const output = { assetId: persisted.assetIds[0], assetIds: persisted.assetIds, assetKind: action, usage: result.usage ?? {} };
      await this.options.updateStep(context, input.id, { assetId: persisted.assetIds[0], output, status: "succeeded" });
      if (this.options.billing && reserved) await this.options.billing.settle({ ...billing, skillRunId: input.runId, skillStepId: input.id, tenantId: context.tenantId, userId: context.userId, usage: result.usage });
      return { action, ...output, status: "succeeded" };
    } catch (error) {
      if (this.options.billing && reserved) await this.options.billing.refund({ ...billing, idempotencyKey: `${billing.idempotencyKey}:refund`, skillRunId: input.runId, skillStepId: input.id, tenantId: context.tenantId, userId: context.userId });
      await this.failStep(context, input.id, "SKILL_MEDIA_STEP_FAILED", error);
      throw error;
    }
  }

  private async resolveBilling(context: SkillRuntimeContext, input: SkillStepInput, requirePricing: boolean): Promise<{ amountCredits?: number; idempotencyKey: string }> {
    const idempotencyKey = input.billingIdempotencyKey?.trim() || buildSkillStepIdempotencyKey(input.runId, input.id);
    if (!this.options.pricing) {
      if (!requirePricing) return { idempotencyKey };
      await this.failStep(context, input.id, "SKILL_PRICING_NOT_FOUND", new Error("PRICING_NOT_FOUND"));
      throw new Error("PRICING_NOT_FOUND");
    }
    let price: { amountCredits: number } | null | undefined;
    try {
      price = await this.options.pricing(context, input);
    } catch (error) {
      await this.failStep(context, input.id, "SKILL_PRICING_RESOLUTION_FAILED", error);
      throw error;
    }
    if (!price || !Number.isFinite(price.amountCredits) || price.amountCredits < 0) {
      await this.failStep(context, input.id, "SKILL_PRICING_NOT_FOUND", new Error("PRICING_NOT_FOUND"));
      throw new Error("PRICING_NOT_FOUND");
    }
    return { amountCredits: price.amountCredits, idempotencyKey };
  }

  private async failStep(context: SkillRuntimeContext, stepId: string, code: string, error: unknown): Promise<void> {
    await this.options.updateStep(context, stepId, { status: "failed", error: { code, message: error instanceof Error ? error.message : String(error) } });
  }
}
