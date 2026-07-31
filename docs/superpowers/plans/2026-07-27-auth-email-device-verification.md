# Auth Email and Device Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Brevo-backed registration email verification and 30-day localStorage trusted-device verification to the v2 auth flow, with OTP required for unverified users, new devices, expired trust, and the approved anomaly rule.

**Architecture:** Store one-time email challenges and account-level trusted-device token hashes in Postgres. Keep cryptography/fingerprinting and Brevo transport in focused modules, while `AuthService` owns database transactions and session issuance. Return an opaque device token only after OTP success; the centralized frontend auth client stores it in `localStorage` and sends it only with password login.

**Tech Stack:** TypeScript, Fastify 5, Zod 4, PostgreSQL, React 19, Vitest, Testing Library, Vite, Node built-in `crypto` and `fetch`, Docker Compose v2.

---

## File Map

Create:

- `packages/db/migrations/000054_auth_email_device_verification.sql` - challenge and trusted-device schema.
- `packages/db/test/auth-email-device-migration.test.ts` - migration SQL and database shape regression tests.
- `apps/api/src/modules/auth/auth-verification.ts` - OTP, opaque token, email masking, browser/OS fingerprint, and IP network hashing.
- `apps/api/test/auth-verification.test.ts` - deterministic unit tests for verification primitives.
- `apps/api/src/modules/auth/auth-email-sender.ts` - `AuthEmailSender` interface and Brevo implementation.
- `apps/api/test/auth-email-sender.test.ts` - Brevo request, timeout, and error mapping tests.
- `src/services/v2AuthClient.test.ts` - auth result union and trusted-device storage tests.
- `src/auth/EmailVerificationStep.tsx` - shared six-digit verification UI.

Modify:

- `apps/api/src/config/env.ts` - parse and validate `BREVO_*` server variables.
- `apps/api/test/env.test.ts` - production environment requirements.
- `apps/api/src/app.ts` - inject the production or test auth email sender.
- `apps/api/src/modules/auth/auth.schemas.ts` - trusted-device login input and verify/resend schemas.
- `apps/api/src/modules/auth/auth.routes.ts` - HTTP 202 challenge responses and verify/resend routes.
- `apps/api/src/modules/auth/auth.service.ts` - challenge lifecycle, trusted-device decisions, and post-OTP session creation.
- `apps/api/test/auth.test.ts` - end-to-end auth database behavior.
- `src/services/v2AuthClient.ts` - discriminated auth results, verify/resend calls, and device token storage.
- `src/auth/useAuth.ts` - verification-aware auth context methods.
- `src/auth/AuthProvider.tsx` - verification-aware state transitions.
- `src/auth/AuthProvider.test.tsx` - pending verification and successful verify state tests.
- `src/auth/LoginPage.tsx` - switch between credentials and verification steps.
- `src/auth/RegisterPage.tsx` - prevent workspace navigation until OTP succeeds.
- `src/auth/AuthPages.test.tsx` - login/register verification interaction tests.
- `docker-compose.staging.yml` - inject `BREVO_*` into API/worker environment map.
- `docs/STAGING_ENV_TEMPLATE.md` - document secret markers and auth smoke checks.
- `docs/staging-runbook.md` - deployment and real-mail smoke procedure.
- `PROJECT_RECORD.md` - record completed behavior, migration, validation, and known localStorage risk.

## Task 1: Add Authentication Verification Tables

**Files:**

- Create: `packages/db/test/auth-email-device-migration.test.ts`
- Create: `packages/db/migrations/000054_auth_email_device_verification.sql`

- [ ] **Step 1: Write the failing migration test**

Create a database-backed test following `packages/db/test/iam.test.ts`:

```ts
import { afterAll, describe, expect, test } from "vitest";
import { createPgPool } from "../src/db.js";
import { runMigrations } from "../src/migrator.js";
import { hasDatabaseEnv, withDatabase } from "./helpers.js";

const originalDatabaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = hasDatabaseEnv() ? describe : describe.skip;

afterAll(() => {
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
});

describeWithDatabase("000054 auth email and device verification", () => {
  test("creates server-only challenge and account trusted-device tables", async () => {
    await withDatabase(async ({ databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const pool = createPgPool();
      try {
        await runMigrations(pool);
        const tables = await pool.query<{ table_name: string }>(`
          SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name IN ('auth_email_challenges', 'auth_trusted_devices')
          ORDER BY table_name
        `);
        expect(tables.rows.map((row) => row.table_name)).toEqual([
          "auth_email_challenges",
          "auth_trusted_devices",
        ]);

        const trustedColumns = await pool.query<{ column_name: string }>(`
          SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'auth_trusted_devices'
        `);
        expect(trustedColumns.rows.map((row) => row.column_name)).toContain("token_hash");
        expect(trustedColumns.rows.map((row) => row.column_name)).not.toContain("tenant_id");
      } finally {
        await pool.end();
      }
    });
  });
});
```

- [ ] **Step 2: Run the database test and verify the red state**

Run: `npm run test --workspace @aigc-flow/db -- auth-email-device-migration.test.ts`

