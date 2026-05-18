import { z } from "zod";

export const billingListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
  page: z.coerce.number().int().positive().optional(),
});

export const redeemBillingCodeSchema = z.object({
  code: z.string().trim().min(1).max(128),
  idempotencyKey: z.string().trim().min(1).max(255).optional(),
});

export const createPaymentCheckoutSchema = z.object({
  amountCents: z.coerce.number().int().nonnegative(),
  credits: z.coerce.number().int().nonnegative(),
  idempotencyKey: z.string().trim().min(1).max(255),
  provider: z.string().trim().min(1).max(64).default("manual"),
});

export const adminAdjustBillingSchema = z.object({
  amountCents: z.coerce.number().int().positive(),
  direction: z.enum(["credit", "debit"]),
  idempotencyKey: z.string().trim().min(1).max(255),
  note: z.string().trim().max(500).optional(),
});

export type BillingListQuery = z.infer<typeof billingListQuerySchema>;
export type RedeemBillingCodeInput = z.infer<typeof redeemBillingCodeSchema>;
export type CreatePaymentCheckoutInput = z.infer<typeof createPaymentCheckoutSchema>;
export type AdminAdjustBillingInput = z.infer<typeof adminAdjustBillingSchema>;
