import { z } from "zod";

export const billingListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
  page: z.coerce.number().int().positive().optional(),
});

export const redeemBillingCodeSchema = z.object({
  code: z.string().trim().min(1).max(128),
  idempotencyKey: z.string().trim().min(1).max(255).optional(),
});

export type BillingListQuery = z.infer<typeof billingListQuerySchema>;
export type RedeemBillingCodeInput = z.infer<typeof redeemBillingCodeSchema>;
