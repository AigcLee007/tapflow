import { createHash, randomUUID } from "node:crypto";

import { createPgPool, safeRecordAuditLog, withTenantTransaction } from "@aigc-flow/db";
import type { Pool, PoolClient } from "pg";

import type { ApiEnv } from "../../config/env.js";
import type { RequestContext } from "../../http/request-context.js";
import type { AuthEmailSender } from "./auth-email-sender.js";
import type {
  LoginInput,
  ConfirmPasswordResetInput,
  RequestPasswordResetInput,
  RefreshInput,
  RegisterInput,
  ResendEmailInput,
  ResendPasswordResetInput,
  VerifyEmailInput,
} from "./auth.schemas.js";
import { hashPassword, verifyPassword } from "./password.js";
import {
  type ResolvedPermissions,
  resolvePermissionsForTenant,
} from "./permission-resolver.js";
import {
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
  verifyAccessToken,
} from "./token.js";
import {
  EMAIL_CODE_MAX_ATTEMPTS,
  EMAIL_CODE_RESEND_COOLDOWN_SECONDS,
  EMAIL_CODE_TTL_SECONDS,
  TRUSTED_DEVICE_TTL_SECONDS,
  generateNumericCode,
  generateOpaqueToken,
  hashDeviceFingerprint,
  hashIpNetwork,
  hashOpaqueToken,
  hashVerificationCode,
  maskEmail,
  verificationCodeMatches,
} from "./auth-verification.js";

type PgPool = Pool;
type PgClient = PoolClient;

type AuthenticatedIdentity = {
  permissions: string[];
  roles: string[];
  sessionId: string;
  tenantId: string | null;
  userId: string;
};

const ADMIN_PERMISSION = "admin:system";
const PLATFORM_BILLING_PERMISSIONS = ["billing:plans:manage", "billing:payments:manage", "billing:refund"];

type PublicTenant = {
  id: string;
  name: string;
  plan: string;
  slug: string;
  status: string;
};

type PublicUser = {
  displayName: string | null;
  email: string;
  id: string;
  status: string;
};

type SessionMetadata = {
  ipAddress?: string | null;
  ipHash?: string | null;
  requestId?: string | null;
  traceId?: string | null;
  userAgent?: string | null;
};

type TenantMembershipSummary = PublicTenant & {
  roleKey: string;
};

export class AuthApiError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "AuthApiError";
    this.statusCode = statusCode;
  }
}

function buildTenantSlug(name: string): string {
  const slugBase = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const suffix = randomUUID().slice(0, 8);
  return `${slugBase || "tenant"}-${suffix}`;
}

function getDefaultTenantName(input: RegisterInput): string {
  if (input.tenantName?.trim()) {
    return input.tenantName.trim();
  }

  if (input.displayName?.trim()) {
    return `${input.displayName.trim()}'s Workspace`;
  }

  const localPart = input.email.split("@")[0]?.trim() || "workspace";
  return `${localPart}'s Workspace`;
}

function hashIpAddress(ipAddress?: string | null): string | null {
  if (!ipAddress?.trim()) {
    return null;
  }

  return createHash("sha256").update(ipAddress.trim()).digest("hex");
}

function mapUser(row: {
  display_name: string | null;
  email: string;
  id: string;
  status: string;
}): PublicUser {
  return {
    displayName: row.display_name,
    email: row.email,
    id: row.id,
    status: row.status,
  };
}

function mapTenant(row: {
  id: string;
  name: string;
  plan: string;
  slug: string;
  status: string;
}): PublicTenant {
  return {
    id: row.id,
    name: row.name,
    plan: row.plan,
    slug: row.slug,
    status: row.status,
  };
}

