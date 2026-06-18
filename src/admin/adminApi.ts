import { apiGet, apiPatch, apiPost } from "../services/v2HttpClient";

export type MembershipTier = "standard" | "silver" | "gold" | "platinum";

export type AdminMembership = {
  availableCredits: number;
  balanceCredits: number;
  membershipTier?: MembershipTier;
  membershipTierExpiresAt?: string | null;
  membershipStatus: string;
  reservedCredits: number;
  roleKey: string;
  tenantId: string;
  tenantName: string;
  tenantStatus: string;
};

export type AdminUser = {
  createdAt: string;
  displayName: string | null;
  email: string;
  emailVerifiedAt: string | null;
  id: string;
  memberships: AdminMembership[];
  status: string;
};

export type AdminUsersResponse = {
  items: AdminUser[];
  query: string;
};

export type AdminGrantCreditsResponse = {
  account: {
    availableCredits: number;
    balanceCredits: number;
    reservedCredits: number;
    tenantId: string;
  };
  ledgerEntry: {
    amountCents: number;
    createdAt: string;
    description: string | null;
    entryType: string;
    id: string;
    idempotencyKey: string | null;
  };
};

export type AdminUpdateMembershipTierResponse = {
  membershipTier: MembershipTier;
  membershipTierExpiresAt: string | null;
  targetUserId: string;
  tenantId: string;
};

export type AdminRedeemCodeResponse = {
  code: string;
  credits: number;
  expiresAt: string | null;
  id: string;
  maxRedemptions: number;
  tenantId: string | null;
};

export type AdminResetPasswordResponse = {
  passwordShownOnce: string;
  user: {
    displayName: string | null;
    email: string;
    emailVerifiedAt: string | null;
    id: string;
    status: string;
  };
};

export type AdminWorkflowRun = {
  createdAt: string;
  createdBy: string | null;
  errorJson: Record<string, unknown> | null;
  errorSummary: string | null;
  failedNodeRunCount: number;
  finishedAt: string | null;
  flowId: string;
  id: string;
  nodeRunCount: number;
  runMode: string;
  startedAt: string | null;
  status: string;
  targetNodeId: string | null;
  tenantId: string;
  updatedAt: string;
};

export type AdminWorkflowRunDetail = {
  nodeRuns: Array<{
    errorJson: Record<string, unknown> | null;
    finishedAt: string | null;
    id: string;
    nodeId: string;
    nodeType: string;
    outputSummary: string | null;
    startedAt: string | null;
    status: string;
    workflowRunId: string;
  }>;
  workflowRun: AdminWorkflowRun;
};

export function searchAdminUsers(query: string, limit = 20): Promise<AdminUsersResponse> {
  const params = new URLSearchParams();
  if (query.trim()) {
    params.set("query", query.trim());
  }
  params.set("limit", String(limit));
  return apiGet<AdminUsersResponse>(`/admin/users?${params.toString()}`);
}

export function getAdminUser(userId: string): Promise<AdminUser> {
  return apiGet<AdminUser>(`/admin/users/${userId}`);
}

export function grantAdminCredits(input: {
  credits: number;
  expiresAt?: string;
  reason: string;
  targetUserId: string;
  tenantId: string;
  validityDays?: number;
  validityMode?: "months" | "days" | "lifetime" | "custom";
  validityMonths?: number;
}): Promise<AdminGrantCreditsResponse> {
  return apiPost<AdminGrantCreditsResponse>(`/admin/users/${input.targetUserId}/grant-credits`, {
    credits: input.credits,
    expiresAt: input.expiresAt,
    reason: input.reason,
    tenantId: input.tenantId,
    validityDays: input.validityDays,
    validityMode: input.validityMode,
    validityMonths: input.validityMonths,
  });
}

export function updateAdminMembershipTier(input: {
  expiresAt?: string;
  targetUserId: string;
  tenantId?: string;
  tier: MembershipTier;
}): Promise<AdminUpdateMembershipTierResponse> {
  return apiPatch<AdminUpdateMembershipTierResponse>(`/admin/users/${input.targetUserId}/membership-tier`, {
    expiresAt: input.expiresAt,
    tenantId: input.tenantId,
    tier: input.tier,
  });
}

export function createAdminRedeemCode(input: {
  code?: string;
  credits: number;
  expiresAt?: string;
  maxRedemptions: number;
  reason?: string;
  tenantId?: string;
}): Promise<AdminRedeemCodeResponse> {
  return apiPost<AdminRedeemCodeResponse>("/admin/redeem-codes", input);
}

export function resetAdminPassword(input: {
  password?: string;
  userId: string;
}): Promise<AdminResetPasswordResponse> {
  return apiPost<AdminResetPasswordResponse>(`/admin/users/${input.userId}/reset-password`, {
    password: input.password,
  });
}

export function listAdminWorkflowRuns(input?: {
  limit?: number;
  status?: string;
  tenantId?: string;
  userId?: string;
}): Promise<{ items: AdminWorkflowRun[] }> {
  const params = new URLSearchParams();
  if (input?.limit) {
    params.set("limit", String(input.limit));
  }
  if (input?.status?.trim()) {
    params.set("status", input.status.trim());
  }
  if (input?.tenantId?.trim()) {
    params.set("tenantId", input.tenantId.trim());
  }
  if (input?.userId?.trim()) {
    params.set("userId", input.userId.trim());
  }
  return apiGet<{ items: AdminWorkflowRun[] }>(
    `/admin/workflow-runs${params.size ? `?${params.toString()}` : ""}`,
  );
}

export function getAdminWorkflowRun(runId: string): Promise<AdminWorkflowRunDetail> {
  return apiGet<AdminWorkflowRunDetail>(`/admin/workflow-runs/${runId}`);
}
