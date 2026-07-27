import { z } from "zod";

export const registerSchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().email(),
  password: z.string().min(8).max(256),
  tenantName: z.string().trim().min(1).max(120).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(256),
  tenantId: z.string().uuid().optional(),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(32).max(512),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(32).max(512).optional(),
});

export const verifyEmailSchema = z.object({
  challengeToken: z.string().min(32).max(512),
  code: z.string().regex(/^\d{6}$/),
});

export const resendEmailSchema = z.object({
  challengeToken: z.string().min(32).max(512),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type LogoutInput = z.infer<typeof logoutSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ResendEmailInput = z.infer<typeof resendEmailSchema>;
