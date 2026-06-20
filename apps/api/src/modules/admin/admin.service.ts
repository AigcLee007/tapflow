import { randomBytes, randomUUID } from "node:crypto";

import {
  BillingService,
  BillingServiceError,
  createPgPool,
  hashBillingRedeemCode,
  safeRecordAuditLog,
  type MembershipTier,
  type BillingLedgerView,
  withTenantTransaction,
} from "@aigc-flow/db";
import type { Pool, PoolClient } from "pg";

import type { RequestContext } from "../../http/request-context.js";
import { hashPassword } from "../auth/password.js";

type PgPool = Pool;

type AdminUserRow = {
  created_at: string;
  display_name: string | null;
  email: string;
  email_verified_at: string | null;
  id: string;
  last_login_at: string | null;
  status: string;
};

type AdminMembershipRow = {
  active_credit_grant_count: string | null;
  balance_cents: string | null;
  latest_usage_at: string | null;
  membership_tier: string | null;
  membership_tier_expires_at: string | null;
  membership_status: string;
  next_credit_expires_at: string | null;
  original_grant_credits: string | null;
  reserved_cents: string | null;
  settled_usage_events: string | null;
  role_key: string;
  tenant_id: string;
  tenant_name: string;
  tenant_status: string;
  user_id: string;
  used_credits: string | null;
};

type AdminCreditLedgerRow = {
  amount_cents: string;
  created_at: string;
  description: string | null;
  entry_type: string;
  id: string;
  tenant_id: string;
};

type AdminWorkflowRunRow = {
  created_at: string;
  created_by: string | null;
  error_json: Record<string, unknown> | null;
  failed_node_run_count: string;
  finished_at: string | null;
  flow_id: string;
  id: string;
  node_run_count: string;
  run_mode: string | null;
  started_at: string | null;
  status: string;
  target_node_id: string | null;
  tenant_id: string;
  updated_at: string;
};

type AdminNodeRunRow = {
  error_json: Record<string, unknown> | null;
  finished_at: string | null;
  id: string;
  node_id: string;
  node_type: string;
  output_json: Record<string, unknown> | null;
  started_at: string | null;
  status: string;
  workflow_run_id: string;
};

type AdminRedeemCodeRow = {
  code: string | null;
  created_at: string;
  created_by_email: string | null;
  created_by_name: string | null;
  credits: string;
  expires_at: string | null;
  id: string;
  max_redemptions: number;
  reason: string | null;
  redeemed_count: number;
  status: string;
  tenant_id: string | null;
  tenant_name: string | null;
};

type AdminRedeemCodeRedemptionRow = {
  billing_ledger_id: string | null;
  created_at: string;
  id: string;
  user_display_name: string | null;
  user_email: string | null;
  user_id: string | null;
};

type AdminAnnouncementRow = {
  audience: string;
  body: string;
  created_at: string;
  created_by: string | null;
  created_by_email: string | null;
  ends_at: string | null;
  id: string;
  image_url: string | null;
  is_read: boolean | null;
  link_url: string | null;
  pinned: boolean;
  published_at: string | null;
  starts_at: string | null;
  status: string;
  tenant_id: string;
  title: string;
  updated_at: string;
};

type AdminAiRouteStatsRow = {
  average_latency_ms: string | null;
  failed_calls: string;
  last_error: Record<string, unknown> | null;
  last_failure_at: string | null;
  last_success_at: string | null;
  model_display_name: string | null;
  provider_name: string | null;
  route_id: string | null;
  route_key: string | null;
  route_label: string | null;
  successful_calls: string;
  total_calls: string;
};

export type AdminContext = RequestContext;

export type AdminUserMembershipView = {
  activeCreditGrantCount: number;
  availableCredits: number;
  balanceCredits: number;
  creditGrantCount: number;
  latestUsageAt: string | null;
  membershipTier: MembershipTier;
  membershipTierExpiresAt: string | null;
  membershipStatus: string;
  nextCreditExpiresAt: string | null;
  reservedCredits: number;
  roleKey: string;
  tenantId: string;
  tenantName: string;
  tenantStatus: string;
  totalCreditGrants: number;
  creditLedger: Array<{
    amountCredits: number;
    createdAt: string;
    description: string | null;
    direction: "credit" | "debit";
    entryType: string;
    id: string;
  }>;
  usageAudit: {
    latestUsageAt: string | null;
    settledCredits: number;
    settledEvents: number;
  };
  usedCredits: number;
};

export type AdminUserView = {
  createdAt: string;
  displayName: string | null;
  email: string;
  emailVerifiedAt: string | null;
  id: string;
  lastLoginAt: string | null;
  memberships: AdminUserMembershipView[];
  status: string;
};