Expected: FAIL because the two auth verification tables do not exist. If `DATABASE_URL` is absent and the suite skips, start the documented local Postgres with `npm run dev:infra`, export the local `DATABASE_URL`, and rerun before treating the red step as observed.

- [ ] **Step 3: Create migration 000054**

Create both tables with explicit constraints and indexes:

```sql
CREATE TABLE auth_email_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN (
    'registration',
    'email_verification',
    'login_device_verification'
  )),
  reason text NOT NULL CHECK (reason IN (
    'email_unverified',
    'new_device',
    'trust_expired',
    'anomalous_login'
  )),
  challenge_token_hash text NOT NULL UNIQUE,
  code_hash text NOT NULL,
  attempts_remaining integer NOT NULL DEFAULT 5 CHECK (attempts_remaining >= 0),
  last_sent_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX auth_email_challenges_user_created_idx
  ON auth_email_challenges (user_id, created_at DESC);
CREATE INDEX auth_email_challenges_active_expiry_idx
  ON auth_email_challenges (expires_at)
  WHERE consumed_at IS NULL;

CREATE TABLE auth_trusted_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  user_agent_fingerprint_hash text,
  ip_network_hash text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  trusted_until timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX auth_trusted_devices_user_active_idx
  ON auth_trusted_devices (user_id, trusted_until DESC)
  WHERE revoked_at IS NULL;
CREATE INDEX auth_trusted_devices_expiry_idx
  ON auth_trusted_devices (trusted_until)
  WHERE revoked_at IS NULL;
```

Do not enable tenant RLS on these two tables. They are pre-authentication, server-only records; `auth_trusted_devices` is intentionally account-scoped and has no `tenant_id`.

- [ ] **Step 4: Run the migration test and database build**

Run: `npm run test --workspace @aigc-flow/db -- auth-email-device-migration.test.ts`

Expected: PASS with one database test.

Run: `npm run build --workspace @aigc-flow/db`

Expected: PASS.

- [ ] **Step 5: Commit the migration**

```bash
git add packages/db/migrations/000054_auth_email_device_verification.sql packages/db/test/auth-email-device-migration.test.ts
git commit -m "feat(db): add auth verification records"
```

## Task 2: Implement OTP, Token, and Device Fingerprint Primitives

**Files:**

- Create: `apps/api/test/auth-verification.test.ts`
- Create: `apps/api/src/modules/auth/auth-verification.ts`

- [ ] **Step 1: Write failing primitive tests**

Cover exact public behavior:

```ts
import { describe, expect, test } from "vitest";
import {
  buildDeviceFingerprint,
  generateNumericCode,
  hashIpNetwork,
  hashOpaqueToken,
  hashVerificationCode,
  maskEmail,
} from "../src/modules/auth/auth-verification.js";

describe("auth verification primitives", () => {
  test("generates a six-digit code", () => {
    expect(generateNumericCode()).toMatch(/^\d{6}$/);
  });

  test("binds an OTP hash to the challenge and server secret", () => {
    expect(hashVerificationCode("challenge-a", "123456", "secret"))
      .not.toBe(hashVerificationCode("challenge-b", "123456", "secret"));
  });

  test("hashes opaque tokens deterministically", () => {
    expect(hashOpaqueToken("token-a")).toMatch(/^[a-f0-9]{64}$/);
    expect(hashOpaqueToken("token-a")).toBe(hashOpaqueToken("token-a"));
  });

  test("normalizes browser and OS without browser version", () => {
    expect(buildDeviceFingerprint("Mozilla/5.0 (Windows NT 10.0) Chrome/140.0"))
      .toBe("chrome:windows:desktop");
  });

  test("uses IPv4 /24 and IPv6 /56 networks", () => {
    expect(hashIpNetwork("203.0.113.7")).toBe(hashIpNetwork("203.0.113.220"));
    expect(hashIpNetwork("203.0.114.7")).not.toBe(hashIpNetwork("203.0.113.7"));
    expect(hashIpNetwork("2001:db8:1234:5601::1")).toBe(
      hashIpNetwork("2001:db8:1234:56ff::9"),
    );
  });

  test("masks an email without losing the domain", () => {
    expect(maskEmail("alice@example.com")).toBe("a***@example.com");
  });
});
```

- [ ] **Step 2: Run the primitive tests and verify failure**

Run: `npm run test --workspace @aigc-flow/api -- auth-verification.test.ts`

Expected: FAIL because `auth-verification.ts` does not exist.

- [ ] **Step 3: Implement the focused verification module**

Export these constants and functions:

```ts
export const EMAIL_CODE_TTL_SECONDS = 600;
export const EMAIL_CODE_MAX_ATTEMPTS = 5;
export const EMAIL_CODE_RESEND_COOLDOWN_SECONDS = 60;
export const TRUSTED_DEVICE_TTL_SECONDS = 60 * 60 * 24 * 30;

export function generateNumericCode(): string;
export function generateOpaqueToken(): string;
export function hashOpaqueToken(token: string): string;
export function hashVerificationCode(challengeId: string, code: string, secret: string): string;
export function maskEmail(email: string): string;
export function buildDeviceFingerprint(userAgent?: string | null): string | null;
export function hashDeviceFingerprint(userAgent?: string | null): string | null;
export function hashIpNetwork(ipAddress?: string | null): string | null;
```

