import { apiDelete, apiGet, apiPatch, apiPost } from "../services/v2HttpClient";

export type MembershipTier = "standard" | "silver" | "gold" | "platinum";

export type AdminMembership = {
  latestUsageAt?: string | null;
  membershipTier?: MembershipTier;
  membershipTierExpiresAt?: string | null;
  membershipStatus: string;
  roleKey: string;
  tenantId: string;
  tenantName: string;
  tenantStatus: string;
  usageAudit?: {
    latestUsageAt: string | null;
    settledCredits: number;
    settledEvents: number;
  };
  usedCredits?: number;
};

export type AdminUserWallet = {
  activeCreditGrantCount: number;
  availableCredits: number;
  balanceCredits: number;
  creditGrantCount: number;
  creditLedger: Array<{
    amountCredits: number;
    createdAt: string;
    description: string | null;
    direction: "credit" | "debit";
    entryType: string;
    id: string;
  }>;
  expiringSoonCredits: number;
  nearestExpiryAt: string | null;
  reservedCredits: number;
  totalGrantedCredits: number;
  walletId: string;
};

export type AdminWalletSummary = Pick<
  AdminUserWallet,
  "availableCredits" | "balanceCredits" | "expiringSoonCredits" | "nearestExpiryAt" | "reservedCredits" | "walletId"
>;

export type AdminUser = {
  createdAt: string;
  displayName: string | null;
  email: string;
  emailVerifiedAt: string | null;
  id: string;
  lastLoginAt?: string | null;
  memberships: AdminMembership[];
  status: string;
  wallet: AdminUserWallet;
};

export type AdminUsersResponse = {
  items: AdminUser[];
  query: string;
};

export type AdminGrantCreditsResponse = {
  wallet: AdminWalletSummary;
  ledgerEntry: {
    amountCredits: number;
    createdAt: string;
    description: string | null;
    entryType: string;
    id: string;
    idempotencyKey: string;
  };
};

export type AdminAdjustCreditsResponse = AdminGrantCreditsResponse;

