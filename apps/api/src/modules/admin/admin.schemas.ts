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

export const adminAdjustCreditsSchema = z.object({
  credits: z.coerce.number().int().positive().max(1_000_000_000),
  direction: z.enum(["add", "subtract"]),
  idempotencyKey: z.string().trim().min(1).max(255).optional(),
  reason: z.string().trim().min(1).max(500),
  tenantId: z.string().uuid(),
});

export const adminUpdateUserStatusSchema = z.object({
  status: z.enum(["active", "disabled"]),
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

export const adminRedeemCodesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  status: z.string().trim().min(1).max(64).optional(),
});

export const adminRedeemCodeParamsSchema = z.object({
  codeId: z.string().uuid(),
});

export const adminResetPasswordSchema = z.object({
  password: z.string().min(8).max(256).optional(),
});

export const adminUpdateUserRoleSchema = z.object({
  roleKey: z.enum(["system_admin", "tenant_admin", "flow_developer"]),
  tenantId: z.string().uuid(),
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

export const adminAnnouncementsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
});

export const adminAnnouncementParamsSchema = z.object({
  announcementId: z.string().uuid(),
});

export const adminCreateAnnouncementSchema = z.object({
  audience: z.enum(["all", "creator", "admin"]).default("all"),
  body: z.string().trim().min(1).max(10_000),
  endsAt: z.string().datetime().nullable().optional(),
  imageUrl: z.string().trim().url().nullable().optional(),
  linkUrl: z.string().trim().url().nullable().optional(),
  pinned: z.coerce.boolean().default(false),
  startsAt: z.string().datetime().nullable().optional(),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
  title: z.string().trim().min(1).max(200),
});

export const adminUpdateAnnouncementSchema = adminCreateAnnouncementSchema.partial();

export const adminAiRouteStatsQuerySchema = z.object({
  windowMinutes: z.coerce.number().int().min(1).max(24 * 60).default(30),
});

export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>;
export type AdminUserParams = z.infer<typeof adminUserParamsSchema>;
export type AdminGrantCreditsInput = z.infer<typeof adminGrantCreditsSchema>;
export type AdminAdjustCreditsInput = z.infer<typeof adminAdjustCreditsSchema>;
export type AdminUpdateUserStatusInput = z.infer<typeof adminUpdateUserStatusSchema>;
export type AdminUpdateMembershipTierInput = z.infer<typeof adminUpdateMembershipTierSchema>;
export type AdminCreateRedeemCodeInput = z.infer<typeof adminCreateRedeemCodeSchema>;
export type AdminRedeemCodesQuery = z.infer<typeof adminRedeemCodesQuerySchema>;
export type AdminRedeemCodeParams = z.infer<typeof adminRedeemCodeParamsSchema>;
export type AdminResetPasswordInput = z.infer<typeof adminResetPasswordSchema>;
export type AdminUpdateUserRoleInput = z.infer<typeof adminUpdateUserRoleSchema>;
export type AdminWorkflowRunsQuery = z.infer<typeof adminWorkflowRunsQuerySchema>;
export type AdminWorkflowRunParams = z.infer<typeof adminWorkflowRunParamsSchema>;
export type AdminAnnouncementsQuery = z.infer<typeof adminAnnouncementsQuerySchema>;
export type AdminAnnouncementParams = z.infer<typeof adminAnnouncementParamsSchema>;
export type AdminCreateAnnouncementInput = z.infer<typeof adminCreateAnnouncementSchema>;
export type AdminUpdateAnnouncementInput = z.infer<typeof adminUpdateAnnouncementSchema>;
export type AdminAiRouteStatsQuery = z.infer<typeof adminAiRouteStatsQuerySchema>;