Use `randomInt(0, 1_000_000)`, `randomBytes(32).toString("base64url")`, `createHash("sha256")`, and `createHmac("sha256", secret)`. Prefix the OTP HMAC input with `tapflow-auth-email-code:v1:`. Normalize Chrome, Edge, Firefox, Safari, and Opera; normalize Windows, macOS, iOS, Android, and Linux; exclude version numbers. Parse IPv4 into the first three octets and IPv6 into a 128-bit value whose lowest 72 bits are zeroed before hashing the normalized network string.

- [ ] **Step 4: Run focused tests and API build**

Run: `npm run test --workspace @aigc-flow/api -- auth-verification.test.ts`

Expected: PASS with six tests.

Run: `npm run build --workspace @aigc-flow/api`

Expected: PASS.

- [ ] **Step 5: Commit verification primitives**

```bash
git add apps/api/src/modules/auth/auth-verification.ts apps/api/test/auth-verification.test.ts
git commit -m "feat(api): add auth verification primitives"
```

## Task 3: Add the Brevo Auth Email Sender and Environment Validation

**Files:**

- Create: `apps/api/test/auth-email-sender.test.ts`
- Create: `apps/api/src/modules/auth/auth-email-sender.ts`
- Modify: `apps/api/test/env.test.ts`
- Modify: `apps/api/src/config/env.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Write failing Brevo and environment tests**

The sender test must stub `fetch` and assert the request without printing the key:

```ts
test("sends a transactional verification email through Brevo", async () => {
  const fetchMock = vi.fn(async () => new Response(null, { status: 201 }));
  vi.stubGlobal("fetch", fetchMock);
  const sender = new BrevoAuthEmailSender({
    apiKey: "test-brevo-key",
    fromEmail: "no-reply@auth.aittco.com",
    fromName: "Art-Aittco",
  });

  await sender.sendVerificationCode({
    code: "123456",
    email: "alice@example.com",
    expiresInMinutes: 10,
  });

  expect(fetchMock).toHaveBeenCalledWith(
    "https://api.brevo.com/v3/smtp/email",
    expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ "api-key": "test-brevo-key" }),
    }),
  );
});
```

Add environment tests:

```ts
test("requires Brevo auth mail configuration in production", () => {
  withRequiredProductionEnv();
  expect(() => getApiEnv()).toThrow("BREVO_API_KEY is required");
});

test("reads complete Brevo auth mail configuration", () => {
  withRequiredProductionEnv({
    BREVO_API_KEY: "test-brevo-key",
    BREVO_FROM_EMAIL: "no-reply@auth.aittco.com",
    BREVO_FROM_NAME: "Art-Aittco",
  });
  expect(getApiEnv()).toMatchObject({
    brevoApiKey: "test-brevo-key",
    brevoFromEmail: "no-reply@auth.aittco.com",
    brevoFromName: "Art-Aittco",
  });
});
```

Update `withRequiredProductionEnv` so tests unrelated to missing Brevo variables explicitly include the three test values; isolate the missing-variable test by deleting only `BREVO_API_KEY`.

- [ ] **Step 2: Run sender and environment tests and verify failure**

Run: `npm run test --workspace @aigc-flow/api -- auth-email-sender.test.ts env.test.ts`

Expected: FAIL because the sender and `ApiEnv` fields do not exist.

- [ ] **Step 3: Implement the sender interface and Brevo transport**

Use this public contract:

```ts
export type SendVerificationCodeInput = {
  code: string;
  email: string;
  expiresInMinutes: number;
};

export interface AuthEmailSender {
  sendVerificationCode(input: SendVerificationCodeInput): Promise<void>;
}

export class AuthEmailDeliveryError extends Error {}

