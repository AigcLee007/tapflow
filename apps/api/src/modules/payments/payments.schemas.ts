import { z } from "zod";

export const createPaymentCheckoutSchema = z.object({
  planKey: z.string().trim().min(1).max(64),
  idempotencyKey: z.string().trim().min(1).max(255),
}).strict();

export const paymentParamsSchema = z.object({ paymentId: z.string().uuid() });
export const adminPlanParamsSchema = z.object({ planId: z.string().uuid() });

const positiveCredits = z.number().positive().finite();
const planFields = {
  active: z.boolean(),
  amountCents: z.number().int().positive(),
  credits: positiveCredits,
  name: z.string().trim().min(1).max(120),
  sortOrder: z.number().int().min(0).max(10_000),
  validityDays: z.number().int().positive().max(3_650),
};

export const adminCreateRechargePlanSchema = z.object({
  ...planFields,
  key: z.string().trim().regex(/^[a-z0-9_]+$/).min(3).max(64),
  reason: z.string().trim().min(1).max(500),
}).strict();

export const adminUpdateRechargePlanSchema = z.object({
  ...planFields,
  reason: z.string().trim().min(1).max(500),
}).strict();

export const adminPaymentListSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  status: z.enum(["pending", "checkout_created", "paid", "create_failed", "cancelled", "refund_pending", "refunded", "refund_failed"]).optional(),
}).strict();

export const adminRefundPaymentSchema = z.object({
  reason: z.string().trim().min(1).max(80),
}).strict();

export type CreatePaymentCheckoutInput = z.infer<typeof createPaymentCheckoutSchema>;