async function withAuthContextTransaction<T>(
  pool: PgPool,
  context: {
    tenantId?: string | null;
    userId?: string | null;
  },
  run: (client: PgClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [
      context.tenantId ?? "",
    ]);
    await client.query("SELECT set_config('app.user_id', $1, true)", [
      context.userId ?? "",
    ]);
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export class AuthService {
  readonly authEmailSender: AuthEmailSender;
  readonly env: ApiEnv;
  readonly pool: PgPool;

  constructor(options: { authEmailSender: AuthEmailSender; env: ApiEnv; pool?: PgPool }) {
    this.authEmailSender = options.authEmailSender;
    this.env = options.env;
    this.pool = options.pool ?? createPgPool();
  }

  private async createSessionRecords(
    client: PgClient,
    userId: string,
    tenantId: string | null,
    metadata: SessionMetadata,
  ): Promise<{ refreshToken: string; sessionId: string }> {
    const sessionId = randomUUID();
    const refreshTokenId = randomUUID();
    const refreshToken = generateRefreshToken();

    await client.query(
      `
        INSERT INTO auth_sessions (
          id,
          user_id,
          tenant_id,
          status,
          user_agent,
          ip_hash,
          expires_at
        )
        VALUES ($1::uuid, $2::uuid, $3::uuid, 'active', $4, $5, now() + ($6 || ' seconds')::interval)
      `,
      [
        sessionId,
        userId,
        tenantId,
        metadata.userAgent ?? null,
        hashIpAddress(metadata.ipAddress),
        String(this.env.refreshTokenTtlSeconds),
      ],
    );

    await client.query(
      `
        INSERT INTO refresh_tokens (
          id,
          session_id,
          user_id,
          token_hash,
          expires_at
        )
        VALUES ($1::uuid, $2::uuid, $3::uuid, $4, now() + ($5 || ' seconds')::interval)
      `,
      [
        refreshTokenId,
        sessionId,
        userId,
        hashRefreshToken(refreshToken),
        String(this.env.refreshTokenTtlSeconds),
      ],
    );

    return { refreshToken, sessionId };
  }

  private async buildTokensResponse(input: {
    refreshToken: string;
    sessionId: string;
    tenantId: string | null;
    userId: string;
  }) {
    const records = await withAuthContextTransaction(
      this.pool,
      { tenantId: input.tenantId, userId: input.userId },
      async (client) => {
        const userResult = await client.query<{
          display_name: string | null;
          email: string;
          id: string;
          status: string;
        }>(
          `SELECT id::text AS id, email, display_name, status FROM users WHERE id = $1::uuid LIMIT 1`,
          [input.userId],
        );
        const tenantResult = input.tenantId
          ? await client.query<{
              id: string;
              name: string;
              plan: string;
              slug: string;
              status: string;
            }>(
              `SELECT id::text AS id, name, slug, plan, status FROM tenants WHERE id = $1::uuid LIMIT 1`,
              [input.tenantId],
            )
          : null;
        return {
          tenant: tenantResult?.rows[0] ?? null,
          user: userResult.rows[0] ?? null,
        };
      },
    );

    if (!records.user || (input.tenantId && !records.tenant)) {
      throw new AuthApiError(410, "VERIFICATION_EXPIRED", "验证请求已失效，请重新登录");
    }

    const resolved = await resolvePermissionsForTenant(
      { tenantId: input.tenantId, userId: input.userId },
      this.pool,
    );
    return {
      accessToken: await signAccessToken(
        {
          sessionId: input.sessionId,
          tenantId: input.tenantId,
          userId: input.userId,
        },
        this.env,
      ),
      currentTenant: records.tenant ? mapTenant(records.tenant) : null,
      permissions: resolved.permissions,
      refreshToken: input.refreshToken,
      user: mapUser(records.user),
    };
  }

  private async createEmailChallenge(input: {
    email: string;
    purpose: "email_verification" | "login_device_verification";
    reason: "email_unverified" | "new_device" | "trust_expired" | "anomalous_login";
    tenantId: string;
    userId: string;
  }) {
    const challengeId = randomUUID();
    const challengeToken = generateOpaqueToken();
    const code = generateNumericCode();
    await withAuthContextTransaction(
      this.pool,
      { tenantId: input.tenantId, userId: input.userId },
      async (client) => {
        await client.query(
          `
            INSERT INTO auth_email_challenges (
              id, user_id, tenant_id, purpose, reason, challenge_token_hash,
              code_hash, attempts_remaining, last_sent_at, expires_at, updated_at
            )
            VALUES (
              $1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, now(),
              now() + ($9 || ' seconds')::interval, now()
            )
          `,
          [
            challengeId,
            input.userId,
            input.tenantId,
            input.purpose,
            input.reason,
            hashOpaqueToken(challengeToken),
            hashVerificationCode(challengeId, code, this.env.jwtRefreshSecret),
            EMAIL_CODE_MAX_ATTEMPTS,
            String(EMAIL_CODE_TTL_SECONDS),
          ],
        );
      },
    );
    try {
      await this.authEmailSender.sendVerificationCode({
        code,
        email: input.email,
        expiresInMinutes: EMAIL_CODE_TTL_SECONDS / 60,
      });
    } catch {
      throw new AuthApiError(
        503,
        "EMAIL_DELIVERY_FAILED",
        "验证码邮件发送失败，请稍后重试",
      );
    }
    return {
      challengeToken,
      emailMasked: maskEmail(input.email),
      expiresInSeconds: EMAIL_CODE_TTL_SECONDS,
      reason: input.reason,
      resendAvailableInSeconds: EMAIL_CODE_RESEND_COOLDOWN_SECONDS,
      status: "verification_required" as const,
    };
  }

  async authenticateAccessToken(token: string): Promise<AuthenticatedIdentity | null> {
    const payload = await verifyAccessToken(token, this.env);
    if (!payload) {
      return null;
    }

    const result = await this.pool.query<{
      email: string;
      session_id: string;
      tenant_id: string | null;
      user_id: string;
    }>(
      `
        SELECT
          auth_sessions.id::text AS session_id,
          auth_sessions.tenant_id::text AS tenant_id,
          auth_sessions.user_id::text AS user_id,
          users.email
        FROM auth_sessions
        JOIN users
          ON users.id = auth_sessions.user_id
        WHERE auth_sessions.id = $1::uuid
          AND auth_sessions.user_id = $2::uuid
          AND auth_sessions.status = 'active'
          AND auth_sessions.revoked_at IS NULL
          AND auth_sessions.expires_at > now()
          AND users.status = 'active'
      `,
      [payload.session_id, payload.sub],
    );

    const session = result.rows[0];
    if (!session) {
      return null;
    }

    if ((session.tenant_id ?? null) !== (payload.tenant_id ?? null)) {
      return null;
    }

    const resolved = await resolvePermissionsForTenant(
      {
        tenantId: session.tenant_id,
        userId: session.user_id,
      },
      this.pool,
    );

    const normalizedEmail = session.email.trim().toLowerCase();
    const isAdminEmail = this.env.adminEmails.includes(normalizedEmail);
    const permissions = isAdminEmail
      ? Array.from(new Set([...resolved.permissions, ADMIN_PERMISSION, ...PLATFORM_BILLING_PERMISSIONS]))
      : resolved.permissions;
    const roles = isAdminEmail
      ? Array.from(new Set([...resolved.roles, "admin_email"]))
      : resolved.roles;

    return {
      permissions,
      roles,
      sessionId: session.session_id,
      tenantId: session.tenant_id,
      userId: session.user_id,
    };
  }

  async register(input: RegisterInput, metadata: SessionMetadata) {
    const userId = randomUUID();
    const tenantId = randomUUID();
    const challengeId = randomUUID();
    const challengeToken = generateOpaqueToken();
    const code = generateNumericCode();
    const normalizedEmail = input.email.trim().toLowerCase();
    const passwordHash = await hashPassword(input.password);
    const tenantName = getDefaultTenantName(input);
    const tenantSlug = buildTenantSlug(tenantName);
    const challengeTokenHash = hashOpaqueToken(challengeToken);
    const codeHash = hashVerificationCode(
      challengeId,
      code,
      this.env.jwtRefreshSecret,
    );

    try {
      const result = await withTenantTransaction(
        { tenantId, userId },
        async (client) => {
          const user = await client.query<{
            display_name: string | null;
            email: string;
            id: string;
            status: string;
          }>(
            `
              INSERT INTO users (id, email, display_name, password_hash, updated_at)
              VALUES ($1::uuid, $2, $3, $4, now())
              RETURNING id::text AS id, email, display_name, status
            `,
            [userId, normalizedEmail, input.displayName?.trim() ?? null, passwordHash],
          );

          const tenant = await client.query<{
            id: string;
            name: string;
            plan: string;
            slug: string;
            status: string;
          }>(
            `
              INSERT INTO tenants (id, name, slug, updated_at)
              VALUES ($1::uuid, $2, $3, now())
              RETURNING id::text AS id, name, slug, plan, status
            `,
            [tenantId, tenantName, tenantSlug],
          );

          await client.query(
            `
              INSERT INTO tenant_memberships (
                tenant_id,
                user_id,
                role_key,
                status,
                joined_at,
                updated_at
              )
              VALUES ($1::uuid, $2::uuid, 'tenant_owner', 'active', now(), now())
            `,
            [tenantId, userId],
          );

          await client.query(
            `
              INSERT INTO auth_email_challenges (
                id,
                user_id,
                tenant_id,
                purpose,
                reason,
                challenge_token_hash,
                code_hash,
                attempts_remaining,
                last_sent_at,
                expires_at,
                updated_at
              )
              VALUES (
                $1::uuid,
                $2::uuid,
                $3::uuid,
                'registration',
                'email_unverified',
                $4,
                $5,
                $6,
                now(),
                now() + ($7 || ' seconds')::interval,
                now()
              )
            `,
            [
              challengeId,
              userId,
              tenantId,
              challengeTokenHash,
              codeHash,
              EMAIL_CODE_MAX_ATTEMPTS,
              String(EMAIL_CODE_TTL_SECONDS),
            ],
          );

          return {
            currentTenant: mapTenant(tenant.rows[0]),
            user: mapUser(user.rows[0]),
          };
        },
        this.pool,
      );

      try {
        await this.authEmailSender.sendVerificationCode({
          code,
          email: normalizedEmail,
          expiresInMinutes: EMAIL_CODE_TTL_SECONDS / 60,
        });
      } catch {
        throw new AuthApiError(
          503,
          "EMAIL_DELIVERY_FAILED",
          "验证码邮件发送失败，请稍后重试",
        );
      }

      await safeRecordAuditLog(
        {
          action: "auth.register_verification_requested",
          actorType: "user",
          actorUserId: result.user.id,
          ipHash: metadata.ipHash ?? hashIpAddress(metadata.ipAddress),
          metadata: {
            challengeId,
            reason: "email_unverified",
            tenantId: result.currentTenant.id,
          },
          requestId: metadata.requestId,
          resourceId: challengeId,
          resourceType: "auth_email_challenge",
          tenantId: result.currentTenant.id,
          traceId: metadata.traceId,
          userAgent: metadata.userAgent ?? null,
        },
        {
          pool: this.pool,
        },
      );

      return {
        challengeToken,
        emailMasked: maskEmail(normalizedEmail),
        expiresInSeconds: EMAIL_CODE_TTL_SECONDS,
        reason: "email_unverified" as const,
        resendAvailableInSeconds: EMAIL_CODE_RESEND_COOLDOWN_SECONDS,
        status: "verification_required" as const,
      };
    } catch (error) {
      this.rethrowKnownDatabaseError(error, "注册账号失败，请稍后重试");
    }
  }

  async verifyEmail(input: VerifyEmailInput, metadata: SessionMetadata) {
    const client = await this.pool.connect();
    const trustedDeviceToken = generateOpaqueToken();
    let sessionRecords: { refreshToken: string; sessionId: string } | null = null;
    let verifiedIdentity: { tenantId: string | null; userId: string } | null = null;

    try {
      await client.query("BEGIN");
      const challengeResult = await client.query<{
        attempts_remaining: number;
        code_hash: string;
        consumed_at: Date | null;
        email: string;
        expired: boolean;
        id: string;
        tenant_id: string | null;
        user_id: string;
      }>(
        `
          SELECT
            challenges.id::text AS id,
            challenges.user_id::text AS user_id,
            challenges.tenant_id::text AS tenant_id,
            challenges.code_hash,
            challenges.attempts_remaining,
            challenges.consumed_at,
            challenges.expires_at <= now() AS expired,
            users.email
          FROM auth_email_challenges AS challenges
          JOIN users ON users.id = challenges.user_id
          WHERE challenges.challenge_token_hash = $1
          FOR UPDATE OF challenges
        `,
        [hashOpaqueToken(input.challengeToken)],
      );
      const challenge = challengeResult.rows[0];
      if (!challenge || challenge.consumed_at || challenge.expired) {
        throw new AuthApiError(410, "VERIFICATION_EXPIRED", "验证码已失效，请重新登录");
      }
      if (challenge.attempts_remaining <= 0) {
        throw new AuthApiError(
          429,
          "VERIFICATION_ATTEMPTS_EXHAUSTED",
          "验证码尝试次数已用完，请重新登录",
        );
      }

      if (
        !verificationCodeMatches(
          challenge.code_hash,
          challenge.id,
          input.code,
          this.env.jwtRefreshSecret,
        )
      ) {
        const attemptsRemaining = challenge.attempts_remaining - 1;
        await client.query(
          `UPDATE auth_email_challenges SET attempts_remaining = $2, updated_at = now() WHERE id = $1::uuid`,
          [challenge.id, attemptsRemaining],
        );
        await client.query("COMMIT");
        throw attemptsRemaining === 0
          ? new AuthApiError(
              429,
              "VERIFICATION_ATTEMPTS_EXHAUSTED",
              "验证码尝试次数已用完，请重新登录",
            )
          : new AuthApiError(400, "VERIFICATION_INVALID", "验证码不正确");
      }

      await client.query("SELECT set_config('app.tenant_id', $1, true)", [
        challenge.tenant_id ?? "",
      ]);
      await client.query("SELECT set_config('app.user_id', $1, true)", [
        challenge.user_id,
      ]);
      await client.query(
        `UPDATE auth_email_challenges SET consumed_at = now(), updated_at = now() WHERE id = $1::uuid`,
        [challenge.id],
      );
      await client.query(
        `
          UPDATE users
          SET email_verified_at = COALESCE(email_verified_at, now()),
              last_login_at = now(),
              updated_at = now()
          WHERE id = $1::uuid
        `,
        [challenge.user_id],
      );

      sessionRecords = await this.createSessionRecords(
        client,
        challenge.user_id,
        challenge.tenant_id,
        metadata,
      );
      await client.query(
        `
          INSERT INTO auth_trusted_devices (
            user_id,
            token_hash,
            user_agent_fingerprint_hash,
            ip_network_hash,
            trusted_until,
            updated_at
          )
          VALUES ($1::uuid, $2, $3, $4, now() + ($5 || ' seconds')::interval, now())
        `,
        [
          challenge.user_id,
          hashOpaqueToken(trustedDeviceToken),
          hashDeviceFingerprint(metadata.userAgent, this.env.jwtRefreshSecret),
          hashIpNetwork(metadata.ipAddress, this.env.jwtRefreshSecret),
          String(TRUSTED_DEVICE_TTL_SECONDS),
        ],
      );
      verifiedIdentity = {
        tenantId: challenge.tenant_id,
        userId: challenge.user_id,
      };
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }

    if (!sessionRecords || !verifiedIdentity) {
      throw new Error("Verification transaction completed without a session");
    }
    return {
      ...(await this.buildTokensResponse({
        ...sessionRecords,
        ...verifiedIdentity,
      })),
      trustedDeviceToken,
    };
  }

  async resendEmail(input: ResendEmailInput) {
    const client = await this.pool.connect();
    let code = generateNumericCode();
    let delivery: { email: string; emailMasked: string; reason: string } | null = null;

    try {
      await client.query("BEGIN");
      const challengeResult = await client.query<{
        code_hash: string;
        consumed_at: Date | null;
        email: string;
        expired: boolean;
        id: string;
        reason: string;
        resend_blocked: boolean;
      }>(
        `
          SELECT
            challenges.id::text AS id,
            challenges.reason,
            challenges.code_hash,
            challenges.consumed_at,
            challenges.expires_at <= now() AS expired,
            challenges.last_sent_at + ($2 || ' seconds')::interval > now() AS resend_blocked,
            users.email
          FROM auth_email_challenges AS challenges
          JOIN users ON users.id = challenges.user_id
          WHERE challenges.challenge_token_hash = $1
          FOR UPDATE OF challenges
        `,
        [
          hashOpaqueToken(input.challengeToken),
          String(EMAIL_CODE_RESEND_COOLDOWN_SECONDS),
        ],
      );
      const challenge = challengeResult.rows[0];
      if (!challenge || challenge.consumed_at || challenge.expired) {
        throw new AuthApiError(410, "VERIFICATION_EXPIRED", "验证请求已失效，请重新登录");
      }
      if (challenge.resend_blocked) {
        throw new AuthApiError(
          429,
          "VERIFICATION_RESEND_COOLDOWN",
          "验证码发送过于频繁，请稍后重试",
        );
      }


      let nextCodeHash = hashVerificationCode(
        challenge.id,
        code,
        this.env.jwtRefreshSecret,
      );
      while (nextCodeHash === challenge.code_hash) {
        code = generateNumericCode();
        nextCodeHash = hashVerificationCode(
          challenge.id,
          code,
          this.env.jwtRefreshSecret,
        );
      }

      await client.query(
        `
          UPDATE auth_email_challenges
          SET code_hash = $2,
              attempts_remaining = $3,
              last_sent_at = now(),
              expires_at = now() + ($4 || ' seconds')::interval,
              updated_at = now()
          WHERE id = $1::uuid
        `,
        [
          challenge.id,
          nextCodeHash,
          EMAIL_CODE_MAX_ATTEMPTS,
          String(EMAIL_CODE_TTL_SECONDS),
        ],
      );
      delivery = {
        email: challenge.email,
        emailMasked: maskEmail(challenge.email),
        reason: challenge.reason,
      };
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }

    if (!delivery) {
      throw new Error("Resend transaction completed without a delivery target");
    }
    try {
      await this.authEmailSender.sendVerificationCode({
        code,
        email: delivery.email,
        expiresInMinutes: EMAIL_CODE_TTL_SECONDS / 60,
      });
    } catch {
      throw new AuthApiError(
        503,
        "EMAIL_DELIVERY_FAILED",
        "验证码邮件发送失败，请稍后重试",
      );
    }
    return {
      challengeToken: input.challengeToken,
      emailMasked: delivery.emailMasked,
      expiresInSeconds: EMAIL_CODE_TTL_SECONDS,
      reason: delivery.reason,
      resendAvailableInSeconds: EMAIL_CODE_RESEND_COOLDOWN_SECONDS,
      status: "verification_required" as const,
    };
  }

  async requestPasswordReset(input: RequestPasswordResetInput, metadata: SessionMetadata) {
    const normalizedEmail = input.email.trim().toLowerCase();
    const userResult = await this.pool.query<{ id: string; email: string }>(
      "SELECT id::text AS id, email FROM users WHERE email = $1 AND status = 'active' LIMIT 1",
      [normalizedEmail],
    );
    const user = userResult.rows[0];
    const challengeToken = generateOpaqueToken();
    let code: string | null = null;
    let challengeId: string | null = null;
    if (user) {
      challengeId = randomUUID();
      code = generateNumericCode();
      await withAuthContextTransaction(this.pool, { tenantId: null, userId: user.id }, async (client) => {
        await client.query(
          "UPDATE auth_email_challenges SET consumed_at = COALESCE(consumed_at, now()), updated_at = now() WHERE user_id = $1::uuid AND purpose = 'password_reset' AND consumed_at IS NULL",
          [user.id],
        );
        await client.query(
          `INSERT INTO auth_email_challenges
            (id, user_id, tenant_id, purpose, reason, challenge_token_hash, code_hash, attempts_remaining, last_sent_at, expires_at, updated_at)
           VALUES ($1::uuid, $2::uuid, NULL, 'password_reset', 'password_reset', $3, $4, $5, now(), now() + ($6 || ' seconds')::interval, now())`,
          [challengeId, user.id, hashOpaqueToken(challengeToken), hashVerificationCode(challengeId as string, code as string, this.env.jwtRefreshSecret), EMAIL_CODE_MAX_ATTEMPTS, String(EMAIL_CODE_TTL_SECONDS)],
        );
      });
      try {
        await this.authEmailSender.sendPasswordResetCode({ code, email: user.email, expiresInMinutes: EMAIL_CODE_TTL_SECONDS / 60 });
      } catch {
        return { deliveryFailed: true, response: { challengeToken, expiresInSeconds: EMAIL_CODE_TTL_SECONDS, resendAvailableInSeconds: EMAIL_CODE_RESEND_COOLDOWN_SECONDS, message: "If this email is registered, a verification code has been sent." } };
      }
    }
    void metadata;
    return {
      deliveryFailed: false,
      response: {
        challengeToken,
        expiresInSeconds: EMAIL_CODE_TTL_SECONDS,
        resendAvailableInSeconds: EMAIL_CODE_RESEND_COOLDOWN_SECONDS,
        message: "If this email is registered, a verification code has been sent.",
      },
    };
  }

  async resendPasswordReset(input: ResendPasswordResetInput) {
    const client = await this.pool.connect();
    let delivery: { email: string; id: string } | null = null;
    let code = generateNumericCode();
    try {
      await client.query("BEGIN");
      const result = await client.query<{ id: string; email: string; code_hash: string; resend_blocked: boolean; consumed_at: Date | null; expired: boolean }>(
        `SELECT c.id::text AS id, u.email, c.code_hash, c.consumed_at, c.expires_at <= now() AS expired,
                c.last_sent_at + ($2 || ' seconds')::interval > now() AS resend_blocked
         FROM auth_email_challenges c JOIN users u ON u.id = c.user_id
         WHERE c.challenge_token_hash = $1 AND c.purpose = 'password_reset' FOR UPDATE OF c`,
        [hashOpaqueToken(input.challengeToken), String(EMAIL_CODE_RESEND_COOLDOWN_SECONDS)],
      );
      const challenge = result.rows[0];
      if (challenge && !challenge.consumed_at && !challenge.expired && !challenge.resend_blocked) {
        let nextHash = hashVerificationCode(challenge.id, code, this.env.jwtRefreshSecret);
        while (nextHash === challenge.code_hash) {
          code = generateNumericCode();
          nextHash = hashVerificationCode(challenge.id, code, this.env.jwtRefreshSecret);
        }
        await client.query(
          `UPDATE auth_email_challenges SET code_hash = $2, attempts_remaining = $3, last_sent_at = now(), expires_at = now() + ($4 || ' seconds')::interval, updated_at = now() WHERE id = $1::uuid`,
          [challenge.id, nextHash, EMAIL_CODE_MAX_ATTEMPTS, String(EMAIL_CODE_TTL_SECONDS)],
        );
        delivery = { email: challenge.email, id: challenge.id };
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    let deliveryFailed = false;
    if (delivery) {
      try {
        await this.authEmailSender.sendPasswordResetCode({ code, email: delivery.email, expiresInMinutes: EMAIL_CODE_TTL_SECONDS / 60 });
      } catch {
        deliveryFailed = true;
      }
    }
    return {
      deliveryFailed,
      response: {
        challengeToken: input.challengeToken,
        expiresInSeconds: EMAIL_CODE_TTL_SECONDS,
        resendAvailableInSeconds: EMAIL_CODE_RESEND_COOLDOWN_SECONDS,
        message: "If this email is registered, a verification code has been sent.",
      },
    };
  }

  async confirmPasswordReset(input: ConfirmPasswordResetInput, metadata: SessionMetadata) {
    const client = await this.pool.connect();
    let userId: string | null = null;
    try {
      await client.query("BEGIN");
      const result = await client.query<{ id: string; user_id: string; code_hash: string; attempts_remaining: number; consumed_at: Date | null; expired: boolean }>(
        `SELECT c.id::text AS id, c.user_id::text AS user_id, c.code_hash, c.attempts_remaining, c.consumed_at, c.expires_at <= now() AS expired
         FROM auth_email_challenges c WHERE c.challenge_token_hash = $1 AND c.purpose = 'password_reset' FOR UPDATE`,
        [hashOpaqueToken(input.challengeToken)],
      );
      const challenge = result.rows[0];
      if (!challenge || challenge.consumed_at || challenge.expired || challenge.attempts_remaining <= 0) {
        throw new AuthApiError(400, "PASSWORD_RESET_INVALID", "The password reset code is invalid or expired.");
      }
      if (!verificationCodeMatches(challenge.code_hash, challenge.id, input.code, this.env.jwtRefreshSecret)) {
        await client.query("UPDATE auth_email_challenges SET attempts_remaining = GREATEST(attempts_remaining - 1, 0), updated_at = now() WHERE id = $1::uuid", [challenge.id]);
        await client.query("COMMIT");
        throw new AuthApiError(400, "PASSWORD_RESET_INVALID", "The password reset code is invalid or expired.");
      }
      const passwordHash = await hashPassword(input.newPassword);
      userId = challenge.user_id;
      await client.query("UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1::uuid AND status = 'active'", [userId, passwordHash]);
      await client.query("UPDATE auth_email_challenges SET consumed_at = COALESCE(consumed_at, now()), updated_at = now() WHERE user_id = $1::uuid AND purpose = 'password_reset' AND consumed_at IS NULL", [userId]);
      await client.query("UPDATE auth_sessions SET status = 'revoked', revoked_at = COALESCE(revoked_at, now()) WHERE user_id = $1::uuid", [userId]);
      await client.query("UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, now()) WHERE user_id = $1::uuid", [userId]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    if (userId) {
      const tenant = await this.pool.query<{ id: string }>("SELECT tenant_id::text AS id FROM tenant_memberships WHERE user_id = $1::uuid AND status = 'active' ORDER BY created_at ASC LIMIT 1", [userId]);
      if (tenant.rows[0]?.id) {
        await safeRecordAuditLog({ action: "auth.password_reset", actorType: "user", actorUserId: userId, ipHash: metadata.ipHash ?? hashIpAddress(metadata.ipAddress), metadata: {}, requestId: metadata.requestId, resourceId: userId, resourceType: "user", tenantId: tenant.rows[0].id, traceId: metadata.traceId, userAgent: metadata.userAgent ?? null }, { pool: this.pool });
      }
    }
    return { message: "Password reset successfully. Please log in again." };
  }

  async login(input: LoginInput, metadata: SessionMetadata) {
    const userResult = await this.pool.query<{
      display_name: string | null;
      email: string;
      email_verified_at: Date | null;
      id: string;
      password_hash: string | null;
      status: string;
    }>(
      `
        SELECT
          id::text AS id,
          email,
          email_verified_at,
          display_name,
          password_hash,
          status
        FROM users
        WHERE email = $1
        LIMIT 1
      `,
      [input.email.trim().toLowerCase()],
    );

    const user = userResult.rows[0];
    if (!user?.password_hash || user.status !== "active") {
      throw new AuthApiError(401, "INVALID_CREDENTIALS", "邮箱或密码不正确");
    }

    const passwordMatches = await verifyPassword(user.password_hash, input.password);
    if (!passwordMatches) {
      throw new AuthApiError(401, "INVALID_CREDENTIALS", "邮箱或密码不正确");
    }

    const memberships = await this.listActiveTenantsForUser(user.id);
    if (memberships.length === 0) {
      throw new AuthApiError(403, "TENANT_ACCESS_REQUIRED", "当前账号还没有可用的工作区权限");
    }

    const currentMembership =
      (input.tenantId
        ? memberships.find((membership) => membership.id === input.tenantId)
        : memberships[0]) ?? null;

    if (!currentMembership) {
      throw new AuthApiError(403, "TENANT_FORBIDDEN", "当前账号没有访问该工作区的权限");
    }

    const currentTenant: PublicTenant = {
      id: currentMembership.id,
      name: currentMembership.name,
      plan: currentMembership.plan,
      slug: currentMembership.slug,
      status: currentMembership.status,
    };

    if (!user.email_verified_at) {
      return this.createEmailChallenge({
        email: user.email,
        purpose: "email_verification",
        reason: "email_unverified",
        tenantId: currentTenant.id,
        userId: user.id,
      });
    }

    const trustedDevice = input.trustedDeviceToken
      ? await this.pool.query<{
          ip_network_hash: string | null;
          revoked_at: Date | null;
          trusted_until: Date;
          user_agent_fingerprint_hash: string | null;
          user_id: string;
        }>(
          `
            SELECT
              user_id::text AS user_id,
              user_agent_fingerprint_hash,
              ip_network_hash,
              trusted_until,
              revoked_at
            FROM auth_trusted_devices
            WHERE token_hash = $1
            LIMIT 1
          `,
          [hashOpaqueToken(input.trustedDeviceToken)],
        )
      : null;
    const device = trustedDevice?.rows[0] ?? null;
    let challengeReason:
      | "new_device"
      | "trust_expired"
      | "anomalous_login"
      | null = null;
    if (!device || device.user_id !== user.id) {
      challengeReason = "new_device";
    } else if (device.revoked_at || device.trusted_until <= new Date()) {
      challengeReason = "trust_expired";
    } else {
      const currentDeviceHash = hashDeviceFingerprint(
        metadata.userAgent,
        this.env.jwtRefreshSecret,
      );
      const currentNetworkHash = hashIpNetwork(
        metadata.ipAddress,
        this.env.jwtRefreshSecret,
      );
      if (
        device.user_agent_fingerprint_hash &&
        device.ip_network_hash &&
        currentDeviceHash &&
        currentNetworkHash &&
        device.user_agent_fingerprint_hash !== currentDeviceHash &&
        device.ip_network_hash !== currentNetworkHash
      ) {
        challengeReason = "anomalous_login";
      }
    }

    if (challengeReason) {
      return this.createEmailChallenge({
        email: user.email,
        purpose: "login_device_verification",
        reason: challengeReason,
        tenantId: currentTenant.id,
        userId: user.id,
      });
    }

    const sessionRecords = await withTenantTransaction(
      { tenantId: currentTenant.id, userId: user.id },
      async (client) => {
        await client.query(
          `
            UPDATE users
            SET last_login_at = now(), updated_at = now()
            WHERE id = $1::uuid
          `,
          [user.id],
        );

        await client.query(
          "UPDATE auth_trusted_devices SET last_seen_at = now(), updated_at = now() WHERE token_hash = $1",
          [hashOpaqueToken(input.trustedDeviceToken!)],
        );
        return this.createSessionRecords(
          client,
          user.id,
          currentTenant.id,
          metadata,
        );
      },
      this.pool,
    );

    const response = await this.buildTokensResponse({
      ...sessionRecords,
      tenantId: currentTenant.id,
      userId: user.id,
    });

    await safeRecordAuditLog(
      {
        action: "auth.login",
        actorType: "user",
        actorUserId: user.id,
        ipHash: metadata.ipHash ?? hashIpAddress(metadata.ipAddress),
        metadata: {
          roleKey: currentMembership.roleKey,
          sessionId: sessionRecords.sessionId,
        },
        requestId: metadata.requestId,
        resourceId: sessionRecords.sessionId,
        resourceType: "auth_session",
        tenantId: currentTenant.id,
        traceId: metadata.traceId,
        userAgent: metadata.userAgent ?? null,
      },
      {
        pool: this.pool,
      },
    );

    return response;
  }

  async refresh(input: RefreshInput) {
    const tokenHash = hashRefreshToken(input.refreshToken);
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      const existing = await client.query<{
        token_id: string;
        session_id: string;
        tenant_id: string | null;
        user_id: string;
      }>(
        `
          SELECT
            rt.id::text AS token_id,
            rt.session_id::text AS session_id,
            rt.user_id::text AS user_id,
            s.tenant_id::text AS tenant_id
          FROM refresh_tokens AS rt
          JOIN auth_sessions AS s
            ON s.id = rt.session_id
          JOIN users
            ON users.id = rt.user_id
          WHERE rt.token_hash = $1
            AND rt.revoked_at IS NULL
            AND rt.expires_at > now()
            AND s.status = 'active'
            AND s.revoked_at IS NULL
            AND s.expires_at > now()
            AND users.status = 'active'
          FOR UPDATE OF rt
        `,
        [tokenHash],
      );

      const row = existing.rows[0];
      if (!row) {
        throw new AuthApiError(401, "INVALID_REFRESH_TOKEN", "登录状态已失效，请重新登录");
      }

      const nextRefreshToken = generateRefreshToken();
      const nextRefreshTokenId = randomUUID();
      const nextRefreshTokenHash = hashRefreshToken(nextRefreshToken);

      const revoked = await client.query<{ id: string }>(
        `
          UPDATE refresh_tokens
          SET revoked_at = now()
          WHERE id = $1::uuid
            AND revoked_at IS NULL
          RETURNING id::text AS id
        `,
        [row.token_id],
      );
      if (!revoked.rows[0]?.id) {
        throw new AuthApiError(401, "INVALID_REFRESH_TOKEN", "登录状态已失效，请重新登录");
      }

      await client.query(
        `
          INSERT INTO refresh_tokens (
            id,
            session_id,
            user_id,
            token_hash,
            rotated_from_token_id,
            expires_at
          )
          VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::uuid, now() + ($6 || ' seconds')::interval)
        `,
        [
          nextRefreshTokenId,
          row.session_id,
          row.user_id,
          nextRefreshTokenHash,
          row.token_id,
          String(this.env.refreshTokenTtlSeconds),
        ],
      );

      await client.query("COMMIT");

      return {
        accessToken: await signAccessToken(
          {
            sessionId: row.session_id,
            tenantId: row.tenant_id,
            userId: row.user_id,
          },
          this.env,
        ),
        refreshToken: nextRefreshToken,
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      if (error instanceof AuthApiError) {
        throw error;
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async logout(input: { refreshToken?: string | null }, context: RequestContext) {
    const client = await this.pool.connect();
    let auditActorUserId = context.userId;
    let auditSessionId = context.sessionId;
    let auditTenantId = context.tenantId;

    try {
      await client.query("BEGIN");

      let sessionId = context.sessionId;
      if (input.refreshToken) {
        const tokenResult = await client.query<{
          session_id: string;
          tenant_id: string | null;
          user_id: string;
        }>(
          `
            SELECT
              refresh_tokens.session_id::text AS session_id,
              auth_sessions.tenant_id::text AS tenant_id,
              auth_sessions.user_id::text AS user_id
            FROM refresh_tokens
            JOIN auth_sessions
              ON auth_sessions.id = refresh_tokens.session_id
            WHERE token_hash = $1
            LIMIT 1
          `,
          [hashRefreshToken(input.refreshToken)],
        );
        sessionId = tokenResult.rows[0]?.session_id ?? sessionId;
        auditActorUserId = tokenResult.rows[0]?.user_id ?? auditActorUserId;
        auditSessionId = sessionId ?? auditSessionId;
        auditTenantId = tokenResult.rows[0]?.tenant_id ?? auditTenantId;

        await client.query(
          `
            UPDATE refresh_tokens
            SET revoked_at = COALESCE(revoked_at, now())
            WHERE token_hash = $1
          `,
          [hashRefreshToken(input.refreshToken)],
        );
      }

      if (sessionId) {
        await client.query(
          `
            UPDATE auth_sessions
            SET status = 'revoked', revoked_at = COALESCE(revoked_at, now())
            WHERE id = $1::uuid
          `,
          [sessionId],
        );
        await client.query(
          `
            UPDATE refresh_tokens
            SET revoked_at = COALESCE(revoked_at, now())
            WHERE session_id = $1::uuid
          `,
          [sessionId],
        );
      }

      await client.query("COMMIT");
      if (auditTenantId) {
        await safeRecordAuditLog(
          {
            action: "auth.logout",
            actorType: auditActorUserId ? "user" : "system",
            actorUserId: auditActorUserId,
            ipHash: context.ipHash,
            metadata: {
              sessionId: auditSessionId ?? null,
            },
            requestId: context.requestId,
            resourceId: auditSessionId ?? null,
            resourceType: "auth_session",
            tenantId: auditTenantId,
            traceId: context.traceId,
            userAgent: context.userAgent,
          },
          {
            pool: this.pool,
          },
        );
      }
      return { ok: true as const };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async getMe(context: RequestContext) {
    if (!context.userId) {
      throw new AuthApiError(401, "UNAUTHORIZED", "请先登录后再继续操作");
    }

    const userResult = await this.pool.query<{
      display_name: string | null;
      email: string;
      id: string;
      status: string;
    }>(
      `
        SELECT id::text AS id, email, display_name, status
        FROM users
        WHERE id = $1::uuid
          AND status = 'active'
        LIMIT 1
      `,
      [context.userId],
    );

    const user = userResult.rows[0];
    if (!user) {
      throw new AuthApiError(401, "UNAUTHORIZED", "请先登录后再继续操作");
    }

    const currentTenant = context.tenantId
      ? await withTenantTransaction(
          { tenantId: context.tenantId, userId: context.userId },
          async (client) => {
            const tenant = await client.query<{
              id: string;
              name: string;
              plan: string;
              slug: string;
              status: string;
            }>(
              `
                SELECT id::text AS id, name, slug, plan, status
                FROM tenants
                WHERE id = $1::uuid
                LIMIT 1
              `,
              [context.tenantId],
            );
            return tenant.rows[0] ? mapTenant(tenant.rows[0]) : null;
          },
          this.pool,
        )
      : null;

    return {
      currentTenant,
      permissions: context.permissions,
      roles: context.roles,
      sessionId: context.sessionId,
      user: mapUser(user),
    };
  }

  private async listActiveTenantsForUser(userId: string): Promise<TenantMembershipSummary[]> {
    return withAuthContextTransaction(
      this.pool,
      { tenantId: null, userId },
      async (client) => {
        const result = await client.query<{
          id: string;
          name: string;
          plan: string;
          role_key: string;
          slug: string;
          status: string;
        }>(
          `
            SELECT
              tenants.id::text AS id,
              tenants.name,
              tenants.slug,
              tenants.plan,
              tenants.status,
              tenant_memberships.role_key
            FROM tenant_memberships
            JOIN tenants
              ON tenants.id = tenant_memberships.tenant_id
            WHERE tenant_memberships.user_id = $1::uuid
              AND tenant_memberships.status = 'active'
              AND tenants.status = 'active'
            ORDER BY tenant_memberships.created_at ASC, tenants.id ASC
          `,
          [userId],
        );

        return result.rows.map((row) => ({
          ...mapTenant(row),
          roleKey: row.role_key,
        }));
      },
    );
  }

  private rethrowKnownDatabaseError(error: unknown, fallbackMessage: string): never {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      throw new AuthApiError(409, "CONFLICT", "该邮箱或工作区信息已存在，请更换后重试");
    }

    if (error instanceof AuthApiError) {
      throw error;
    }

    throw new Error(fallbackMessage);
  }
}
