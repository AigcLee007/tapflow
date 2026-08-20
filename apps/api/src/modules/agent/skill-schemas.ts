import { z } from "zod";

export const skillSourceSchema = z.object({
  askWhen: z.string().trim().min(1).max(4000),
  category: z.string().trim().min(1).max(80).optional(),
  inputs: z.string().trim().min(1).max(4000),
  method: z.string().trim().min(1).max(8000),
  modality: z.enum(["text", "image", "video"]),
  name: z.string().trim().min(1).max(120),
  outputs: z.string().trim().min(1).max(4000),
  summary: z.string().trim().min(1).max(500),
  triggers: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
  usageScenarios: z.string().trim().min(1).max(4000),
}).strict();

export const normalizedSkillSchema = z.object({
  approvalRules: z.object({
    beforeBatch: z.boolean(),
    beforeCreditRun: z.literal(true),
    beforeDelivery: z.boolean(),
    beforeOverwrite: z.boolean(),
  }).strict(),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  deliveryChecks: z.array(z.string().trim().min(1).max(300)).max(12),
  inputHints: z.array(z.object({
    key: z.string().trim().min(1).max(80),
    kind: z.enum(["asset", "choice", "number", "text"]),
    label: z.string().trim().min(1).max(200),
    required: z.boolean(),
  }).strict()).max(20),
  methodSteps: z.array(z.object({
    action: z.enum(["analyze", "canvas", "deliver", "image", "review", "text", "video"]),
    id: z.string().trim().min(1).max(80),
    instruction: z.string().trim().min(1).max(1000),
  }).strict()).min(1).max(12),
  modality: z.enum(["text", "image", "video"]),
  version: z.literal(1),
}).strict();

export type SkillSourceInput = z.infer<typeof skillSourceSchema>;