export class BrevoAuthEmailSender implements AuthEmailSender {
  constructor(options: {
    apiKey: string;
    fetchImpl?: typeof fetch;
    fromEmail: string;
    fromName: string;
    timeoutMs?: number;
  });
  sendVerificationCode(input: SendVerificationCodeInput): Promise<void>;
}
```

Send both `htmlContent` and `textContent`, set a 10-second `AbortController` timeout, and map non-2xx, timeout, and network failures to `AuthEmailDeliveryError("Verification email delivery failed")`. Never include response bodies, API keys, the code, or full recipient address in the error.

- [ ] **Step 4: Parse production Brevo environment and inject the sender**

Add optional `brevoApiKey`, `brevoFromEmail`, and `brevoFromName` fields to `ApiEnv` so existing test env objects remain source-compatible. `getApiEnv()` must return the parsed strings and throw in production when any is empty.

Extend `buildApp`:

```ts
export function buildApp(options?: {
  authEmailSender?: AuthEmailSender;
  // preserve existing options
}) {
  const authEmailSender = options?.authEmailSender ?? new BrevoAuthEmailSender({
    apiKey: env.brevoApiKey ?? "",
    fromEmail: env.brevoFromEmail ?? "",
    fromName: env.brevoFromName ?? "",
  });
  const authService = new AuthService({ authEmailSender, env, pool });
}
```

- [ ] **Step 5: Run focused tests and API build**

Run: `npm run test --workspace @aigc-flow/api -- auth-email-sender.test.ts env.test.ts`

Expected: PASS.

Run: `npm run build --workspace @aigc-flow/api`

Expected: PASS.

- [ ] **Step 6: Commit the sender and environment wiring**

```bash
git add apps/api/src/modules/auth/auth-email-sender.ts apps/api/test/auth-email-sender.test.ts apps/api/src/config/env.ts apps/api/test/env.test.ts apps/api/src/app.ts
git commit -m "feat(api): add Brevo auth email sender"
```

## Task 4: Change Registration into a Pending Email Challenge

**Files:**

- Modify: `apps/api/test/auth.test.ts`
- Modify: `apps/api/src/modules/auth/auth.service.ts`
- Modify: `apps/api/src/modules/auth/auth.routes.ts`

- [ ] **Step 1: Add a reusable fake sender and failing registration test**

Add this test helper near `buildTestApp`:

```ts
class CapturingAuthEmailSender implements AuthEmailSender {
  readonly messages: SendVerificationCodeInput[] = [];
  async sendVerificationCode(input: SendVerificationCodeInput) {
    this.messages.push(input);
  }
  latestCode(email: string) {
    return [...this.messages].reverse().find((item) => item.email === email)?.code;
  }
}

function buildTestApp(pool: ReturnType<typeof createPgPool>) {
  const authEmailSender = new CapturingAuthEmailSender();
  return {
    api: buildApp({ authEmailSender, env: testEnv, logger: false, pool }),
    authEmailSender,
  };
}
```

Replace the old immediate-session registration expectation with:

```ts
expect(response.statusCode).toBe(202);
expect(response.json()).toMatchObject({
  status: "verification_required",
  emailMasked: "a***@example.com",
  expiresInSeconds: 600,
  resendAvailableInSeconds: 60,
  reason: "email_unverified",
});
expect(response.json().accessToken).toBeUndefined();
expect(response.json().refreshToken).toBeUndefined();
expect(authEmailSender.latestCode("alice@example.com")).toMatch(/^\d{6}$/);

const sessionCount = await adminPool.query<{ total: number }>(
  "SELECT COUNT(*)::int AS total FROM auth_sessions",
);
expect(sessionCount.rows[0]?.total).toBe(0);
```

- [ ] **Step 2: Run the registration test and verify failure**

Run: `npm run test --workspace @aigc-flow/api -- auth.test.ts -t "register creates a pending email challenge"`

Expected: FAIL because registration still returns tokens and creates a session.

- [ ] **Step 3: Implement pending registration**

Change `AuthService` construction to require `authEmailSender`. In `register`:

1. Normalize email to lowercase.
2. Create only user, tenant, owner membership, and challenge in the tenant transaction.
3. Generate the challenge ID, opaque challenge token, and six-digit code before the transaction.
4. Store only `hashOpaqueToken(challengeToken)` and `hashVerificationCode(challengeId, code, env.jwtRefreshSecret)`.
5. Commit before calling Brevo; call `sendVerificationCode` with the raw code.
6. On delivery failure throw `AuthApiError(503, "EMAIL_DELIVERY_FAILED", "验证码邮件发送失败，请稍后重试")`.
7. Return the 202 response shape without user, tenant, access token, refresh token, or device token.

Record `auth.register_verification_requested` audit metadata with only `reason`, `tenantId`, and challenge ID. Do not include code, challenge token, email, or Brevo details.

- [ ] **Step 4: Return HTTP 202 from the register route**

Change the route result from `reply.code(201)` to `reply.code(202)`. Preserve the standard error wrapper and auth rate limit.

- [ ] **Step 5: Run the focused registration test**

Run: `npm run test --workspace @aigc-flow/api -- auth.test.ts -t "register creates a pending email challenge"`

Expected: PASS.

- [ ] **Step 6: Commit pending registration**

```bash
git add apps/api/src/modules/auth/auth.service.ts apps/api/src/modules/auth/auth.routes.ts apps/api/test/auth.test.ts
git commit -m "feat(auth): require email verification on registration"
```

## Task 5: Verify and Resend Email Challenges Atomically

**Files:**

- Modify: `apps/api/src/modules/auth/auth.schemas.ts`
- Modify: `apps/api/src/modules/auth/auth.routes.ts`
- Modify: `apps/api/src/modules/auth/auth.service.ts`
- Modify: `apps/api/test/auth.test.ts`

- [ ] **Step 1: Write failing verify and resend API tests**

Add tests that prove:

```ts
const registration = await api.inject({
  method: "POST",
  url: "/api/v2/auth/register",
  payload: { email, password: "StrongPass123!", tenantName: "Verified Tenant" },
});
const challengeToken = registration.json().challengeToken;
const code = authEmailSender.latestCode(email);

