import { z } from "zod";

const policy = z.object({ requiresApproval: z.boolean(), requiresPricing: z.boolean() }).strict();
const step = z.object({ id: z.string().min(1).max(80), tool: z.string().min(1).max(120), input: z.record(z.string(), z.unknown()) }).strict();
export const skillManifestV2Schema = z.object({
  schemaVersion: z.literal(2), id: z.string().min(1).max(200), version: z.number().int().positive(), name: z.string().min(1).max(120), summary: z.string().max(500), modality: z.enum(["text", "image", "video"]), intent: z.string().max(500),
  inputs: z.array(z.object({ key: z.string().min(1), kind: z.enum(["asset", "choice", "number", "text"]), required: z.boolean() }).strict()).max(20),
  outputs: z.array(z.object({ key: z.string().min(1), kind: z.string().min(1) }).strict()).max(12), allowedTools: z.array(z.string().min(1).max(120)).max(24), steps: z.array(step).min(1).max(24), approvalPolicy: policy, pricingPolicy: z.object({ requiresPricing: z.boolean() }).strict(), retryPolicy: z.object({ maxAttempts: z.number().int().min(1).max(3) }).strict(), deliveryChecks: z.array(z.string().min(1).max(300)).max(12), uiSchema: z.record(z.string(), z.unknown()).optional(), graphTemplate: z.record(z.string(), z.unknown()).optional(),
}).strict().superRefine((value, ctx) => { const serialized = JSON.stringify(value); if (/provider|credential|api[_-]?key|authorization|signed[_-]?url|data:|blob:/i.test(serialized)) ctx.addIssue({ code: "custom", message: "Provider and credential fields are not allowed." }); if (value.steps.some((item) => !value.allowedTools.includes(item.tool))) ctx.addIssue({ code: "custom", path: ["steps"], message: "Step tool is not allowlisted." }); });
export type SkillManifestV2 = z.infer<typeof skillManifestV2Schema>;

export function validateSkillManifestForPublish(manifest: SkillManifestV2, input: { hasPassingFixture: boolean; graphTemplateValid: boolean }): { publishable: true } | { publishable: false; reasons: string[] } {
  const reasons: string[] = [];
  if (!manifest.deliveryChecks.length) reasons.push("delivery_checks_required");
  if (!manifest.allowedTools.length || manifest.steps.some((step) => !manifest.allowedTools.includes(step.tool))) reasons.push("allowlisted_tools_required");
  if (!manifest.approvalPolicy || !manifest.pricingPolicy || !manifest.retryPolicy) reasons.push("policies_required");
  if (!input.hasPassingFixture) reasons.push("passing_fixture_required");
  if (!input.graphTemplateValid) reasons.push("valid_graph_template_required");
  return reasons.length ? { publishable: false, reasons } : { publishable: true };
}

export function projectSkillV1ToV2(input: { id: string; version: number; name: string; summary: string; modality: "text" | "image" | "video"; normalized: { inputHints: SkillManifestV2["inputs"]; methodSteps: Array<{ id: string; action: string; instruction: string }>; deliveryChecks: string[] } }): SkillManifestV2 & { available: boolean } {
  const allowedTools = input.normalized.methodSteps.map((step) => `canvas.${step.action}`);
  const manifest = skillManifestV2Schema.parse({ schemaVersion: 2, id: input.id, version: input.version, name: input.name, summary: input.summary, modality: input.modality, intent: input.summary, inputs: input.normalized.inputHints, outputs: [{ key: "result", kind: input.modality }], allowedTools, steps: input.normalized.methodSteps.map((step) => ({ id: step.id, tool: `canvas.${step.action}`, input: { instruction: step.instruction } })), approvalPolicy: { requiresApproval: true, requiresPricing: input.modality !== "text" }, pricingPolicy: { requiresPricing: input.modality !== "text" }, retryPolicy: { maxAttempts: 2 }, deliveryChecks: input.normalized.deliveryChecks });
  return { ...manifest, available: manifest.deliveryChecks.length > 0 };
}