export type AdminWorkflowRunView = {
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

export type AdminWorkflowRunDetailView = {
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
  workflowRun: AdminWorkflowRunView;
};

export type AdminRedeemCodeView = {
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

export type AdminRedeemCodeRedemptionView = {
  billingLedgerId: string | null;
  createdAt: string;
  id: string;
  userDisplayName: string | null;
  userEmail: string | null;
  userId: string | null;
};

export type AdminAnnouncementView = {
  audience: "all" | "creator" | "admin";
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
  status: "draft" | "published" | "archived";
  tenantId: string;
  title: string;
  updatedAt: string;
};

export type AdminAiRouteStatsView = {
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

export class AdminApiError extends Error {
  readonly code: string;
  readonly details?: unknown;
  readonly statusCode: number;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = "AdminApiError";
    this.statusCode = statusCode;
  }
}

function requireTenantContext(context: AdminContext): { tenantId: string; userId: string | null } {
  if (!context.tenantId) {
    throw new AdminApiError(400, "TENANT_REQUIRED", "当前请求缺少工作区上下文");
  }

  return {
    tenantId: context.tenantId,
    userId: context.userId,
  };
}

function parseNumericString(value: string | null | undefined): number {
  const parsed = Number(value ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeMembershipTier(value: string | null | undefined): MembershipTier {
  return value === "silver" || value === "gold" || value === "platinum" ? value : "standard";
}

async function setAdminTenantContext(
  client: PoolClient,
  context: { tenantId: string; userId: string | null },
): Promise<void> {
  await client.query("SELECT set_config('app.tenant_id', $1, true)", [context.tenantId]);
  await client.query("SELECT set_config('app.user_id', $1, true)", [context.userId ?? ""]);
  await client.query("SELECT set_config('app.is_system_admin', 'true', true)");
}

function addDays(base: Date, days: number): Date {
  const next = new Date(base.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addMonths(base: Date, months: number): Date {
  const next = new Date(base.getTime());
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function resolveCreditGrantExpiresAt(input: {
  expiresAt?: string;
  validityDays?: number;
  validityMode?: "months" | "days" | "lifetime" | "custom";
  validityMonths?: number;
}): string | null {
  const mode = input.validityMode ?? "lifetime";
  if (mode === "lifetime") return null;
  if (mode === "custom") {
    return input.expiresAt?.trim() || null;
  }
  const now = new Date();
  if (mode === "days") {
    return addDays(now, input.validityDays ?? 30).toISOString();
  }
  return addMonths(now, input.validityMonths ?? 1).toISOString();
}

function summarizeErrorJson(errorJson: Record<string, unknown> | null): string | null {
  if (!errorJson) return null;
  if (typeof errorJson.message === "string" && errorJson.message.trim()) {
    return errorJson.message.trim();
  }
  if (typeof errorJson.code === "string" && errorJson.code.trim()) {
    return errorJson.code.trim();
  }
  const serialized = JSON.stringify(errorJson);
  return serialized.length > 240 ? `${serialized.slice(0, 240)}...` : serialized;
}

function summarizeJson(value: Record<string, unknown> | null): string | null {
  if (!value) return null;
  const serialized = JSON.stringify(value, null, 2);
  return serialized.length > 4_000 ? `${serialized.slice(0, 4_000)}\n...truncated` : serialized;
}

function mapMembership(row: AdminMembershipRow): AdminUserMembershipView {
  const balanceCredits = parseNumericString(row.balance_cents);
  const reservedCredits = parseNumericString(row.reserved_cents);
  const usedCredits = parseNumericString(row.used_credits);
  const settledEvents = parseNumericString(row.settled_usage_events);
  const activeCreditGrantCount = parseNumericString(row.active_credit_grant_count);
  return {
    activeCreditGrantCount,
    availableCredits: Math.max(balanceCredits - reservedCredits, 0),
    balanceCredits,
    creditLedger: [],
    creditGrantCount: activeCreditGrantCount,
    latestUsageAt: row.latest_usage_at,
    membershipTier: normalizeMembershipTier(row.membership_tier),
    membershipTierExpiresAt: row.membership_tier_expires_at,
    membershipStatus: row.membership_status,
    nextCreditExpiresAt: row.next_credit_expires_at,
    reservedCredits,
    roleKey: row.role_key,
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    tenantStatus: row.tenant_status,
    totalCreditGrants: parseNumericString(row.original_grant_credits),
    usageAudit: {
      latestUsageAt: row.latest_usage_at,
      settledCredits: usedCredits,
      settledEvents,
    },
    usedCredits,
  };
}

function mapUser(row: AdminUserRow, memberships: AdminUserMembershipView[]): AdminUserView {
  return {
    createdAt: row.created_at,
    displayName: row.display_name,
    email: row.email,
    emailVerifiedAt: row.email_verified_at,
    id: row.id,
    lastLoginAt: row.last_login_at,
    memberships,
    status: row.status,
  };
}

function mapWorkflowRun(row: AdminWorkflowRunRow): AdminWorkflowRunView {
  return {
    createdAt: row.created_at,
    createdBy: row.created_by,
    errorJson: row.error_json,
    errorSummary: summarizeErrorJson(row.error_json),
    failedNodeRunCount: Number.parseInt(row.failed_node_run_count, 10) || 0,
    finishedAt: row.finished_at,
    flowId: row.flow_id,
    id: row.id,
    nodeRunCount: Number.parseInt(row.node_run_count, 10) || 0,
    runMode: row.run_mode?.trim() || "flow",
    startedAt: row.started_at,
    status: row.status,
    targetNodeId: row.target_node_id,
    tenantId: row.tenant_id,
    updatedAt: row.updated_at,
  };
}

function generateRedeemCode(): string {
  return `TF-${randomBytes(5).toString("hex").toUpperCase()}`;
}

function generateTemporaryPassword(): string {
  return `TapFlow_${randomBytes(9).toString("base64url")}Aa1!`;
}

function mapRedeemCode(row: AdminRedeemCodeRow): AdminRedeemCodeView {
  const metadataReason = row.reason;
  const isFullyRedeemed = row.redeemed_count >= row.max_redemptions;
  return {
    code: row.code,
    createdAt: row.created_at,
    createdByEmail: row.created_by_email,
    createdByName: row.created_by_name,
    credits: parseNumericString(row.credits),
    expiresAt: row.expires_at,
    id: row.id,
    maxRedemptions: row.max_redemptions,
    reason: metadataReason,
    redeemedCount: row.redeemed_count,
    status: isFullyRedeemed ? "redeemed" : "unredeemed",
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
  };
}

function mapRedeemCodeRedemption(row: AdminRedeemCodeRedemptionRow): AdminRedeemCodeRedemptionView {
  return {
    billingLedgerId: row.billing_ledger_id,
    createdAt: row.created_at,
    id: row.id,
    userDisplayName: row.user_display_name,
    userEmail: row.user_email,
    userId: row.user_id,
  };
}

function normalizeAnnouncementStatus(value: string): "draft" | "published" | "archived" {
  return value === "published" || value === "archived" ? value : "draft";
}

function normalizeAnnouncementAudience(value: string): "all" | "creator" | "admin" {
  return value === "creator" || value === "admin" ? value : "all";
}

function mapAnnouncement(row: AdminAnnouncementRow): AdminAnnouncementView {
  return {
    audience: normalizeAnnouncementAudience(row.audience),
    body: row.body,
    createdAt: row.created_at,
    createdBy: row.created_by,
    createdByEmail: row.created_by_email,
    endsAt: row.ends_at,
    id: row.id,
    imageUrl: row.image_url,
    isRead: Boolean(row.is_read),
    linkUrl: row.link_url,
    pinned: Boolean(row.pinned),
    publishedAt: row.published_at,
    startsAt: row.starts_at,
    status: normalizeAnnouncementStatus(row.status),
    tenantId: row.tenant_id,
    title: row.title,
    updatedAt: row.updated_at,
  };
}

function percent(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 10_000) / 100;
}

function mapAiRouteStats(
  rows: AdminAiRouteStatsRow[],
  windowMinutes: number,
): AdminAiRouteStatsView {
  const routes = rows.map((row) => {
    const totalCalls = parseNumericString(row.total_calls);
    const successfulCalls = parseNumericString(row.successful_calls);
    const failedCalls = parseNumericString(row.failed_calls);
    const averageLatencyMs =
      row.average_latency_ms === null ? null : Math.round(parseNumericString(row.average_latency_ms));
    return {
      averageLatencyMs,
      failedCalls,
      lastError: row.last_error,
      lastFailureAt: row.last_failure_at,
      lastSuccessAt: row.last_success_at,
      modelDisplayName: row.model_display_name,
      providerName: row.provider_name,
      routeId: row.route_id,
      routeKey: row.route_key,
      routeLabel: row.route_label,
      successRate: percent(successfulCalls, totalCalls),
      successfulCalls,
      totalCalls,
    };
  });
  const totalCalls = routes.reduce((sum, route) => sum + route.totalCalls, 0);
  const successfulCalls = routes.reduce((sum, route) => sum + route.successfulCalls, 0);
  const failedCalls = routes.reduce((sum, route) => sum + route.failedCalls, 0);
  const latencyWeightedTotal = routes.reduce(
    (sum, route) => sum + (route.averageLatencyMs ?? 0) * route.totalCalls,
    0,
  );
  return {
    routes,
    summary: {
      averageLatencyMs: totalCalls > 0 ? Math.round(latencyWeightedTotal / totalCalls) : null,
      failedCalls,
      successRate: percent(successfulCalls, totalCalls),
      successfulCalls,
      totalCalls,
      windowMinutes,
    },
  };
}

export class AdminApiService {
  readonly billingService: BillingService;
  readonly pool: PgPool;

  constructor(options?: {
    billingService?: BillingService;
    pool?: PgPool;
  }) {
    this.pool = options?.pool ?? createPgPool();
    this.billingService = options?.billingService ?? new BillingService({ pool: this.pool });
  }

  async searchUsers(
    context: AdminContext,
    input?: {
      limit?: number;
      query?: string;
    },
  ): Promise<{
    items: AdminUserView[];
    query: string;
  }> {
    const tenantContext = requireTenantContext(context);
    const limit = Math.max(1, Math.min(input?.limit ?? 20, 50));
    const query = input?.query?.trim() ?? "";
    const likeQuery = query ? `%${query.replace(/\s+/g, "%")}%` : null;

    const client = await this.pool.connect();
    let users: { rows: AdminUserRow[] };
    try {
      await client.query("BEGIN");
      await setAdminTenantContext(client, tenantContext);
      users = await client.query<AdminUserRow>(
        `
          SELECT
            users.id::text AS id,
            users.email,
            users.display_name,
            users.status,
            users.email_verified_at::text AS email_verified_at,
            users.last_login_at::text AS last_login_at,
            users.created_at::text AS created_at
          FROM users
          WHERE
            $1::text IS NULL
            OR users.email ILIKE $1::text
            OR COALESCE(users.display_name, '') ILIKE $1::text
          ORDER BY users.created_at DESC, users.id DESC
          LIMIT $2::int
        `,
        [likeQuery, limit],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    const membershipsByUserId = await this.loadMembershipsByUserIds(tenantContext, users.rows.map((row) => row.id));

    return {
      items: users.rows.map((row) => mapUser(row, membershipsByUserId.get(row.id) ?? [])),
      query,
    };
  }

  async getUser(
    context: AdminContext,
    userId: string,
  ): Promise<AdminUserView> {
    const tenantContext = requireTenantContext(context);
    const client = await this.pool.connect();
    let user: { rows: AdminUserRow[] };
    try {
      await client.query("BEGIN");
      await setAdminTenantContext(client, tenantContext);
      user = await client.query<AdminUserRow>(
        `
          SELECT
            users.id::text AS id,
            users.email,
            users.display_name,
            users.status,
            users.email_verified_at::text AS email_verified_at,
            users.last_login_at::text AS last_login_at,
            users.created_at::text AS created_at
          FROM users
          WHERE users.id = $1::uuid
          LIMIT 1
        `,
        [userId],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    const row = user.rows[0];
    if (!row) {
      throw new AdminApiError(404, "USER_NOT_FOUND", "未找到对应用户");
    }

    const membershipsByUserId = await this.loadMembershipsByUserIds(tenantContext, [userId]);
    return mapUser(row, membershipsByUserId.get(userId) ?? []);
  }

  async grantCredits(
    context: AdminContext,
    input: {
      credits: number;
      expiresAt?: string;
      idempotencyKey?: string;
      reason: string;
      targetUserId: string;
      tenantId: string;
      validityDays?: number;
      validityMode?: "months" | "days" | "lifetime" | "custom";
      validityMonths?: number;
    },
  ): Promise<{
    account: {
      availableCredits: number;
      balanceCredits: number;
      reservedCredits: number;
      tenantId: string;
    };
    ledgerEntry: BillingLedgerView;
  }> {
    const tenantContext = requireTenantContext(context);
    const client = await this.pool.connect();
    let membership: { rows: Array<{ exists_flag: number }> };
    try {
      await client.query("BEGIN");
      await setAdminTenantContext(client, tenantContext);
      membership = await client.query<{ exists_flag: number }>(
        `
          SELECT 1 AS exists_flag
          FROM tenant_memberships
          WHERE tenant_id = $1::uuid
            AND user_id = $2::uuid
          LIMIT 1
        `,
        [input.tenantId, input.targetUserId],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    if (!membership.rows[0]) {
      throw new AdminApiError(404, "TENANT_MEMBERSHIP_NOT_FOUND", "Target user does not belong to the selected workspace.");
    }

    const idempotencyKey = input.idempotencyKey?.trim() || `admin-grant:${input.tenantId}:${input.targetUserId}:${randomUUID()}`;
    const creditExpiresAt = resolveCreditGrantExpiresAt(input);
    let ledgerEntry: BillingLedgerView;
    try {
      ledgerEntry = await this.billingService.creditAccount(
        {
          tenantId: input.tenantId,
          userId: context.userId,
        },
        {
          amountCents: input.credits,
          description: `Admin grant credits: ${input.reason.trim()}`,
          entryType: "admin_credit",
          idempotencyKey,
          metadata: {
            adminActorUserId: context.userId,
            creditExpiresAt,
            reason: input.reason.trim(),
            targetUserId: input.targetUserId,
            validityMode: input.validityMode ?? "lifetime",
          },
        },
      );
    } catch (error) {
      if (error instanceof BillingServiceError) {
        throw new AdminApiError(error.statusCode, error.code, error.message);
      }
      throw error;
    }

    const summary = await this.billingService.getBillingSummary({
      tenantId: input.tenantId,
      userId: context.userId,
    });

    await safeRecordAuditLog(
      {
        action: "admin.user.grant_credits",
        actorType: "user",
        actorUserId: context.userId,
        ipHash: context.ipHash,
        metadata: {
          creditExpiresAt,
          credits: input.credits,
          idempotencyKey,
          reason: input.reason.trim(),
          targetUserId: input.targetUserId,
          tenantId: input.tenantId,
          validityMode: input.validityMode ?? "lifetime",
        },
        requestId: context.requestId,
        resourceId: input.targetUserId,
        resourceType: "user",
        tenantId: input.tenantId,
        traceId: context.traceId,
        userAgent: context.userAgent,
      },
      { pool: this.pool },
    );

    return {
      account: {
        availableCredits: summary.creditGrants.availableCredits,
        balanceCredits: summary.account.balanceCents,
        reservedCredits: summary.creditGrants.reservedCredits,
        tenantId: input.tenantId,
      },
      ledgerEntry,
    };
  }

  async adjustCredits(
    context: AdminContext,
    input: {
      credits: number;
      direction: "add" | "subtract";
      idempotencyKey?: string;
      reason: string;
      targetUserId: string;
      tenantId: string;
    },
  ): Promise<{
    account: {
      availableCredits: number;
      balanceCredits: number;
      reservedCredits: number;
      tenantId: string;
    };
    ledgerEntry: BillingLedgerView;
  }> {
    const tenantContext = requireTenantContext(context);
    const hasSuperAdminSource = context.roles.includes("system_admin") || context.roles.includes("admin_email");
    if (!hasSuperAdminSource) {
      throw new AdminApiError(403, "SUPER_ADMIN_REQUIRED", "Only super admins can manually adjust user credits.");
    }

    const membership = await withTenantTransaction<{ rows: Array<{ exists_flag: number }> }>(tenantContext, async (client) => {
      return client.query<{ exists_flag: number }>(
        `
          SELECT 1 AS exists_flag
          FROM tenant_memberships
          WHERE tenant_id = $1::uuid
            AND user_id = $2::uuid
          LIMIT 1
        `,
        [input.tenantId, input.targetUserId],
      );
    }, this.pool);
    if (!membership.rows[0]) {
      throw new AdminApiError(404, "TENANT_MEMBERSHIP_NOT_FOUND", "Target user does not belong to the selected workspace.");
    }

    const idempotencyKey = input.idempotencyKey?.trim() || `admin-adjust:${input.direction}:${input.tenantId}:${input.targetUserId}:${randomUUID()}`;
    let ledgerEntry: BillingLedgerView;
    try {
      const payload = {
        amountCents: input.credits,
        description: `Admin ${input.direction === "add" ? "add" : "subtract"} credits: ${input.reason.trim()}`,
        entryType: input.direction === "add" ? "admin_credit" : "admin_debit",
        idempotencyKey,
        metadata: {
          adminActorUserId: context.userId,
          adjustmentDirection: input.direction,
          reason: input.reason.trim(),
          targetUserId: input.targetUserId,
        },
      };
      ledgerEntry = input.direction === "add"
        ? await this.billingService.creditAccount({ tenantId: input.tenantId, userId: context.userId }, payload)
        : await this.billingService.debitAccount({ tenantId: input.tenantId, userId: context.userId }, payload);
    } catch (error) {
      if (error instanceof BillingServiceError) {
        throw new AdminApiError(error.statusCode, error.code, error.message);
      }
      throw error;
    }

    const summary = await this.billingService.getBillingSummary({
      tenantId: input.tenantId,
      userId: context.userId,
    });

    await safeRecordAuditLog(
      {
        action: input.direction === "add" ? "admin.user.adjust_credits.add" : "admin.user.adjust_credits.subtract",
        actorType: "user",
        actorUserId: context.userId,
        ipHash: context.ipHash,
        metadata: {
          credits: input.credits,
          direction: input.direction,
          idempotencyKey,
          reason: input.reason.trim(),
          targetUserId: input.targetUserId,
          tenantId: input.tenantId,
        },
        requestId: context.requestId,
        resourceId: input.targetUserId,
        resourceType: "user",
        tenantId: input.tenantId,
        traceId: context.traceId,
        userAgent: context.userAgent,
      },
      { pool: this.pool },
    ).catch(() => undefined);

    return {
      account: {
        availableCredits: summary.creditGrants.availableCredits,
        balanceCredits: summary.account.balanceCents,
        reservedCredits: summary.creditGrants.reservedCredits,
        tenantId: input.tenantId,
      },
      ledgerEntry,
    };
  }

  async updateUserStatus(
    context: AdminContext,
    input: {
      status: "active" | "disabled";
      targetUserId: string;
    },
  ): Promise<Pick<AdminUserView, "id" | "status">> {
    const tenantContext = requireTenantContext(context);
    const hasSuperAdminSource = context.roles.includes("system_admin") || context.roles.includes("admin_email");
    if (!hasSuperAdminSource) {
      throw new AdminApiError(403, "SUPER_ADMIN_REQUIRED", "Only super admins can update user status.");
    }
    if (input.targetUserId === context.userId && input.status === "disabled") {
      throw new AdminApiError(409, "CANNOT_DISABLE_SELF", "Super admins cannot disable their own account.");
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await setAdminTenantContext(client, tenantContext);
      const updated = await client.query<{ id: string; status: string }>(
        `
          UPDATE users
          SET status = $2, updated_at = now()
          WHERE id = $1::uuid
          RETURNING id::text AS id, status
        `,
        [input.targetUserId, input.status],
      );
      if (!updated.rows[0]) {
        throw new AdminApiError(404, "USER_NOT_FOUND", "User not found.");
      }
      if (input.status === "disabled") {
        await client.query(
          `
            UPDATE auth_sessions
            SET status = 'revoked', revoked_at = COALESCE(revoked_at, now())
            WHERE user_id = $1::uuid
              AND status = 'active'
          `,
          [input.targetUserId],
        );
        await client.query(
          `
            UPDATE refresh_tokens
            SET revoked_at = COALESCE(revoked_at, now())
            WHERE user_id = $1::uuid
              AND revoked_at IS NULL
          `,
          [input.targetUserId],
        );
      }
      await client.query("COMMIT");

      await safeRecordAuditLog(
        {
          action: "admin.user.update_status",
          actorType: "user",
          actorUserId: context.userId,
          ipHash: context.ipHash,
          metadata: {
            status: input.status,
            targetUserId: input.targetUserId,
          },
          requestId: context.requestId,
          resourceId: input.targetUserId,
          resourceType: "user",
          tenantId: tenantContext.tenantId,
          traceId: context.traceId,
          userAgent: context.userAgent,
        },
        { pool: this.pool },
      ).catch(() => undefined);

      return updated.rows[0];
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof AdminApiError) {
        throw error;
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async updateMembershipTier(
    context: AdminContext,
    input: {
      expiresAt?: string;
      targetUserId: string;
      tenantId?: string;
      tier: MembershipTier;
    },
  ): Promise<{
    membershipTier: MembershipTier;
    membershipTierExpiresAt: string | null;
    targetUserId: string;
    tenantId: string;
  }> {
    const tenantContext = requireTenantContext(context);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await setAdminTenantContext(client, tenantContext);

      const membership = await client.query<{ tenant_id: string }>(
        `
          SELECT tenant_id::text AS tenant_id
          FROM tenant_memberships
          WHERE user_id = $1::uuid
            AND status = 'active'
            AND ($2::uuid IS NULL OR tenant_id = $2::uuid)
          ORDER BY created_at ASC, id ASC
          LIMIT 1
        `,
        [input.targetUserId, input.tenantId ?? null],
      );
      const tenantId = membership.rows[0]?.tenant_id;
      if (!tenantId) {
        throw new AdminApiError(404, "TENANT_MEMBERSHIP_NOT_FOUND", "Target user does not belong to the selected workspace.");
      }

      const updated = await client.query<{
        membership_tier: string;
        membership_tier_expires_at: string | null;
        tenant_id: string;
      }>(
        `
          UPDATE billing_accounts
          SET
            membership_tier = $2,
            membership_tier_source = 'admin_override',
            membership_tier_overridden_by = $3::uuid,
            membership_tier_overridden_at = now(),
            membership_tier_expires_at = $4::timestamptz,
            updated_at = now()
          WHERE tenant_id = $1::uuid
          RETURNING
            tenant_id::text AS tenant_id,
            membership_tier,
            membership_tier_expires_at::text AS membership_tier_expires_at
        `,
        [tenantId, input.tier, context.userId, input.expiresAt ?? null],
      );
      if (!updated.rows[0]) {
        throw new AdminApiError(404, "BILLING_ACCOUNT_NOT_FOUND", "Billing account was not found for the selected workspace.");
      }

      await client.query("COMMIT");

      await safeRecordAuditLog(
        {
          action: "admin.user.update_membership_tier",
          actorType: "user",
          actorUserId: context.userId,
          ipHash: context.ipHash,
          metadata: {
            expiresAt: input.expiresAt ?? null,
            targetUserId: input.targetUserId,
            tier: input.tier,
          },
          requestId: context.requestId,
          resourceId: input.targetUserId,
          resourceType: "user",
          tenantId,
          traceId: context.traceId,
          userAgent: context.userAgent,
        },
        { pool: this.pool },
      ).catch(() => undefined);

      return {
        membershipTier: normalizeMembershipTier(updated.rows[0].membership_tier),
        membershipTierExpiresAt: updated.rows[0].membership_tier_expires_at,
        targetUserId: input.targetUserId,
        tenantId,
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof AdminApiError) {
        throw error;
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async createRedeemCode(
    context: AdminContext,
    input: {
      code?: string;
      credits: number;
      expiresAt?: string;
      maxRedemptions: number;
      reason?: string;
      tenantId?: string;
    },
  ): Promise<{
    code: string;
    credits: number;
    expiresAt: string | null;
    id: string;
    maxRedemptions: number;
    tenantId: string | null;
  }> {
    const tenantContext = requireTenantContext(context);
    const tenantId = input.tenantId ?? tenantContext.tenantId;
    const hasSuperAdminSource = context.roles.includes("system_admin") || context.roles.includes("admin_email");
    if (tenantId !== null && tenantId !== tenantContext.tenantId && !hasSuperAdminSource) {
      throw new AdminApiError(403, "TENANT_SCOPE_MISMATCH", "当前只能为当前工作区创建兑换码");
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await setAdminTenantContext(client, tenantContext);

      let created: {
        code: string;
        credits: number;
        expiresAt: string | null;
        id: string;
        maxRedemptions: number;
        tenantId: string | null;
      } | null = null;

      for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
        const plaintextCode = (input.code?.trim() || generateRedeemCode()).toUpperCase();
        const codeHash = hashBillingRedeemCode(plaintextCode);
        try {
          const inserted = await client.query<{
            credits: string;
            expires_at: string | null;
            id: string;
            max_redemptions: number;
            tenant_id: string | null;
          }>(
            `
              INSERT INTO billing_redeem_codes (
                tenant_id,
                code,
                code_hash,
                credits,
                status,
                max_redemptions,
                expires_at,
                created_by,
                metadata
              )
              VALUES (
                $1::uuid,
                $2,
                $3,
                $4::numeric,
                'active',
                $5::int,
                $6::timestamptz,
                $7::uuid,
                $8::jsonb
              )
              RETURNING
                id::text AS id,
                tenant_id::text AS tenant_id,
                credits::text AS credits,
                max_redemptions,
                expires_at::text AS expires_at
            `,
            [
              tenantId ?? null,
              plaintextCode,
              codeHash,
              input.credits,
              input.maxRedemptions,
              input.expiresAt ?? null,
              context.userId,
              JSON.stringify({
                adminActorUserId: context.userId,
                reason: input.reason?.trim() || null,
              }),
            ],
          );
          created = {
            code: plaintextCode,
            credits: parseNumericString(inserted.rows[0]?.credits),
            expiresAt: inserted.rows[0]?.expires_at ?? null,
            id: inserted.rows[0]?.id ?? "",
            maxRedemptions: inserted.rows[0]?.max_redemptions ?? input.maxRedemptions,
            tenantId: inserted.rows[0]?.tenant_id ?? null,
          };
        } catch (error) {
          if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "23505"
          ) {
            if (input.code?.trim()) {
              throw new AdminApiError(409, "REDEEM_CODE_CONFLICT", "Redeem code already exists");
            }
            continue;
          }
          throw error;
        }
      }

      if (!created) {
        throw new AdminApiError(500, "REDEEM_CODE_CREATE_FAILED", "兑换码创建失败，请稍后重试");
      }

      await client.query("COMMIT");

      await safeRecordAuditLog(
        {
          action: "admin.redeem_code.create",
          actorType: "user",
          actorUserId: context.userId,
          ipHash: context.ipHash,
          metadata: {
            credits: created.credits,
            expiresAt: created.expiresAt,
            maxRedemptions: created.maxRedemptions,
            reason: input.reason?.trim() || null,
            tenantId: created.tenantId,
          },
          requestId: context.requestId,
          resourceId: created.id,
          resourceType: "billing_redeem_code",
          tenantId: created.tenantId ?? tenantContext.tenantId,
          traceId: context.traceId,
          userAgent: context.userAgent,
        },
        { pool: this.pool },
      ).catch(() => undefined);

      return created;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof AdminApiError) {
        throw error;
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async listRedeemCodes(
    context: AdminContext,
    input?: {
      limit?: number;
      status?: string;
    },
  ): Promise<{
    items: AdminRedeemCodeView[];
  }> {
    const tenantContext = requireTenantContext(context);
    const limit = Math.max(1, Math.min(input?.limit ?? 50, 100));
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await setAdminTenantContext(client, tenantContext);
      const result = await client.query<AdminRedeemCodeRow>(
        `
          SELECT
            billing_redeem_codes.id::text AS id,
            billing_redeem_codes.tenant_id::text AS tenant_id,
            tenants.name AS tenant_name,
            billing_redeem_codes.code,
            billing_redeem_codes.credits::text AS credits,
            billing_redeem_codes.status,
            billing_redeem_codes.max_redemptions,
            billing_redeem_codes.redeemed_count,
            billing_redeem_codes.expires_at::text AS expires_at,
            billing_redeem_codes.created_at::text AS created_at,
            billing_redeem_codes.metadata->>'reason' AS reason,
            created_by_user.email AS created_by_email,
            created_by_user.display_name AS created_by_name
          FROM billing_redeem_codes
          LEFT JOIN tenants
            ON tenants.id = billing_redeem_codes.tenant_id
          LEFT JOIN users AS created_by_user
            ON created_by_user.id = billing_redeem_codes.created_by
          WHERE ($1::text IS NULL OR billing_redeem_codes.status = $1::text)
          ORDER BY billing_redeem_codes.created_at DESC, billing_redeem_codes.id DESC
          LIMIT $2::int
        `,
        [input?.status?.trim() || null, limit],
      );
      await client.query("COMMIT");
      return {
        items: result.rows.map(mapRedeemCode),
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async listRedeemCodeRedemptions(
    context: AdminContext,
    codeId: string,
  ): Promise<{
    items: AdminRedeemCodeRedemptionView[];
  }> {
    const tenantContext = requireTenantContext(context);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await setAdminTenantContext(client, tenantContext);
      const result = await client.query<AdminRedeemCodeRedemptionRow>(
        `
          SELECT
            billing_redeem_code_redemptions.id::text AS id,
            billing_redeem_code_redemptions.user_id::text AS user_id,
            billing_redeem_code_redemptions.billing_ledger_id::text AS billing_ledger_id,
            billing_redeem_code_redemptions.created_at::text AS created_at,
            users.email AS user_email,
            users.display_name AS user_display_name
          FROM billing_redeem_code_redemptions
          LEFT JOIN users
            ON users.id = billing_redeem_code_redemptions.user_id
          WHERE billing_redeem_code_redemptions.redeem_code_id = $1::uuid
          ORDER BY billing_redeem_code_redemptions.created_at DESC, billing_redeem_code_redemptions.id DESC
        `,
        [codeId],
      );
      await client.query("COMMIT");
      return {
        items: result.rows.map(mapRedeemCodeRedemption),
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteRedeemCode(context: AdminContext, codeId: string): Promise<void> {
    const tenantContext = requireTenantContext(context);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await setAdminTenantContext(client, tenantContext);
      const existing = await client.query<{
        id: string;
        redeemed_count: number;
        tenant_id: string | null;
      }>(
        `
          SELECT
            id::text AS id,
            tenant_id::text AS tenant_id,
            redeemed_count
          FROM billing_redeem_codes
          WHERE id = $1::uuid
          LIMIT 1
          FOR UPDATE
        `,
        [codeId],
      );
      const row = existing.rows[0];
      if (!row) {
        throw new AdminApiError(404, "REDEEM_CODE_NOT_FOUND", "Redeem code not found.");
      }
      if (row.redeemed_count > 0) {
        throw new AdminApiError(409, "REDEEM_CODE_ALREADY_REDEEMED", "Redeemed codes cannot be deleted.");
      }
      await client.query(
        `
          DELETE FROM billing_redeem_codes
          WHERE id = $1::uuid
            AND redeemed_count = 0
        `,
        [codeId],
      );
      await client.query("COMMIT");

      await safeRecordAuditLog(
        {
          action: "admin.redeem_code.delete",
          actorType: "user",
          actorUserId: context.userId,
          ipHash: context.ipHash,
          metadata: {
            codeId,
            tenantId: row.tenant_id,
          },
          requestId: context.requestId,
          resourceId: codeId,
          resourceType: "billing_redeem_code",
          tenantId: row.tenant_id ?? tenantContext.tenantId,
          traceId: context.traceId,
          userAgent: context.userAgent,
        },
        { pool: this.pool },
      ).catch(() => undefined);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof AdminApiError) {
        throw error;
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async updateUserRole(
    context: AdminContext,
    input: {
      roleKey: "system_admin" | "tenant_admin" | "flow_developer";
      targetUserId: string;
      tenantId: string;
    },
  ): Promise<{
    roleKey: string;
    targetUserId: string;
    tenantId: string;
  }> {
    const tenantContext = requireTenantContext(context);
    const hasSuperAdminSource = context.roles.includes("system_admin") || context.roles.includes("admin_email");
    if (!hasSuperAdminSource) {
      throw new AdminApiError(403, "SUPER_ADMIN_REQUIRED", "只有超级管理员可以调整管理员身份");
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await setAdminTenantContext(client, tenantContext);
      const updated = await client.query<{ role_key: string }>(
        `
          UPDATE tenant_memberships
          SET role_key = $3,
              status = 'active',
              updated_at = now()
          WHERE tenant_id = $1::uuid
            AND user_id = $2::uuid
          RETURNING role_key
        `,
        [input.tenantId, input.targetUserId, input.roleKey],
      );
      if (!updated.rows[0]) {
        throw new AdminApiError(404, "TENANT_MEMBERSHIP_NOT_FOUND", "Target user does not belong to the selected workspace.");
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof AdminApiError) {
        throw error;
      }
      throw error;
    } finally {
      client.release();
    }

    await safeRecordAuditLog(
      {
        action: "admin.user.update_role",
        actorType: "user",
        actorUserId: context.userId,
        ipHash: context.ipHash,
        metadata: {
          roleKey: input.roleKey,
          targetUserId: input.targetUserId,
          tenantId: input.tenantId,
        },
        requestId: context.requestId,
        resourceId: input.targetUserId,
        resourceType: "user",
        tenantId: input.tenantId,
        traceId: context.traceId,
        userAgent: context.userAgent,
      },
      { pool: this.pool },
    ).catch(() => undefined);

    return {
      roleKey: input.roleKey,
      targetUserId: input.targetUserId,
      tenantId: input.tenantId,
    };
  }

  async resetPassword(
    context: AdminContext,
    input: {
      password?: string;
      userId: string;
    },
  ): Promise<{
    passwordShownOnce: string;
    user: Pick<AdminUserView, "displayName" | "email" | "id" | "status"> & {
      emailVerifiedAt: string | null;
    };
  }> {
    const tenantContext = requireTenantContext(context);
    const nextPassword = input.password?.trim() || generateTemporaryPassword();
    const passwordHash = await hashPassword(nextPassword);

    const membership = await withTenantTransaction<{ rows: Array<{ exists_flag: number }> }>(tenantContext, async (client) => {
      return client.query<{ exists_flag: number }>(
        `
          SELECT 1 AS exists_flag
          FROM tenant_memberships
          WHERE tenant_id = $1::uuid
            AND user_id = $2::uuid
          LIMIT 1
        `,
        [tenantContext.tenantId, input.userId],
      );
    }, this.pool);
    if (!membership.rows[0]) {
      throw new AdminApiError(404, "TENANT_MEMBERSHIP_NOT_FOUND", "该用户不属于当前工作区");
    }

    const updated = await this.pool.query<{
      display_name: string | null;
      email: string;
      email_verified_at: string | null;
      id: string;
      status: string;
    }>(
      `
        UPDATE users
        SET
          password_hash = $2,
          status = 'active',
          email_verified_at = COALESCE(email_verified_at, now()),
          updated_at = now()
        WHERE id = $1::uuid
        RETURNING
          id::text AS id,
          email,
          display_name,
          status,
          email_verified_at::text AS email_verified_at
      `,
      [input.userId, passwordHash],
    );

    const row = updated.rows[0];
    if (!row) {
      throw new AdminApiError(404, "USER_NOT_FOUND", "未找到对应用户");
    }

    await safeRecordAuditLog(
      {
        action: "admin.user.reset_password",
        actorType: "user",
        actorUserId: context.userId,
        ipHash: context.ipHash,
        metadata: {
          targetUserId: input.userId,
        },
        requestId: context.requestId,
        resourceId: input.userId,
        resourceType: "user",
        tenantId: tenantContext.tenantId,
        traceId: context.traceId,
        userAgent: context.userAgent,
      },
      { pool: this.pool },
    ).catch(() => undefined);

    return {
      passwordShownOnce: nextPassword,
      user: {
        displayName: row.display_name,
        email: row.email,
        emailVerifiedAt: row.email_verified_at,
        id: row.id,
        status: row.status,
      },
    };
  }

  async listWorkflowRuns(
    context: AdminContext,
    input?: {
      limit?: number;
      status?: string;
      tenantId?: string;
      userId?: string;
    },
  ): Promise<{
    items: AdminWorkflowRunView[];
  }> {
    const tenantContext = requireTenantContext(context);
    const limit = Math.max(1, Math.min(input?.limit ?? 20, 100));
    if (input?.tenantId && input.tenantId !== tenantContext.tenantId) {
      throw new AdminApiError(403, "TENANT_SCOPE_MISMATCH", "当前只能查看当前工作区的任务记录");
    }
    const result = await withTenantTransaction<{ rows: AdminWorkflowRunRow[] }>(tenantContext, async (client) => {
      return client.query<AdminWorkflowRunRow>(
        `
          SELECT
            workflow_runs.id::text AS id,
            workflow_runs.tenant_id::text AS tenant_id,
            workflow_runs.flow_id::text AS flow_id,
            workflow_runs.created_by::text AS created_by,
            workflow_runs.status,
            workflow_runs.input_json->>'runMode' AS run_mode,
            workflow_runs.input_json->>'targetNodeId' AS target_node_id,
            workflow_runs.error_json,
            workflow_runs.created_at::text AS created_at,
            workflow_runs.updated_at::text AS updated_at,
            workflow_runs.started_at::text AS started_at,
            workflow_runs.finished_at::text AS finished_at,
            COUNT(node_runs.id)::text AS node_run_count,
            COUNT(*) FILTER (WHERE node_runs.status = 'failed')::text AS failed_node_run_count
          FROM workflow_runs
          LEFT JOIN node_runs
            ON node_runs.workflow_run_id = workflow_runs.id
          WHERE workflow_runs.tenant_id = $1::uuid
            AND ($2::uuid IS NULL OR workflow_runs.created_by = $2::uuid)
            AND ($3::text IS NULL OR workflow_runs.status = $3::text)
          GROUP BY workflow_runs.id
          ORDER BY workflow_runs.created_at DESC, workflow_runs.id DESC
          LIMIT $4::int
        `,
        [
          tenantContext.tenantId,
          input?.userId ?? null,
          input?.status?.trim() || null,
          limit,
        ],
      );
    }, this.pool);

    return {
      items: result.rows.map(mapWorkflowRun),
    };
  }

  async getWorkflowRun(
    context: AdminContext,
    runId: string,
  ): Promise<AdminWorkflowRunDetailView> {
    const tenantContext = requireTenantContext(context);
    const workflowRun = await withTenantTransaction<{ rows: AdminWorkflowRunRow[] }>(tenantContext, async (client) => {
      return client.query<AdminWorkflowRunRow>(
        `
          SELECT
            workflow_runs.id::text AS id,
            workflow_runs.tenant_id::text AS tenant_id,
            workflow_runs.flow_id::text AS flow_id,
            workflow_runs.created_by::text AS created_by,
            workflow_runs.status,
            workflow_runs.input_json->>'runMode' AS run_mode,
            workflow_runs.input_json->>'targetNodeId' AS target_node_id,
            workflow_runs.error_json,
            workflow_runs.created_at::text AS created_at,
            workflow_runs.updated_at::text AS updated_at,
            workflow_runs.started_at::text AS started_at,
            workflow_runs.finished_at::text AS finished_at,
            COUNT(node_runs.id)::text AS node_run_count,
            COUNT(*) FILTER (WHERE node_runs.status = 'failed')::text AS failed_node_run_count
          FROM workflow_runs
          LEFT JOIN node_runs
            ON node_runs.workflow_run_id = workflow_runs.id
          WHERE workflow_runs.tenant_id = $1::uuid
            AND workflow_runs.id = $2::uuid
          GROUP BY workflow_runs.id
          LIMIT 1
        `,
        [tenantContext.tenantId, runId],
      );
    }, this.pool);

    const row = workflowRun.rows[0];
    if (!row) {
      throw new AdminApiError(404, "WORKFLOW_RUN_NOT_FOUND", "未找到对应任务记录");
    }

    const nodeRuns = await withTenantTransaction<{ rows: AdminNodeRunRow[] }>(tenantContext, async (client) => {
      return client.query<AdminNodeRunRow>(
        `
          SELECT
            node_runs.id::text AS id,
            node_runs.workflow_run_id::text AS workflow_run_id,
            node_runs.node_id,
            node_runs.node_type,
            node_runs.status,
            node_runs.error_json,
            node_runs.output_json,
            node_runs.started_at::text AS started_at,
            node_runs.finished_at::text AS finished_at
          FROM node_runs
          WHERE node_runs.workflow_run_id = $1::uuid
          ORDER BY node_runs.created_at ASC, node_runs.id ASC
        `,
        [runId],
      );
    }, this.pool);

    return {
      nodeRuns: nodeRuns.rows.map((nodeRun) => ({
        errorJson: nodeRun.error_json,
        finishedAt: nodeRun.finished_at,
        id: nodeRun.id,
        nodeId: nodeRun.node_id,
        nodeType: nodeRun.node_type,
        outputSummary: summarizeJson(nodeRun.output_json),
        startedAt: nodeRun.started_at,
        status: nodeRun.status,
        workflowRunId: nodeRun.workflow_run_id,
      })),
      workflowRun: mapWorkflowRun(row),
    };
  }

  async listAnnouncements(
    context: AdminContext,
    input?: {
      limit?: number;
      status?: "draft" | "published" | "archived";
    },
  ): Promise<{
    items: AdminAnnouncementView[];
  }> {
    const tenantContext = requireTenantContext(context);
    const limit = Math.max(1, Math.min(input?.limit ?? 50, 100));
    return withTenantTransaction(tenantContext, async (client) => {
      const result = await client.query<AdminAnnouncementRow>(
        `
          SELECT
            announcements.id::text AS id,
            announcements.tenant_id::text AS tenant_id,
            announcements.title,
            announcements.body,
            announcements.link_url,
            announcements.image_url,
            announcements.pinned,
            announcements.status,
            announcements.audience,
            announcements.published_at::text AS published_at,
            announcements.starts_at::text AS starts_at,
            announcements.ends_at::text AS ends_at,
            announcements.created_by::text AS created_by,
            users.email AS created_by_email,
            false AS is_read,
            announcements.created_at::text AS created_at,
            announcements.updated_at::text AS updated_at
          FROM announcements
          LEFT JOIN users
            ON users.id = announcements.created_by
          WHERE announcements.tenant_id = $1::uuid
            AND ($2::text IS NULL OR announcements.status = $2::text)
          ORDER BY announcements.pinned DESC, announcements.published_at DESC NULLS LAST, announcements.created_at DESC, announcements.id DESC
          LIMIT $3::int
        `,
        [tenantContext.tenantId, input?.status ?? null, limit],
      );
      return {
        items: result.rows.map(mapAnnouncement),
      };
    }, this.pool);
  }

  async createAnnouncement(
    context: AdminContext,
    input: {
      audience: "all" | "creator" | "admin";
      body: string;
      endsAt?: string | null;
      imageUrl?: string | null;
      linkUrl?: string | null;
      pinned?: boolean;
      startsAt?: string | null;
      status: "draft" | "published" | "archived";
      title: string;
    },
  ): Promise<AdminAnnouncementView> {
    const tenantContext = requireTenantContext(context);
    return withTenantTransaction(tenantContext, async (client) => {
      const result = await client.query<AdminAnnouncementRow>(
        `
          INSERT INTO announcements (
            tenant_id,
            title,
            body,
            link_url,
            image_url,
            pinned,
            status,
            audience,
            published_at,
            starts_at,
            ends_at,
            created_by,
            updated_at
          )
          VALUES (
            $1::uuid,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            CASE WHEN $7 = 'published' THEN now() ELSE NULL END,
            $9::timestamptz,
            $10::timestamptz,
            $11::uuid,
            now()
          )
          RETURNING
            id::text AS id,
            tenant_id::text AS tenant_id,
            title,
            body,
            link_url,
            image_url,
            pinned,
            status,
            audience,
            published_at::text AS published_at,
            starts_at::text AS starts_at,
            ends_at::text AS ends_at,
            created_by::text AS created_by,
            NULL::text AS created_by_email,
            false AS is_read,
            created_at::text AS created_at,
            updated_at::text AS updated_at
        `,
        [
          tenantContext.tenantId,
          input.title.trim(),
          input.body.trim(),
          input.linkUrl?.trim() || null,
          input.imageUrl?.trim() || null,
          Boolean(input.pinned),
          input.status,
          input.audience,
          input.startsAt ?? null,
          input.endsAt ?? null,
          context.userId,
        ],
      );
      return mapAnnouncement({
        ...result.rows[0],
        created_by_email: null,
      });
    }, this.pool);
  }

  async updateAnnouncement(
    context: AdminContext,
    announcementId: string,
    input: Partial<{
      audience: "all" | "creator" | "admin";
      body: string;
      endsAt: string | null;
      imageUrl: string | null;
      linkUrl: string | null;
      pinned: boolean;
      startsAt: string | null;
      status: "draft" | "published" | "archived";
      title: string;
    }>,
  ): Promise<AdminAnnouncementView> {
    const tenantContext = requireTenantContext(context);
    return withTenantTransaction(tenantContext, async (client) => {
      const existing = await client.query<AdminAnnouncementRow>(
        `
          SELECT
            id::text AS id,
            tenant_id::text AS tenant_id,
            title,
            body,
            link_url,
            image_url,
            pinned,
            status,
            audience,
            published_at::text AS published_at,
            starts_at::text AS starts_at,
            ends_at::text AS ends_at,
            created_by::text AS created_by,
            NULL::text AS created_by_email,
            false AS is_read,
            created_at::text AS created_at,
            updated_at::text AS updated_at
          FROM announcements
          WHERE id = $1::uuid
            AND tenant_id = $2::uuid
          LIMIT 1
        `,
        [announcementId, tenantContext.tenantId],
      );
      const row = existing.rows[0];
      if (!row) {
        throw new AdminApiError(404, "ANNOUNCEMENT_NOT_FOUND", "Announcement not found");
      }

      const nextStatus = input.status ?? normalizeAnnouncementStatus(row.status);
      const result = await client.query<AdminAnnouncementRow>(
        `
          UPDATE announcements
          SET
            title = $3,
            body = $4,
            link_url = $5,
            image_url = $6,
            status = $7,
            audience = $8,
            pinned = $9,
            published_at = CASE
              WHEN $7 = 'published' AND published_at IS NULL THEN now()
              WHEN $7 <> 'published' THEN NULL
              ELSE published_at
            END,
            starts_at = $10::timestamptz,
            ends_at = $11::timestamptz,
            updated_at = now()
          WHERE id = $1::uuid
            AND tenant_id = $2::uuid
          RETURNING
            id::text AS id,
            tenant_id::text AS tenant_id,
            title,
            body,
            link_url,
            image_url,
            pinned,
            status,
            audience,
            published_at::text AS published_at,
            starts_at::text AS starts_at,
            ends_at::text AS ends_at,
            created_by::text AS created_by,
            NULL::text AS created_by_email,
            false AS is_read,
            created_at::text AS created_at,
            updated_at::text AS updated_at
        `,
        [
          announcementId,
          tenantContext.tenantId,
          input.title?.trim() ?? row.title,
          input.body?.trim() ?? row.body,
          input.linkUrl === undefined ? row.link_url : input.linkUrl?.trim() || null,
          input.imageUrl === undefined ? row.image_url : input.imageUrl?.trim() || null,
          nextStatus,
          input.audience ?? normalizeAnnouncementAudience(row.audience),
          input.pinned ?? Boolean(row.pinned),
          input.startsAt === undefined ? row.starts_at : input.startsAt,
          input.endsAt === undefined ? row.ends_at : input.endsAt,
        ],
      );
      return mapAnnouncement(result.rows[0]);
    }, this.pool);
  }

  async deleteAnnouncement(context: AdminContext, announcementId: string): Promise<void> {
    const tenantContext = requireTenantContext(context);
    await withTenantTransaction(tenantContext, async (client) => {
      const result = await client.query(
        `
          DELETE FROM announcements
          WHERE id = $1::uuid
            AND tenant_id = $2::uuid
        `,
        [announcementId, tenantContext.tenantId],
      );
      if (result.rowCount === 0) {
        throw new AdminApiError(404, "ANNOUNCEMENT_NOT_FOUND", "Announcement not found");
      }
    }, this.pool);
  }

  async listPublishedAnnouncements(
    context: AdminContext,
    input?: {
      limit?: number;
    },
  ): Promise<{
    items: AdminAnnouncementView[];
  }> {
    const tenantContext = requireTenantContext(context);
    const limit = Math.max(1, Math.min(input?.limit ?? 10, 50));
    const canSeeAdminAnnouncements =
      context.permissions.includes("admin:system") ||
      context.roles.includes("tenant_admin") ||
      context.roles.includes("system_admin");
    const audiences = canSeeAdminAnnouncements ? ["all", "admin"] : ["all", "creator"];
    return withTenantTransaction(tenantContext, async (client) => {
      const result = await client.query<AdminAnnouncementRow>(
        `
          SELECT
            announcements.id::text AS id,
            announcements.tenant_id::text AS tenant_id,
            announcements.title,
            announcements.body,
            announcements.link_url,
            announcements.image_url,
            announcements.pinned,
            announcements.status,
            announcements.audience,
            announcements.published_at::text AS published_at,
            announcements.starts_at::text AS starts_at,
            announcements.ends_at::text AS ends_at,
            announcements.created_by::text AS created_by,
            users.email AS created_by_email,
            (announcement_reads.id IS NOT NULL) AS is_read,
            announcements.created_at::text AS created_at,
            announcements.updated_at::text AS updated_at
          FROM announcements
          LEFT JOIN users
            ON users.id = announcements.created_by
          LEFT JOIN announcement_reads
            ON announcement_reads.announcement_id = announcements.id
           AND announcement_reads.tenant_id = announcements.tenant_id
           AND announcement_reads.user_id = $4::uuid
          WHERE announcements.tenant_id = $1::uuid
            AND announcements.status = 'published'
            AND announcements.audience = ANY($2::text[])
            AND (announcements.starts_at IS NULL OR announcements.starts_at <= now())
            AND (announcements.ends_at IS NULL OR announcements.ends_at > now())
          ORDER BY announcements.pinned DESC, announcements.published_at DESC NULLS LAST, announcements.created_at DESC, announcements.id DESC
          LIMIT $3::int
        `,
        [tenantContext.tenantId, audiences, limit, context.userId],
      );
      return {
        items: result.rows.map(mapAnnouncement),
      };
    }, this.pool);
  }

  async markAnnouncementRead(
    context: AdminContext,
    announcementId: string,
  ): Promise<{ announcementId: string; readAt: string }> {
    const tenantContext = requireTenantContext(context);
    if (!context.userId) {
      throw new AdminApiError(401, "UNAUTHORIZED", "Please sign in before reading announcements.");
    }

    return withTenantTransaction(tenantContext, async (client) => {
      const existing = await client.query<{ id: string }>(
        `
          SELECT id::text AS id
          FROM announcements
          WHERE id = $1::uuid
            AND tenant_id = $2::uuid
            AND status = 'published'
          LIMIT 1
        `,
        [announcementId, tenantContext.tenantId],
      );
      if (!existing.rows[0]) {
        throw new AdminApiError(404, "ANNOUNCEMENT_NOT_FOUND", "Announcement not found.");
      }

      const read = await client.query<{ read_at: string }>(
        `
          INSERT INTO announcement_reads (
            tenant_id,
            announcement_id,
            user_id,
            read_at
          )
          VALUES ($1::uuid, $2::uuid, $3::uuid, now())
          ON CONFLICT (tenant_id, announcement_id, user_id)
          DO UPDATE SET read_at = EXCLUDED.read_at
          RETURNING read_at::text AS read_at
        `,
        [tenantContext.tenantId, announcementId, context.userId],
      );

      return {
        announcementId,
        readAt: read.rows[0]?.read_at ?? new Date().toISOString(),
      };
    }, this.pool);
  }

  async getAiRouteStats(
    context: AdminContext,
    input?: {
      windowMinutes?: number;
    },
  ): Promise<AdminAiRouteStatsView> {
    const tenantContext = requireTenantContext(context);
    const windowMinutes = Math.max(1, Math.min(input?.windowMinutes ?? 30, 24 * 60));
    return withTenantTransaction(tenantContext, async (client) => {
      const result = await client.query<AdminAiRouteStatsRow>(
        `
          WITH scoped_logs AS (
            SELECT *
            FROM ai_call_logs
            WHERE tenant_id = $1::uuid
              AND created_at >= now() - ($2::int || ' minutes')::interval
          ),
          latest_failures AS (
            SELECT DISTINCT ON (route_id)
              route_id,
              error,
              created_at
            FROM scoped_logs
            WHERE status <> 'succeeded'
            ORDER BY route_id, created_at DESC
          )
          SELECT
            ai_routes.id::text AS route_id,
            ai_routes.route_key,
            ai_routes.route_label,
            ai_models.display_name AS model_display_name,
            ai_providers.name AS provider_name,
            COUNT(scoped_logs.id)::text AS total_calls,
            COUNT(scoped_logs.id) FILTER (WHERE scoped_logs.status = 'succeeded')::text AS successful_calls,
            COUNT(scoped_logs.id) FILTER (WHERE scoped_logs.status <> 'succeeded')::text AS failed_calls,
            AVG(scoped_logs.latency_ms)::text AS average_latency_ms,
            MAX(scoped_logs.created_at) FILTER (WHERE scoped_logs.status = 'succeeded')::text AS last_success_at,
            MAX(scoped_logs.created_at) FILTER (WHERE scoped_logs.status <> 'succeeded')::text AS last_failure_at,
            latest_failures.error AS last_error
          FROM scoped_logs
          LEFT JOIN ai_routes
            ON ai_routes.id = scoped_logs.route_id
          LEFT JOIN ai_models
            ON ai_models.id = scoped_logs.model_id
          LEFT JOIN ai_providers
            ON ai_providers.id = scoped_logs.provider_id
          LEFT JOIN latest_failures
            ON latest_failures.route_id IS NOT DISTINCT FROM scoped_logs.route_id
          GROUP BY
            ai_routes.id,
            ai_routes.route_key,
            ai_routes.route_label,
            ai_models.display_name,
            ai_providers.name,
            latest_failures.error
          ORDER BY COUNT(scoped_logs.id) DESC, ai_routes.route_label ASC NULLS LAST
        `,
        [tenantContext.tenantId, windowMinutes],
      );
      return mapAiRouteStats(result.rows, windowMinutes);
    }, this.pool);
  }

  private async loadMembershipsByUserIds(
    context: { tenantId: string; userId: string | null },
    userIds: string[],
  ): Promise<Map<string, AdminUserMembershipView[]>> {
    const result = new Map<string, AdminUserMembershipView[]>();
    if (userIds.length === 0) {
      return result;
    }

    const client = await this.pool.connect();
    let memberships: { rows: AdminMembershipRow[] };
    let ledgerRows: AdminCreditLedgerRow[] = [];
    try {
      await client.query("BEGIN");
      await setAdminTenantContext(client, context);
      memberships = await client.query<AdminMembershipRow>(
        `
          SELECT
            tenant_memberships.user_id::text AS user_id,
            tenant_memberships.tenant_id::text AS tenant_id,
            tenant_memberships.role_key,
            tenant_memberships.status AS membership_status,
            tenants.name AS tenant_name,
            tenants.status AS tenant_status,
            billing_accounts.balance_cents::text AS balance_cents,
            billing_accounts.reserved_cents::text AS reserved_cents,
            billing_accounts.membership_tier,
            billing_accounts.membership_tier_expires_at::text AS membership_tier_expires_at,
            COALESCE(credit_stats.original_grant_credits, 0)::text AS original_grant_credits,
            COALESCE(credit_stats.active_credit_grant_count, 0)::text AS active_credit_grant_count,
            credit_stats.next_credit_expires_at::text AS next_credit_expires_at,
            COALESCE(usage_stats.used_credits, 0)::text AS used_credits,
            COALESCE(usage_stats.settled_usage_events, 0)::text AS settled_usage_events,
            usage_stats.latest_usage_at::text AS latest_usage_at
          FROM tenant_memberships
          JOIN tenants
            ON tenants.id = tenant_memberships.tenant_id
          LEFT JOIN billing_accounts
            ON billing_accounts.tenant_id = tenant_memberships.tenant_id
          LEFT JOIN LATERAL (
            SELECT
              COALESCE(SUM(original_credits), 0) AS original_grant_credits,
              COUNT(*) FILTER (
                WHERE status = 'active'
                  AND remaining_credits > 0
                  AND (expires_at IS NULL OR expires_at > now())
              ) AS active_credit_grant_count,
              MIN(expires_at) FILTER (
                WHERE status = 'active'
                  AND remaining_credits > 0
                  AND expires_at IS NOT NULL
                  AND expires_at > now()
              ) AS next_credit_expires_at
            FROM billing_credit_grants
            WHERE billing_credit_grants.tenant_id = tenant_memberships.tenant_id
          ) AS credit_stats ON true
          LEFT JOIN LATERAL (
            SELECT
              COALESCE(SUM(billable_cents) FILTER (WHERE status = 'settled'), 0) AS used_credits,
              COUNT(*) FILTER (WHERE status = 'settled') AS settled_usage_events,
              MAX(occurred_at) FILTER (WHERE status = 'settled') AS latest_usage_at
            FROM usage_events
            WHERE usage_events.tenant_id = tenant_memberships.tenant_id
          ) AS usage_stats ON true
          WHERE tenant_memberships.user_id = ANY($1::uuid[])
          ORDER BY tenant_memberships.created_at ASC, tenant_memberships.id ASC
        `,
        [userIds],
      );
      const tenantIds = Array.from(new Set(memberships.rows.map((row) => row.tenant_id)));
      if (tenantIds.length > 0) {
        const ledger = await client.query<AdminCreditLedgerRow>(
          `
            SELECT
              id::text AS id,
              tenant_id::text AS tenant_id,
              entry_type,
              amount_cents::text AS amount_cents,
              description,
              created_at::text AS created_at
            FROM (
              SELECT
                billing_ledger.*,
                ROW_NUMBER() OVER (
                  PARTITION BY tenant_id
                  ORDER BY created_at DESC, id DESC
                ) AS ledger_rank
              FROM billing_ledger
              WHERE tenant_id = ANY($1::uuid[])
                AND entry_type IN (
                  'admin_credit',
                  'admin_debit',
                  'redeem',
                  'payment',
                  'refund',
                  'settle'
                )
            ) AS ranked_ledger
            WHERE ledger_rank <= 10
            ORDER BY tenant_id, created_at DESC, id DESC
          `,
          [tenantIds],
        );
        ledgerRows = ledger.rows;
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    const ledgerByTenantId = new Map<string, AdminUserMembershipView["creditLedger"]>();
    for (const row of ledgerRows) {
      const existing = ledgerByTenantId.get(row.tenant_id) ?? [];
      const direction = row.entry_type === "settle" || row.entry_type === "admin_debit" ? "debit" : "credit";
      existing.push({
        amountCredits: parseNumericString(row.amount_cents),
        createdAt: row.created_at,
        description: row.description,
        direction,
        entryType: row.entry_type,
        id: row.id,
      });
      ledgerByTenantId.set(row.tenant_id, existing);
    }

    for (const row of memberships.rows) {
      const existing = result.get(row.user_id) ?? [];
      const membership = mapMembership(row);
      membership.creditLedger = ledgerByTenantId.get(row.tenant_id) ?? [];
      existing.push(membership);
      result.set(row.user_id, existing);
    }

    return result;
  }
}
