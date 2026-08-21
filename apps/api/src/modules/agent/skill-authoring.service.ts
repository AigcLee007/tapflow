import { skillSourceSchema } from "./skill-schemas.js";
import type { SkillSource } from "./skill-types.js";
import { z } from "zod";
import { buildSkillAuthoringPrompt } from "./skill-authoring-prompt.js";

export type SkillAuthoringCanvasSnapshot = {
  nodes: Array<{ id: string; kind?: string; text?: string; title?: string }>;
  selectedNodeIds: string[];
};

export type SkillAuthoringTurnInput = {
  canvasSnapshot?: SkillAuthoringCanvasSnapshot;
  draft: Partial<SkillSource>;
  sessionId?: string | null;
  userMessage: string;
  /** Server-only runtime context; never accepted from the client payload. */
  runtimeContext?: { tenantId: string; userId: string | null };
};

export type SkillAuthoringTurnResult = {
  assistantReply: string;
  missingQuestions: string[];
  readyToPreview: boolean;
  sourcePatch: Partial<SkillSource>;
  validationNotes: string[];
};

const authoringOutputSchema = z.object({
  assistantReply: z.string().trim().min(1).max(2000),
  missingQuestions: z.array(z.string().trim().min(1).max(300)).max(8),
  readyToPreview: z.boolean(),
  sourcePatch: skillSourceSchema.partial().strict(),
  validationNotes: z.array(z.string().trim().min(1).max(300)).max(12),
}).strict();

export type SkillAuthoringStructuredOutput = z.infer<typeof authoringOutputSchema>;

export function parseAuthoringStructuredOutput(raw: string | unknown): SkillAuthoringStructuredOutput {
  const value = typeof raw === "string" ? JSON.parse(raw) : raw;
  return authoringOutputSchema.parse(value);
}

function stripJsonFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fenced?.[1]?.trim() ?? trimmed;
}

const DEFAULT_SOURCE: SkillSource = {
  askWhen: "缺少必要输入时追问",
  inputs: "",
  method: "分析需求\n完成创作\n检查输出",
  modality: "text",
  name: "",
  outputs: "",
  summary: "",
  usageScenarios: "",
};

export class SkillAuthoringService {
  private readonly generate?: (prompt: string, context?: { tenantId: string; userId: string | null }) => Promise<string>;
  private readonly repairAttempts: number;

  constructor(options: { generate?: (prompt: string, context?: { tenantId: string; userId: string | null }) => Promise<string>; repairAttempts?: number } = {}) {
    this.generate = options.generate;
    this.repairAttempts = Math.min(1, Math.max(0, Math.floor(options.repairAttempts ?? 1)));
  }

  parseModelOutput(raw: string): SkillAuthoringStructuredOutput {
    try {
      return parseAuthoringStructuredOutput(stripJsonFence(raw));
    } catch {
      throw new Error("AUTHORING_OUTPUT_INVALID");
    }
  }

  async turn(input: SkillAuthoringTurnInput): Promise<SkillAuthoringTurnResult> {
    const sanitizedInput = { ...input, canvasSnapshot: sanitizeCanvasSnapshot(input.canvasSnapshot) };
    if (this.generate) {
      let lastError: unknown;
      for (let attempt = 0; attempt <= this.repairAttempts; attempt += 1) {
        try {
          const structured = this.parseModelOutput(await this.generate(buildSkillAuthoringPrompt(sanitizedInput, attempt > 0), sanitizedInput.runtimeContext));
          return normalizeModelResult(sanitizedInput.draft, structured);
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError instanceof Error ? lastError : new Error("AUTHORING_OUTPUT_INVALID");
    }
    const message = input.userMessage.trim();
    const source: SkillSource = { ...DEFAULT_SOURCE, ...input.draft };
    const sourcePatch: Partial<SkillSource> = {};
    sourcePatch.modality = input.draft.modality ?? (/图片|产品图|图像/.test(message) ? "image" : /视频/.test(message) ? "video" : "text");
    if (!source.name) {
      sourcePatch.name = /广告文案/.test(message) ? "广告文案 Skill" : /短视频/.test(message) ? "短视频创作 Skill" : "我的创作 Skill";
    }
    if (!source.summary && message) sourcePatch.summary = message.slice(0, 120);
    if (!source.inputs && message) sourcePatch.inputs = /产品|商品/.test(message) ? "产品卖点\n目标受众" : "创作主题\n目标受众";
    if (!source.outputs && message) sourcePatch.outputs = /文案/.test(message) ? "标题\n正文" : /视频/.test(message) ? "脚本\n视频" : "创作结果";
    if (message) sourcePatch.method = source.method || DEFAULT_SOURCE.method;
    if (!source.usageScenarios && message) sourcePatch.usageScenarios = "广告创作\n内容发布";
    if (!source.askWhen && message) sourcePatch.askWhen = DEFAULT_SOURCE.askWhen;
    const merged = { ...source, ...sourcePatch };
    const missingQuestions: string[] = [];
    if (!message || (!/文案|图片|图像|视频|脚本|分镜|海报|产品图/.test(message))) missingQuestions.push("主要创作类型和产出是什么？");
    if (!merged.inputs) missingQuestions.push("这个 Skill 需要哪些输入？");
    if (!merged.outputs) missingQuestions.push("希望最终输出什么？");
    const readyToPreview = missingQuestions.length === 0 && (() => {
      try { skillSourceSchema.parse(merged); return true; } catch { return false; }
    })();
    return {
      assistantReply: readyToPreview ? "我已经整理出一个 Skill 草稿，请检查名称、输入、方法和输出。" : "我还需要一点信息，才能整理出可预览的 Skill 草稿。",
      missingQuestions,
      readyToPreview,
      sourcePatch,
      validationNotes: readyToPreview ? [] : ["草稿仍缺少必填信息"],
    };
  }
}

function sanitizeCanvasSnapshot(snapshot: SkillAuthoringCanvasSnapshot | undefined): SkillAuthoringCanvasSnapshot | undefined {
  if (!snapshot) return undefined;
  return {
    nodes: snapshot.nodes.slice(0, 24).map((node) => ({
      id: String(node.id).slice(0, 120),
      ...(node.kind ? { kind: String(node.kind).slice(0, 40) } : {}),
      ...(node.text ? { text: String(node.text).slice(0, 240) } : {}),
      ...(node.title ? { title: String(node.title).slice(0, 120) } : {}),
    })),
    selectedNodeIds: snapshot.selectedNodeIds.slice(0, 12).map((id) => String(id).slice(0, 120)),
  };
}

function normalizeModelResult(draft: Partial<SkillSource>, output: SkillAuthoringStructuredOutput): SkillAuthoringTurnResult {
  const merged = { ...DEFAULT_SOURCE, ...draft, ...output.sourcePatch };
  const valid = (() => { try { skillSourceSchema.parse(merged); return true; } catch { return false; } })();
  return {
    ...output,
    readyToPreview: output.readyToPreview && valid,
    validationNotes: valid ? output.validationNotes : [...output.validationNotes, "草稿仍缺少必填信息"],
  };
}
