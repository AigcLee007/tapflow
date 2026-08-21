import type { SkillModality } from "./skill-types.js";
import type { SkillRunView, SkillStepView } from "./agent-skill-run.service.js";

export type SkillDeliveryIssue = { code: string; message: string; stepId?: string };

export type SkillDeliveryResult = {
  status: "succeeded" | "partial_success" | "reviewing";
  issues: SkillDeliveryIssue[];
  completedArtifacts: number;
};

export type SkillDeliveryRequirements = {
  aspectRatio?: string;
  durationMs?: number;
  requiredArtifactCount?: number;
  textMinLength?: number;
};

function hasText(step: SkillStepView): boolean {
  const text = step.output.text;
  return typeof text === "string" && text.trim().length > 0;
}

function hasAsset(step: SkillStepView): boolean {
  return typeof step.assetId === "string" && step.assetId.trim().length > 0;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readAspectRatio(output: Record<string, unknown>): string | null {
  if (typeof output.aspectRatio === "string" && output.aspectRatio.trim()) return output.aspectRatio.trim();
  const width = readNumber(output.width);
  const height = readNumber(output.height);
  if (!width || !height || width <= 0 || height <= 0) return null;
  const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;
  const divisor = gcd(Math.round(width), Math.round(height));
  return `${Math.round(width) / divisor}:${Math.round(height) / divisor}`;
}

export function checkSkillDelivery(input: {
  run: Pick<SkillRunView, "steps">;
  modality: SkillModality;
  requiredArtifactCount?: number;
  requirements?: SkillDeliveryRequirements;
}): SkillDeliveryResult {
  const issues: SkillDeliveryIssue[] = [];
  const requirements = input.requirements ?? {};
  const artifactSteps = input.run.steps.filter((step) => ["text", "image", "video"].includes(step.action));
  let completedArtifacts = 0;
  for (const step of artifactSteps) {
    if (step.status !== "succeeded") continue;
    const output = step.output ?? {};
    const text = typeof output.text === "string" ? output.text.trim() : "";
    const valid = input.modality === "text" ? hasText(step) : hasAsset(step);
    if (!valid) {
      issues.push({ code: "SKILL_DELIVERY_ARTIFACT_MISSING", message: `Step ${step.stepIndex + 1} completed without a valid ${input.modality} artifact.`, stepId: step.id });
      continue;
    }
    let deliveryValid = true;
    if (input.modality === "text" && requirements.textMinLength && text.length < requirements.textMinLength) {
      issues.push({ code: "SKILL_DELIVERY_TEXT_TOO_SHORT", message: `Step ${step.stepIndex + 1} text is shorter than the required minimum.`, stepId: step.id });
      deliveryValid = false;
    }
    if (input.modality !== "text") {
      const assetKind = typeof output.assetKind === "string"
        ? output.assetKind
        : typeof output.kind === "string" ? output.kind : null;
      if (assetKind && assetKind !== input.modality) {
        issues.push({ code: "SKILL_DELIVERY_MODALITY_MISMATCH", message: `Step ${step.stepIndex + 1} produced ${assetKind}, expected ${input.modality}.`, stepId: step.id });
        deliveryValid = false;
      }
      if (requirements.durationMs !== undefined) {
        const durationMs = readNumber(output.durationMs);
        if (durationMs === null || Math.abs(durationMs - requirements.durationMs) > Math.max(500, requirements.durationMs * 0.1)) {
          issues.push({ code: "SKILL_DELIVERY_DURATION_MISMATCH", message: `Step ${step.stepIndex + 1} duration does not meet the requested delivery.`, stepId: step.id });
          deliveryValid = false;
        }
      }
      if (requirements.aspectRatio) {
        const actual = readAspectRatio(output);
        if (actual !== requirements.aspectRatio) {
          issues.push({ code: "SKILL_DELIVERY_ASPECT_MISMATCH", message: `Step ${step.stepIndex + 1} aspect ratio does not match the requested delivery.`, stepId: step.id });
          deliveryValid = false;
        }
      }
    }
    if (deliveryValid) completedArtifacts += 1;
  }
  const required = Math.max(1, requirements.requiredArtifactCount ?? input.requiredArtifactCount ?? 1);
  if (completedArtifacts < required) issues.push({ code: "SKILL_DELIVERY_COUNT_MISMATCH", message: `Expected ${required} artifact(s), received ${completedArtifacts}.` });
  const failed = input.run.steps.filter((step) => step.status === "failed").length;
  const hasResult = artifactSteps.some((step) => step.status === "succeeded");
  const status = issues.length > 0 || failed > 0 ? (hasResult ? "reviewing" : "partial_success") : "succeeded";
  return { completedArtifacts, issues, status };
}