const verified = await api.inject({
  method: "POST",
  url: "/api/v2/auth/email/verify",
  payload: { challengeToken, code },
});
expect(verified.statusCode).toBe(200);
expect(verified.json()).toMatchObject({
  accessToken: expect.any(String),
  refreshToken: expect.any(String),
  trustedDeviceToken: expect.any(String),
});

const replay = await api.inject({
  method: "POST",
  url: "/api/v2/auth/email/verify",
  payload: { challengeToken, code },
});
expect(replay.statusCode).toBe(410);
expect(replay.json().error.code).toBe("VERIFICATION_EXPIRED");
```

Add separate tests for wrong code decrementing from 5 to 4, fifth failure returning `VERIFICATION_ATTEMPTS_EXHAUSTED`, expired challenge, resend within 60 seconds returning 429, resend after moving `last_sent_at` back 61 seconds, and Brevo failure returning 503 without creating a session.

- [ ] **Step 2: Run verify/resend tests and verify failure**

Run: `npm run test --workspace @aigc-flow/api -- auth.test.ts -t "email verification|resend verification|verification attempts"`

Expected: FAIL because the schemas and routes do not exist.

- [ ] **Step 3: Add strict request schemas**

```ts
export const verifyEmailSchema = z.object({
  challengeToken: z.string().min(32).max(512),
  code: z.string().regex(/^\d{6}$/),
});

export const resendEmailSchema = z.object({
  challengeToken: z.string().min(32).max(512),
});
```

Export the inferred `VerifyEmailInput` and `ResendEmailInput` types.

- [ ] **Step 4: Implement atomic `verifyEmail`**

Use a raw pool client transaction because the challenge is accessed before authentication. Query by `challenge_token_hash` with `FOR UPDATE`. In this order:

1. Reject missing, consumed, or expired rows with HTTP 410 `VERIFICATION_EXPIRED`.
2. Reject `attempts_remaining = 0` with HTTP 429 `VERIFICATION_ATTEMPTS_EXHAUSTED`.
3. Compare the HMAC using `timingSafeEqual` through a helper exported from `auth-verification.ts`.
4. On mismatch decrement attempts atomically and return 400 `VERIFICATION_INVALID`, or 429 when the new count is zero.
5. On match set `consumed_at`, set `users.email_verified_at = COALESCE(email_verified_at, now())`, create the session and refresh token, and insert a trusted-device record with a 30-day expiry.
6. Commit, sign the access token, resolve permissions, and return the session plus the one-time raw `trustedDeviceToken`.

Extract private `createSessionRecords(client, userId, tenantId, metadata)` and `buildTokensResponse(...)` helpers so registration verification and trusted login do not duplicate session SQL.

- [ ] **Step 5: Implement `resendEmail`**

Lock the challenge row by hashed challenge token. Reject missing/consumed/expired-retention challenges with `VERIFICATION_EXPIRED`; enforce `last_sent_at + 60 seconds`. Generate a new code, update its HMAC, reset attempts to 5 and expiry to 10 minutes, commit, then send through Brevo. A delivery failure returns `EMAIL_DELIVERY_FAILED` and never creates a session. Return the same challenge token plus refreshed timing metadata.

- [ ] **Step 6: Register verify and resend routes**

Add:

```ts
app.post("/api/v2/auth/email/verify", authRateLimitConfig, async (request, reply) => {
  const body = parseBody<VerifyEmailInput>(request, verifyEmailSchema);
  return reply.send(await app.authService.verifyEmail(body, requestMetadata(request)));
});

app.post("/api/v2/auth/email/resend", authRateLimitConfig, async (request, reply) => {
  const body = parseBody<ResendEmailInput>(request, resendEmailSchema);
  return reply.send(await app.authService.resendEmail(body));
});
```

Extract `requestMetadata(request)` in `auth.routes.ts` to avoid repeating IP, request ID, trace ID, and user agent assembly.

- [ ] **Step 7: Convert existing auth tests to verified registration**

Add a `registerAndVerify` helper that performs both requests using the captured code and returns the verify response. Replace existing setup calls that require tokens with this helper. Keep the dedicated pending-registration test unverified.

- [ ] **Step 8: Run the complete API auth suite**

Run: `npm run test --workspace @aigc-flow/api -- auth.test.ts auth-verification.test.ts auth-email-sender.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit challenge verification**

```bash
git add apps/api/src/modules/auth/auth.schemas.ts apps/api/src/modules/auth/auth.routes.ts apps/api/src/modules/auth/auth.service.ts apps/api/src/modules/auth/auth-verification.ts apps/api/test/auth.test.ts
git commit -m "feat(auth): verify and resend email challenges"
```

## Task 6: Gate Login by Trusted Device and Approved Anomaly Rule

**Files:**

- Modify: `apps/api/src/modules/auth/auth.schemas.ts`
- Modify: `apps/api/src/modules/auth/auth.service.ts`
- Modify: `apps/api/test/auth.test.ts`

- [ ] **Step 1: Write failing trusted-device login tests**

Use `registerAndVerify` to obtain a device token. Cover these exact cases:

```ts
const trustedLogin = await api.inject({
  method: "POST",
  url: "/api/v2/auth/login",
  headers: { "user-agent": WINDOWS_CHROME_UA },
  payload: { email, password, trustedDeviceToken },
});
expect(trustedLogin.statusCode).toBe(200);
expect(trustedLogin.json().accessToken).toEqual(expect.any(String));

const newDeviceLogin = await api.inject({
  method: "POST",
  url: "/api/v2/auth/login",
  payload: { email, password },
});
expect(newDeviceLogin.statusCode).toBe(202);
expect(newDeviceLogin.json().reason).toBe("new_device");
```

Also cover historical `email_verified_at IS NULL`, expired device, revoked device, only UA change, only IP `/24` change, and both UA plus IP network change. Set `TRUST_PROXY` behavior in injection tests with `x-forwarded-for` only where the Fastify test app is configured to trust it; otherwise call the service with explicit metadata for the IP matrix.

- [ ] **Step 2: Run trusted-device tests and verify failure**

Run: `npm run test --workspace @aigc-flow/api -- auth.test.ts -t "trusted device|new device|anomalous login|historical unverified"`

Expected: FAIL because login ignores trusted devices.

- [ ] **Step 3: Extend login schema**

```ts
export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(256),
  tenantId: z.string().uuid().optional(),
  trustedDeviceToken: z.string().min(32).max(512).optional(),
});
```

- [ ] **Step 4: Implement the login decision**

After password and membership validation:

1. If `email_verified_at` is null, create and send an `email_verification` challenge with reason `email_unverified` and return the 202 result.
2. If no token is supplied or its hash does not belong to this user, create a `login_device_verification` challenge with reason `new_device`.
3. If the record is revoked or `trusted_until <= now()`, create a challenge with reason `trust_expired`.
4. Compare stored fingerprint/network hashes with current hashes. Only when both stored values are non-null and both differ, create a challenge with reason `anomalous_login`.
5. Otherwise update only `last_seen_at`, create the normal session and return tokens. Do not update the trusted fingerprint or network baseline without OTP.

All challenge outcomes return HTTP 202 from the existing login route. Password errors remain `INVALID_CREDENTIALS` and must not send mail.

- [ ] **Step 5: Run the full auth suite and API build**

Run: `npm run test --workspace @aigc-flow/api -- auth.test.ts auth-verification.test.ts auth-email-sender.test.ts env.test.ts`

Expected: PASS.

Run: `npm run build --workspace @aigc-flow/api`

Expected: PASS.

- [ ] **Step 6: Commit trusted-device login**

```bash
git add apps/api/src/modules/auth/auth.schemas.ts apps/api/src/modules/auth/auth.service.ts apps/api/test/auth.test.ts
git commit -m "feat(auth): verify new and anomalous login devices"
```

## Task 7: Add Frontend Auth Results and Trusted-Device Storage

**Files:**

- Create: `src/services/v2AuthClient.test.ts`
- Modify: `src/services/v2AuthClient.ts`
- Modify: `src/auth/useAuth.ts`
- Modify: `src/auth/AuthProvider.tsx`
- Modify: `src/auth/AuthProvider.test.tsx`

- [ ] **Step 1: Write failing client storage and request tests**

Test these public behaviors:

```ts
test("includes the stored trusted device token on login", async () => {
  setStoredTrustedDeviceToken("trusted-device-token-1234567890123456");
  vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({
    status: "verification_required",
    challengeToken: "challenge-token-12345678901234567890",
    emailMasked: "a***@example.com",
    expiresInSeconds: 600,
    resendAvailableInSeconds: 60,
    reason: "new_device",
  }, { status: 202 }))));

  await login({ email: "alice@example.com", password: "StrongPass123!" });
  expect(fetch).toHaveBeenCalledWith(
    "/api/v2/auth/login",
    expect.objectContaining({
      body: expect.stringContaining("trusted-device-token-1234567890123456"),
    }),
  );
});

test("stores the trusted token only after successful verification", async () => {
  // Stub a successful /auth/email/verify response with auth tokens and a device token.
  await verifyEmail({ challengeToken: "challenge-token-12345678901234567890", code: "123456" });
  expect(getStoredTrustedDeviceToken()).toBe("trusted-device-token-1234567890123456");
});
```

Add provider tests showing `register` and `login` can return a pending challenge without setting `authenticated`, and `verifyEmail` sets the session only after `getMe` succeeds.

- [ ] **Step 2: Run focused frontend tests and verify failure**

Run: `npm test -- src/services/v2AuthClient.test.ts src/auth/AuthProvider.test.tsx`

Expected: FAIL because the union types and device storage functions do not exist.

- [ ] **Step 3: Implement client types and storage**

Add:

```ts
export type VerificationRequired = {
  status: "verification_required";
  challengeToken: string;
  emailMasked: string;
  expiresInSeconds: number;
  resendAvailableInSeconds: number;
  reason: "email_unverified" | "new_device" | "trust_expired" | "anomalous_login";
};

export type AuthenticatedResult = { status: "authenticated"; session: AuthSession };
export type AuthAttemptResult = AuthenticatedResult | VerificationRequired;
```