export type AdminUpdateUserStatusResponse = {
  id: string;
  status: string;
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

export type AdminUpdateUserRoleResponse = {
  roleKey: string;
  targetUserId: string;
  tenantId: string;
};

export type AdminRedeemCode = {
  code: string | null;
  createdAt: string;
  createdByEmail: string | null;
  createdByName: string | null;
  credits: number;
  expiresAt: string | null;
  id: string;
  maxRedemptions: number;
  reason: string | null;
  redeemedCount: number;
  status: string;
  tenantId: string | null;
  tenantName: string | null;
};

export type AdminRedeemCodeRedemption = {
  billingLedgerId: string | null;
  createdAt: string;
  id: string;
  userDisplayName: string | null;
  userEmail: string | null;
  userId: string | null;
};

export type AnnouncementStatus = "draft" | "published" | "archived";
export type AnnouncementAudience = "all" | "creator" | "admin";

export type AdminAnnouncement = {
  audience: AnnouncementAudience;
  body: string;
  createdAt: string;
  createdBy: string | null;
  createdByEmail: string | null;
  endsAt: string | null;
  id: string;
  imageUrl: string | null;
  isRead: boolean;
  linkUrl: string | null;
  pinned: boolean;
  publishedAt: string | null;
  startsAt: string | null;
  status: AnnouncementStatus;
  tenantId: string;
  title: string;
  updatedAt: string;
};

export type AdminAiRouteStats = {
  routes: Array<{
    averageLatencyMs: number | null;
    failedCalls: number;
    lastError: Record<string, unknown> | null;
    lastFailureAt: string | null;
    lastSuccessAt: string | null;
    modelDisplayName: string | null;
    providerName: string | null;
    routeId: string | null;
    routeKey: string | null;
    routeLabel: string | null;
    successRate: number;
    successfulCalls: number;
    totalCalls: number;
  }>;
  summary: {
    averageLatencyMs: number | null;
    failedCalls: number;
    successRate: number;
    successfulCalls: number;
    totalCalls: number;
    windowMinutes: number;
  };
};

export type AdminRechargePlan = { id: string; key: string; name: string; amountCents: number; credits: number; currency: string; validityDays: number; sortOrder: number; active: boolean; createdAt: string; updatedAt: string };
export type AdminWalletPayment = { id: string; userEmail: string | null; planKey: string; amountCents: number; credits: number; status: string; merchantOrderId: string; createdAt: string; paidAt: string | null; expiresAtSnapshot: string | null; eligible: boolean };

export const listAdminRechargePlans = () => apiGet<AdminRechargePlan[]>("/admin/billing/recharge-plans");
export const createAdminRechargePlan = (input: Omit<AdminRechargePlan, "id" | "currency" | "createdAt" | "updatedAt"> & { reason: string }) => apiPost<AdminRechargePlan>("/admin/billing/recharge-plans", input);
export const updateAdminRechargePlan = (planId: string, input: Omit<AdminRechargePlan, "id" | "key" | "currency" | "createdAt" | "updatedAt"> & { reason: string }) => apiPatch<AdminRechargePlan>(`/admin/billing/recharge-plans/${encodeURIComponent(planId)}`, input);
export const listAdminWalletPayments = () => apiGet<AdminWalletPayment[]>("/admin/billing/payments");
export const queryAdminWalletPayment = (paymentId: string) => apiPost<AdminWalletPayment>(`/admin/billing/payments/${encodeURIComponent(paymentId)}/query`, {});
export const refundAdminWalletPayment = (paymentId: string, reason: string) => apiPost<AdminWalletPayment>(`/admin/billing/payments/${encodeURIComponent(paymentId)}/refund`, { reason });

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

export function adjustAdminCredits(input: {
  credits: number;
  direction: "add" | "subtract";
  reason: string;
  targetUserId: string;
  tenantId: string;
}): Promise<AdminAdjustCreditsResponse> {
  return apiPost<AdminAdjustCreditsResponse>(`/admin/users/${input.targetUserId}/adjust-credits`, {
    credits: input.credits,
    direction: input.direction,
    reason: input.reason,
    tenantId: input.tenantId,
  });
}

export function updateAdminUserStatus(input: {
  status: "active" | "disabled";
  targetUserId: string;
}): Promise<AdminUpdateUserStatusResponse> {
  return apiPatch<AdminUpdateUserStatusResponse>(`/admin/users/${input.targetUserId}/status`, {
    status: input.status,
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

export function updateAdminUserRole(input: {
  roleKey: "system_admin" | "tenant_admin" | "flow_developer";
  targetUserId: string;
  tenantId: string;
}): Promise<AdminUpdateUserRoleResponse> {
  return apiPatch<AdminUpdateUserRoleResponse>(`/admin/users/${input.targetUserId}/role`, {
    roleKey: input.roleKey,
    tenantId: input.tenantId,
  });
}

export function listAdminRedeemCodes(input?: {
  limit?: number;
  status?: string;
}): Promise<{ items: AdminRedeemCode[] }> {
  const params = new URLSearchParams();
  if (input?.limit) params.set("limit", String(input.limit));
  if (input?.status?.trim()) params.set("status", input.status.trim());
  return apiGet<{ items: AdminRedeemCode[] }>(
    `/admin/redeem-codes${params.size ? `?${params.toString()}` : ""}`,
  );
}

export function listAdminRedeemCodeRedemptions(codeId: string): Promise<{
  items: AdminRedeemCodeRedemption[];
}> {
  return apiGet<{ items: AdminRedeemCodeRedemption[] }>(
    `/admin/redeem-codes/${encodeURIComponent(codeId)}/redemptions`,
  );
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

export function deleteAdminRedeemCode(codeId: string): Promise<void> {
  return apiDelete<void>(`/admin/redeem-codes/${encodeURIComponent(codeId)}`);
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

export function listAdminAnnouncements(input?: {
  limit?: number;
  status?: AnnouncementStatus;
}): Promise<{ items: AdminAnnouncement[] }> {
  const params = new URLSearchParams();
  if (input?.limit) params.set("limit", String(input.limit));
  if (input?.status) params.set("status", input.status);
  return apiGet<{ items: AdminAnnouncement[] }>(
    `/admin/announcements${params.size ? `?${params.toString()}` : ""}`,
  );
}

export function listPublishedAnnouncements(input?: {
  limit?: number;
}): Promise<{ items: AdminAnnouncement[] }> {
  const params = new URLSearchParams();
  if (input?.limit) params.set("limit", String(input.limit));
  return apiGet<{ items: AdminAnnouncement[] }>(
    `/announcements${params.size ? `?${params.toString()}` : ""}`,
  );
}

export function markAnnouncementRead(announcementId: string): Promise<{
  announcementId: string;
  readAt: string;
}> {
  return apiPost<{ announcementId: string; readAt: string }>(
    `/announcements/${encodeURIComponent(announcementId)}/read`,
  );
}

export function createAdminAnnouncement(input: {
  audience: AnnouncementAudience;
  body: string;
  endsAt?: string | null;
  imageUrl?: string | null;
  linkUrl?: string | null;
  pinned?: boolean;
  startsAt?: string | null;
  status: AnnouncementStatus;
  title: string;
}): Promise<AdminAnnouncement> {
  return apiPost<AdminAnnouncement>("/admin/announcements", input);
}

export function updateAdminAnnouncement(
  announcementId: string,
  input: Partial<{
    audience: AnnouncementAudience;
    body: string;
    endsAt: string | null;
    imageUrl: string | null;
    linkUrl: string | null;
    pinned: boolean;
    startsAt: string | null;
    status: AnnouncementStatus;
    title: string;
  }>,
): Promise<AdminAnnouncement> {
  return apiPatch<AdminAnnouncement>(`/admin/announcements/${encodeURIComponent(announcementId)}`, input);
}

export function deleteAdminAnnouncement(announcementId: string): Promise<void> {
  return apiDelete<void>(`/admin/announcements/${encodeURIComponent(announcementId)}`);
}

export function getAdminAiRouteStats(input?: {
  windowMinutes?: number;
}): Promise<AdminAiRouteStats> {
  const params = new URLSearchParams();
  if (input?.windowMinutes) params.set("windowMinutes", String(input.windowMinutes));
  return apiGet<AdminAiRouteStats>(
    `/admin/ai/route-stats${params.size ? `?${params.toString()}` : ""}`,
  );
}
