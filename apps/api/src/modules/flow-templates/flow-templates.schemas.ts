import { z } from 'zod';

export const flowTemplateListQuerySchema = z.object({
  category: z.string().trim().min(1).optional(),
  query: z.string().trim().min(1).optional(),
});

export const flowTemplateIdParamsSchema = z.object({
  templateId: z.string().uuid(),
});

export const instantiateFlowTemplateSchema = z.object({
  projectId: z.string().uuid().optional(),
  idempotencyKey: z.string().uuid(),
  inputValues: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
});

export const flowTemplateLifecycleStatusSchema = z.enum(['draft', 'testing', 'published', 'archived']);

const templateInputTargetSchema = z.object({
  nodeId: z.string().trim().min(1),
  fieldPath: z.string().trim().regex(/^data\.[A-Za-z0-9_.-]+$/, 'fieldPath must target node data'),
});

const templateInputBaseSchema = z.object({
  id: z.string().trim().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/),
  label: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  required: z.boolean().default(false),
  target: templateInputTargetSchema,
});

export const flowTemplateInputDefinitionSchema = z.discriminatedUnion('type', [
  templateInputBaseSchema.extend({ type: z.literal('text'), defaultValue: z.string().optional() }),
  templateInputBaseSchema.extend({ type: z.literal('asset'), defaultValue: z.string().uuid().optional() }),
  templateInputBaseSchema
    .extend({
      type: z.literal('enum'),
      options: z.array(z.string().trim().min(1).max(120)).min(1).max(100),
      defaultValue: z.string().optional(),
    })
    .superRefine((value, ctx) => {
      if (value.defaultValue !== undefined && !value.options.includes(value.defaultValue)) {
        ctx.addIssue({ code: 'custom', path: ['defaultValue'], message: 'defaultValue must be one of options' });
      }
      if (new Set(value.options).size !== value.options.length) {
        ctx.addIssue({ code: 'custom', path: ['options'], message: 'options must be unique' });
      }
    }),
  templateInputBaseSchema
    .extend({
      type: z.literal('number'),
      minimum: z.number().finite().optional(),
      maximum: z.number().finite().optional(),
      step: z.number().finite().positive().optional(),
      defaultValue: z.number().finite().optional(),
    })
    .superRefine((value, ctx) => {
      if (value.minimum !== undefined && value.maximum !== undefined && value.minimum > value.maximum) {
        ctx.addIssue({ code: 'custom', path: ['maximum'], message: 'maximum must be greater than or equal to minimum' });
      }
      if (value.defaultValue !== undefined && value.minimum !== undefined && value.defaultValue < value.minimum) {
        ctx.addIssue({ code: 'custom', path: ['defaultValue'], message: 'defaultValue is below minimum' });
      }
      if (value.defaultValue !== undefined && value.maximum !== undefined && value.defaultValue > value.maximum) {
        ctx.addIssue({ code: 'custom', path: ['defaultValue'], message: 'defaultValue is above maximum' });
      }
    }),
]);

export const saveFlowTemplateDraftSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().max(2000).default(''),
    category: z.string().trim().min(1).max(80).default('general'),
    coverAssetId: z.string().uuid().nullable().optional(),
    graph: z.record(z.string(), z.unknown()),
    inputSchema: z.array(flowTemplateInputDefinitionSchema).max(100).default([]),
    estimatedCredits: z.number().finite().nonnegative().nullable().optional(),
  })
  .superRefine((value, ctx) => {
    const ids = value.inputSchema.map((item) => item.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: 'custom', path: ['inputSchema'], message: 'input IDs must be unique' });
    }
  });

export const flowTemplateAdminListQuerySchema = flowTemplateListQuerySchema.extend({
  status: flowTemplateLifecycleStatusSchema.optional(),
});

export type FlowTemplateListQuery = z.infer<typeof flowTemplateListQuerySchema>;
export type FlowTemplateIdParams = z.infer<typeof flowTemplateIdParamsSchema>;
export type InstantiateFlowTemplateInput = z.infer<typeof instantiateFlowTemplateSchema>;
export type FlowTemplateLifecycleStatus = z.infer<typeof flowTemplateLifecycleStatusSchema>;
export type FlowTemplateInputDefinition = z.infer<typeof flowTemplateInputDefinitionSchema>;
export type SaveFlowTemplateDraftInput = z.infer<typeof saveFlowTemplateDraftSchema>;
export type FlowTemplateAdminListQuery = z.infer<typeof flowTemplateAdminListQuerySchema>;