Centralize the key as `v2-trusted-device-token`. Export `getStoredTrustedDeviceToken`, `setStoredTrustedDeviceToken`, and `clearStoredTrustedDeviceToken`. `clearStoredAuth()` and normal logout must not clear it.

Make `register()` and `login()` inspect the discriminant. `login()` automatically adds the stored trusted token to its body. Add `verifyEmail()` and `resendEmailVerification()`. On successful verification, store access, refresh, and trusted-device tokens before calling `getMe()`.

- [ ] **Step 4: Make the auth context verification-aware**

Change the context contract:

```ts
register(input): Promise<AuthAttemptResult>;
login(input): Promise<AuthAttemptResult>;
verifyEmail(input: { challengeToken: string; code: string }): Promise<void>;
resendEmailVerification(input: { challengeToken: string }): Promise<VerificationRequired>;
```

In `AuthProvider`, pending results leave `session` null and return the challenge. Authenticated results set the returned session. `verifyEmail` calls the client, sets the session, then performs `loadCurrentSession()`.

- [ ] **Step 5: Run client/provider tests**

Run: `npm test -- src/services/v2AuthClient.test.ts src/auth/AuthProvider.test.tsx src/services/v2HttpClient.test.ts`

Expected: PASS, including the existing refresh-token behavior.

- [ ] **Step 6: Commit verification-aware frontend auth state**

```bash
git add src/services/v2AuthClient.ts src/services/v2AuthClient.test.ts src/auth/useAuth.ts src/auth/AuthProvider.tsx src/auth/AuthProvider.test.tsx
git commit -m "feat(auth): track email verification in frontend auth"
```

## Task 8: Build the Shared Verification UI and Wire Login/Register Pages

**Files:**

- Create: `src/auth/EmailVerificationStep.tsx`
- Modify: `src/auth/LoginPage.tsx`
- Modify: `src/auth/RegisterPage.tsx`
- Modify: `src/auth/AuthPages.test.tsx`

- [ ] **Step 1: Write failing page interaction tests**

For registration, make the context `register` resolve a pending challenge, enter the form, submit, and assert:

```ts
expect(await screen.findByRole("heading", { name: "验证邮箱" })).toBeTruthy();
expect(screen.getByText("a***@example.com")).toBeTruthy();
expect(window.location.pathname).toBe("/register");
expect(screen.getByRole("button", { name: "确认验证码" })).toBeTruthy();
```

For login, assert a new-device challenge switches to the same step. Enter `123456`, submit, assert `verifyEmail({ challengeToken, code: "123456" })`, and verify navigation occurs only after it resolves. Use fake timers to assert the resend button enables after 60 seconds and calls `resendEmailVerification`.

- [ ] **Step 2: Run auth page tests and verify failure**

Run: `npm test -- src/auth/AuthPages.test.tsx`

Expected: FAIL because pages always navigate immediately and the verification component does not exist.

- [ ] **Step 3: Implement `EmailVerificationStep`**

Use this prop contract:

```ts
type EmailVerificationStepProps = {
  challenge: VerificationRequired;
  error: string | null;
  onBack: () => void;
  onResend: () => Promise<void>;
  onVerify: (code: string) => Promise<void>;
  submitting: boolean;
};
```

Render a stable six-digit input with `inputMode="numeric"`, `autoComplete="one-time-code"`, `maxLength={6}`, a primary `确认验证码` submit button, a text resend button with `重新发送（59 秒）`, and a back button. Reset the countdown from the challenge's `resendAvailableInSeconds` after a successful resend. Clear the input and focus it after `VERIFICATION_INVALID`.

- [ ] **Step 4: Wire both pages**

Keep each page's challenge in component state. On credentials submission:

```ts
const result = await login({ email, password });
if (result.status === "verification_required") {
  setChallenge(result);
  return;
}
navigate(getReturnTo());
```

Registration uses the same discriminated branch and must never navigate on a pending result. Verification calls the context `verifyEmail`, then navigates. Resend replaces challenge timing from the response. Back clears only in-memory challenge/error state and returns to the credentials form.

- [ ] **Step 5: Run page and provider tests**

Run: `npm test -- src/auth/AuthPages.test.tsx src/auth/AuthProvider.test.tsx src/services/v2AuthClient.test.ts`

Expected: PASS.

- [ ] **Step 6: Run the frontend build**

Run: `npm run build`

Expected: PASS with no TypeScript or Vite errors; existing Browserslist/chunk-size warnings are acceptable.

- [ ] **Step 7: Commit auth verification UI**

```bash
git add src/auth/EmailVerificationStep.tsx src/auth/LoginPage.tsx src/auth/RegisterPage.tsx src/auth/AuthPages.test.tsx
git commit -m "feat(auth): add email verification screens"
```

## Task 9: Wire Staging Environment and Operational Documentation

**Files:**

- Modify: `docker-compose.staging.yml`
- Modify: `docs/STAGING_ENV_TEMPLATE.md`
- Modify: `docs/staging-runbook.md`

- [ ] **Step 1: Write the compose configuration change**

