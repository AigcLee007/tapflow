import { z } from "zod";

export const adminUsersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
  query: z.string().trim().max(200).optional(),
});

export const adminUserParamsSchema = z.object({
  userId: z.string().uuid(),
});

export const adminGrantCreditsSchema = z.object({
  credits: z.coerce.number().int().positive().max(1_000_000_000),
  expiresAt: z.string().datetime().optional(),
  idempotencyKey: z.string().trim().min(1).max(255).optional(),
  reason: z.string().trim().min(1).max(500),
  tenantId: z.string().uuid(),
  validityDays: z.coerce.number().int().positive().max(3650).optional(),
  validityMode: z.enum(["months", "days", "lifetime", "custom"]).default("lifetime"),
  validityMonths: z.coerce.number().int().positive().max(120).optional(),
});

export const adminUpdateMembershipTierSchema = z.object({
  expiresAt: z.string().datetime().optional(),
  tenantId: z.string().uuid().optional(),
  tier: z.enum(["standard", "silver", "gold", "platinum"]),
});

export const adminCreateRedeemCodeSchema = z.object({
  code: z.string().trim().min(1).max(128).optional(),
  credits: z.coerce.number().int().positive().max(1_000_000_000),
  expiresAt: z.string().datetime().optional(),
  maxRedemptions: z.coerce.number().int().positive().max(1_000_000).default(1),
  reason: z.string().trim().max(500).optional(),
  tenantId: z.string().uuid().optional(),
});

export const adminResetPasswordSchema = z.object({
  password: z.string().min(8).max(256).optional(),
});

export const adminWorkflowRunsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  status: z.string().trim().min(1).max(64).optional(),
  tenantId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
});

export const adminWorkflowRunParamsSchema = z.object({
  runId: z.string().uuid(),
});

export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>;
export type AdminUserParams = z.infer<typeof adminUserParamsSchema>;
export type AdminGrantCreditsInput = z.infer<typeof adminGrantCreditsSchema>;
export type AdminUpdateMembershipTierInput = z.infer<typeof adminUpdateMembershipTierSchema>;
export type AdminCreateRedeemCodeInput = z.infer<typeof adminCreateRedeemCodeSchema>;
export type AdminResetPasswordInput = z.infer<typeof adminResetPasswordSchema>;
export type AdminWorkflowRunsQuery = z.infer<typeof adminWorkflowRunsQuerySchema>;
export type AdminWorkflowRunParams = z.infer<typeof adminWorkflowRunParamsSchema>;
