import { randomBytes, randomUUID } from "node:crypto";

import {
  BillingService,
  BillingServiceError,
  createPgPool,
  hashBillingRedeemCode,
  safeRecordAuditLog,
  type BillingLedgerView,
  withTenantTransaction,
} from "@aigc-flow/db";
import type { Pool } from "pg";

import type { RequestContext } from "../../http/request-context.js";
import { hashPassword } from "../auth/password.js";

type PgPool = Pool;

type AdminUserRow = {
  created_at: string;
  display_name: string | null;
  email: string;
  email_verified_at: string | null;
  id: string;
  status: string;
};

type AdminMembershipRow = {
  balance_cents: string | null;
  membership_status: string;
  reserved_cents: string | null;
  role_key: string;
  tenant_id: string;
  tenant_name: string;
  tenant_status: string;
  user_id: string;
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

export type AdminContext = RequestContext;

export type AdminUserMembershipView = {
  availableCredits: number;
  balanceCredits: number;
  membershipStatus: string;
  reservedCredits: number;
  roleKey: string;
  tenantId: string;
  tenantName: string;
  tenantStatus: string;
};

export type AdminUserView = {
  createdAt: string;
  displayName: string | null;
  email: string;
  emailVerifiedAt: string | null;
  id: string;
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
  return {
    availableCredits: Math.max(balanceCredits - reservedCredits, 0),
    balanceCredits,
    membershipStatus: row.membership_status,
    reservedCredits,
    roleKey: row.role_key,
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    tenantStatus: row.tenant_status,
  };
}

function mapUser(row: AdminUserRow, memberships: AdminUserMembershipView[]): AdminUserView {
  return {
    createdAt: row.created_at,
    displayName: row.display_name,
    email: row.email,
    emailVerifiedAt: row.email_verified_at,
    id: row.id,
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

    const users = await withTenantTransaction<{ rows: AdminUserRow[] }>(tenantContext, async (client) => {
      return client.query<AdminUserRow>(
        `
          SELECT
            users.id::text AS id,
            users.email,
            users.display_name,
            users.status,
            users.email_verified_at::text AS email_verified_at,
            users.created_at::text AS created_at
          FROM tenant_memberships
          JOIN users
            ON users.id = tenant_memberships.user_id
          WHERE tenant_memberships.tenant_id = $1::uuid
            AND (
              $2::text IS NULL
              OR users.email ILIKE $2::text
              OR COALESCE(users.display_name, '') ILIKE $2::text
            )
          ORDER BY users.created_at DESC, users.id DESC
          LIMIT $3::int
        `,
        [context.tenantId, likeQuery, limit],
      );
    }, this.pool);

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
    const user = await withTenantTransaction<{ rows: AdminUserRow[] }>(tenantContext, async (client) => {
      return client.query<AdminUserRow>(
        `
          SELECT
            users.id::text AS id,
            users.email,
            users.display_name,
            users.status,
            users.email_verified_at::text AS email_verified_at,
            users.created_at::text AS created_at
          FROM tenant_memberships
          JOIN users
            ON users.id = tenant_memberships.user_id
          WHERE tenant_memberships.tenant_id = $1::uuid
            AND users.id = $2::uuid
          LIMIT 1
        `,
        [context.tenantId, userId],
      );
    }, this.pool);

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
    if (input.tenantId !== tenantContext.tenantId) {
      throw new AdminApiError(403, "TENANT_SCOPE_MISMATCH", "当前管理操作仅允许在当前工作区内执行");
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
      throw new AdminApiError(404, "TENANT_MEMBERSHIP_NOT_FOUND", "该用户不属于指定工作区");
    }

    const idempotencyKey = input.idempotencyKey?.trim() || `admin-grant:${input.tenantId}:${input.targetUserId}:${randomUUID()}`;
    let ledgerEntry: BillingLedgerView;
    try {
      ledgerEntry = await this.billingService.creditAccount(
        {
          tenantId: input.tenantId,
          userId: context.userId,
        },
        {
          amountCents: input.credits,
          description: `Admin grant test credits: ${input.reason.trim()}`,
          entryType: "admin_credit",
          idempotencyKey,
          metadata: {
            adminActorUserId: context.userId,
            reason: input.reason.trim(),
            targetUserId: input.targetUserId,
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
          credits: input.credits,
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
    );

    return {
      account: {
        availableCredits: Math.max(summary.account.balanceCents - summary.account.reservedCents, 0),
        balanceCredits: summary.account.balanceCents,
        reservedCredits: summary.account.reservedCents,
        tenantId: input.tenantId,
      },
      ledgerEntry,
    };
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
    if (tenantId !== null && tenantId !== tenantContext.tenantId) {
      throw new AdminApiError(403, "TENANT_SCOPE_MISMATCH", "当前只能为当前工作区创建兑换码");
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantContext.tenantId]);
      await client.query("SELECT set_config('app.user_id', $1, true)", [tenantContext.userId ?? ""]);

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
                $3::numeric,
                'active',
                $4::int,
                $5::timestamptz,
                $6::uuid,
                $7::jsonb
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

  private async loadMembershipsByUserIds(
    context: { tenantId: string; userId: string | null },
    userIds: string[],
  ): Promise<Map<string, AdminUserMembershipView[]>> {
    const result = new Map<string, AdminUserMembershipView[]>();
    if (userIds.length === 0) {
      return result;
    }

    const memberships = await withTenantTransaction<{ rows: AdminMembershipRow[] }>(context, async (client) => {
      return client.query<AdminMembershipRow>(
        `
          SELECT
            tenant_memberships.user_id::text AS user_id,
            tenant_memberships.tenant_id::text AS tenant_id,
            tenant_memberships.role_key,
            tenant_memberships.status AS membership_status,
            tenants.name AS tenant_name,
            tenants.status AS tenant_status,
            billing_accounts.balance_cents::text AS balance_cents,
            billing_accounts.reserved_cents::text AS reserved_cents
          FROM tenant_memberships
          JOIN tenants
            ON tenants.id = tenant_memberships.tenant_id
          LEFT JOIN billing_accounts
            ON billing_accounts.tenant_id = tenant_memberships.tenant_id
          WHERE tenant_memberships.tenant_id = $1::uuid
            AND tenant_memberships.user_id = ANY($2::uuid[])
          ORDER BY tenant_memberships.created_at ASC, tenant_memberships.id ASC
        `,
        [context.tenantId, userIds],
      );
    }, this.pool);

    for (const row of memberships.rows) {
      const existing = result.get(row.user_id) ?? [];
      existing.push(mapMembership(row));
      result.set(row.user_id, existing);
    }

    return result;
  }
}