Add to `x-tapflow-env`:

```yaml
BREVO_API_KEY: ${BREVO_API_KEY}
BREVO_FROM_EMAIL: ${BREVO_FROM_EMAIL:-no-reply@auth.aittco.com}
BREVO_FROM_NAME: ${BREVO_FROM_NAME:-Art-Aittco}
```

The shared map makes the variables available to API and worker containers. Only the API reads them; keeping the shared pattern avoids a separate environment block and matches current compose conventions.

- [ ] **Step 2: Document environment and smoke checks**

Add an Auth Email Verification subsection to `docs/STAGING_ENV_TEMPLATE.md` with the exact sender values and a secret marker for `BREVO_API_KEY`. Add checkboxes for registration verification, same-device login, new-device login, resend cooldown, and secret-free logs.

Add these commands and manual steps to `docs/staging-runbook.md`:

```bash
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml config >/tmp/tapflow-compose.rendered.yml
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml build
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml stop tapflow-worker
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml run --rm tapflow-api node packages/db/dist/cli.js
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml up -d tapflow-redis tapflow-api tapflow-worker tapflow-frontend
```

The runbook must say not to print the rendered compose file or grep its secret values. Verify with a real mailbox, then inspect only error/action logs for accidental `api-key`, six-digit code fields, or `trustedDeviceToken` field names.

- [ ] **Step 3: Validate rendered compose without exposing secrets**

Run locally with non-secret test values:

```powershell
$env:BREVO_API_KEY='test-brevo-key'
$env:BREVO_FROM_EMAIL='no-reply@auth.aittco.com'
$env:BREVO_FROM_NAME='Art-Aittco'
docker compose -f docker-compose.staging.yml config --quiet
```

Expected: exit code 0 and no rendered secret output.

- [ ] **Step 4: Commit deployment configuration**

```bash
git add docker-compose.staging.yml docs/STAGING_ENV_TEMPLATE.md docs/staging-runbook.md
git commit -m "docs(auth): wire Brevo staging verification"
```

## Task 10: Full Verification, Project Record, and Completion Audit

**Files:**

- Modify: `PROJECT_RECORD.md`
- Review: all files listed in this plan

- [ ] **Step 1: Run focused frontend tests**

Run:

```bash
npm test -- src/services/v2HttpClient.test.ts src/services/v2AuthClient.test.ts src/auth/AuthProvider.test.tsx src/auth/AuthPages.test.tsx src/auth/AuthGate.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run the API auth and environment tests**

Run:

```bash
npm run test --workspace @aigc-flow/api -- auth.test.ts auth-verification.test.ts auth-email-sender.test.ts env.test.ts
```

Expected: PASS. If database-backed cases skip, record that exact skip and do not claim database integration validation.

- [ ] **Step 3: Run database tests**

Run:

```bash
npm run test --workspace @aigc-flow/db -- auth-email-device-migration.test.ts iam.test.ts migrator.test.ts
```

Expected: PASS when local Postgres is configured. Historical migration assertions that intentionally cover only the original migration fixture must remain unchanged unless the new migration actually invalidates them.

- [ ] **Step 4: Run full builds and relevant full suites**

Run:

```bash
npm run build --workspace @aigc-flow/db
npm run build --workspace @aigc-flow/api
npm run test --workspace @aigc-flow/api
npm run build
```

Expected: all commands PASS. Existing non-fatal Browserslist, dynamic import, or chunk-size warnings may remain documented.

- [ ] **Step 5: Audit secret and device-token exposure**

Run:

```bash
rg -n "BREVO_API_KEY|trustedDeviceToken|challengeToken|code_hash|api-key" apps/api/src src docker-compose.staging.yml docs/STAGING_ENV_TEMPLATE.md
```

Inspect every match. Accept only environment parsing, request/response types, hashing/storage code, and secret-marker documentation. Reject logs, audit metadata, node/canvas data, Authorization headers, hard-coded real keys, and raw token persistence outside the centralized frontend key.

- [ ] **Step 6: Update `PROJECT_RECORD.md`**

Add a dated `2026-07-27 - Brevo Email And Device Verification` entry recording:

- registration email verification before session issuance;
- historical unverified-user behavior;
- new-device, 30-day trust, and anomaly rule;
- migration `000054` and the intentional account-level trusted-device table;
- server-only Brevo environment variables;
- localStorage XSS risk and the fact that the device token cannot authenticate without a password;
- every validation command and whether DB/staging real-mail smoke was completed or still pending.

- [ ] **Step 7: Commit the project record**

```bash
git add PROJECT_RECORD.md
git commit -m "docs: record auth email verification rollout"
```

- [ ] **Step 8: Perform the completion audit**

Use the design spec as a checklist and verify current code or test evidence for every item: registration gate, historical users, trusted-device lifetime, anomaly decision, hashing, secret containment, frontend flow, compose injection, docs, tests, and build. Do not mark the goal complete while a required item lacks evidence. Staging real-mail smoke may be reported as pending only if the user has not authorized or provided access for deployment; code completion must still include the documented smoke procedure.
