import { skillSourceSchema } from "./skill-schemas.js";
import type { SkillSource } from "./skill-types.js";

export type SkillAuthoringTurnInput = {
  draft: Partial<SkillSource>;
  userMessage: string;
};

export type SkillAuthoringTurnResult = {
  assistantReply: string;
  missingQuestions: string[];
  readyToPreview: boolean;
  sourcePatch: Partial<SkillSource>;
  validationNotes: string[];
};

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
  async turn(input: SkillAuthoringTurnInput): Promise<SkillAuthoringTurnResult> {
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
