import { createHash } from "node:crypto";

import { normalizedSkillSchema } from "./skill-schemas.js";
import type { NormalizedSkill, SkillSource } from "./skill-types.js";

const MAX_SOURCE_CHARS = 24_000;

function lines(value: string): string[] {
  return value.split(/\r?\n|[。；;]/).map((item) => item.trim()).filter(Boolean);
}

function actionForInstruction(instruction: string, modality: SkillSource["modality"], index: number): NormalizedSkill["methodSteps"][number]["action"] {
  const lower = instruction.toLowerCase();
  if (index === 0 || /分析|研究|理解|analy[sz]/i.test(lower)) return "analyze";
  if (/检查|审核|review|校验/i.test(lower)) return "review";
  if (/交付|导出|发布|deliver/i.test(lower)) return "deliver";
  if (modality === "text") return "text";
  return modality;
}

function canonicalize(source: SkillSource, methodSteps: NormalizedSkill["methodSteps"]): string {
  return JSON.stringify({
    askWhen: source.askWhen.trim(),
    category: source.category?.trim() ?? null,
    inputs: lines(source.inputs),
    methodSteps,
    modality: source.modality,
    name: source.name.trim(),
    outputs: lines(source.outputs),
    summary: source.summary.trim(),
    triggers: source.triggers?.map((value) => value.trim()).sort() ?? [],
    usageScenarios: lines(source.usageScenarios),
    version: 1,
  });
}

export function normalizeSkillSource(source: SkillSource): NormalizedSkill {
  const sourceChars = JSON.stringify(source).length;
  if (sourceChars > MAX_SOURCE_CHARS) throw new Error("Skill source exceeds maximum size");
  const method = lines(source.method);
  if (method.length > 12) throw new Error("Skill method exceeds maximum steps");
  const methodSteps = method.map((instruction, index) => ({
    action: actionForInstruction(instruction, source.modality, index),
    id: `step-${index + 1}`,
    instruction,
  }));
  const normalized: NormalizedSkill = {
    approvalRules: {
      beforeBatch: source.modality !== "text",
      beforeCreditRun: true,
      beforeDelivery: true,
      beforeOverwrite: true,
    },
    checksum: createHash("sha256").update(canonicalize(source, methodSteps)).digest("hex"),
    deliveryChecks: lines(source.outputs).slice(0, 12),
    inputHints: lines(source.inputs).slice(0, 20).map((label, index) => ({
      key: `input-${index + 1}`,
      kind: source.modality === "text" ? "text" : index === 0 ? "asset" : "text",
      label,
      required: true,
    })),
    methodSteps,
    modality: source.modality,
    version: 1,
  };
  return normalizedSkillSchema.parse(normalized) as NormalizedSkill;
}
