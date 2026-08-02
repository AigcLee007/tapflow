# Password Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an email-code password reset flow that updates the password, consumes the one-time challenge, and revokes every existing user session.

**Architecture:** Extend the existing hashed `auth_email_challenges` mechanism with a global `password_reset` purpose, expose request/resend/confirm endpoints through the v2 auth module, and add a two-state public recovery page. Reuse the current Resend transport and auth-page primitives; keep recovery state out of `AuthProvider` because reset never authenticates the browser.

**Tech Stack:** PostgreSQL migrations, Fastify, Zod, TypeScript, Resend HTTP API, React, Vite, Vitest, Testing Library, Playwright.

---

## File Map

- Create `packages/db/migrations/000060_password_reset_challenges.sql`: extend challenge constraints.
- Create `packages/db/test/password-reset-migration.test.ts`: migration contract coverage.
- Modify `apps/api/src/modules/auth/auth.schemas.ts`: request/resend/confirm validation and types.
- Modify `apps/api/src/modules/auth/auth-email-sender.ts`: dedicated reset email contract and Resend payload.
- Modify `apps/api/src/modules/auth/auth.service.ts`: challenge lifecycle, password update, and session revocation.
- Modify `apps/api/src/modules/auth/auth.routes.ts`: three rate-limited public endpoints.
- Modify `apps/api/test/auth-email-sender.test.ts`: reset email transport coverage.
- Modify `apps/api/test/auth.test.ts`: database-backed reset integration coverage.
- Modify `src/services/v2AuthClient.ts`: typed reset client calls.
- Modify `src/services/v2AuthClient.test.ts`: endpoint and no-token-mutation coverage.
- Create `src/auth/ForgotPasswordPage.tsx`: request and confirmation UI.
- Modify `src/auth/LoginPage.tsx`: recovery link and reusable field capabilities.
- Modify `src/auth/AuthPages.test.tsx`: recovery page interaction coverage.
- Modify `src/app/routes.ts`: public route constant.
- Modify `src/app/AppRouter.tsx`: public route mount.
- Modify `PROJECT_RECORD.md`: completed capability and validation record.

### Task 1: Password-reset migration

**Files:**
- Create: `packages/db/test/password-reset-migration.test.ts`
- Create: `packages/db/migrations/000060_password_reset_challenges.sql`

- [ ] **Step 1: Write the failing migration contract test**

```ts
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";

describe("000060_password_reset_challenges.sql", () => {
  test("adds password_reset without dropping existing challenge values", async () => {
    const sql = await readFile(
      path.resolve(import.meta.dirname, "../migrations/000060_password_reset_challenges.sql"),
      "utf8",
    );

    for (const value of [
      "registration",
      "email_verification",
      "login_device_verification",
      "email_unverified",
      "new_device",
      "trust_expired",
      "anomalous_login",
      "password_reset",
    ]) {
      expect(sql).toContain(`'${value}'`);
    }
    expect(sql).toContain("auth_email_challenges_purpose_check");
    expect(sql).toContain("auth_email_challenges_reason_check");
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npx vitest run packages/db/test/password-reset-migration.test.ts`

Expected: FAIL because `000060_password_reset_challenges.sql` does not exist.

- [ ] **Step 3: Add the forward-only constraint migration**

```sql
ALTER TABLE auth_email_challenges
  DROP CONSTRAINT auth_email_challenges_purpose_check,
  ADD CONSTRAINT auth_email_challenges_purpose_check CHECK (
    purpose IN ('registration', 'email_verification', 'login_device_verification', 'password_reset')
  ),
  DROP CONSTRAINT auth_email_challenges_reason_check,
  ADD CONSTRAINT auth_email_challenges_reason_check CHECK (
    reason IN ('email_unverified', 'new_device', 'trust_expired', 'anomalous_login', 'password_reset')
  );
```

- [ ] **Step 4: Run focused and DB migration tests**

Run: `npx vitest run packages/db/test/password-reset-migration.test.ts packages/db/test/auth-email-device-migration.test.ts`

Expected: PASS; database-backed assertions may report skipped when `DATABASE_URL` is absent.

- [ ] **Step 5: Commit the migration**

```bash
git add packages/db/migrations/000060_password_reset_challenges.sql packages/db/test/password-reset-migration.test.ts
git commit -m "feat(auth): add password reset challenge purpose"
```

### Task 2: Password-reset email transport

**Files:**
- Modify: `apps/api/test/auth-email-sender.test.ts`
- Modify: `apps/api/src/modules/auth/auth-email-sender.ts`
- Modify: `apps/api/test/auth.test.ts`

- [ ] **Step 1: Write the failing Resend payload test**

Add a test that calls:

```ts
await createSender(fetchImpl).sendPasswordResetCode({
  code: CODE,
  email: EMAIL,
  expiresInMinutes: 10,
});

expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))).toEqual({
  from: "Art-Aittco <art@art.aittco.com>",
  subject: "Reset your Art-Aittco password",
  to: [EMAIL],
  html: `<p>Your password reset code is <strong>${CODE}</strong>.</p><p>It expires in 10 minutes. Ignore this email if you did not request it.</p>`,
  text: `Your password reset code is ${CODE}. It expires in 10 minutes. Ignore this email if you did not request it.`,
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npx vitest run apps/api/test/auth-email-sender.test.ts`

Expected: FAIL because `sendPasswordResetCode` is not defined.

- [ ] **Step 3: Extend the sender interface and share the transport**

Add this interface method:

```ts
export interface AuthEmailSender {
  sendVerificationCode(input: SendVerificationCodeInput): Promise<void>;
  sendPasswordResetCode(input: SendVerificationCodeInput): Promise<void>;
}
```

Extract the existing fetch/timeout block into a private `send(input, content)` method and implement `sendPasswordResetCode` with the exact subject, HTML, and text asserted above. Keep `AuthEmailDeliveryError` sanitized and preserve existing verification-email output.

Update `CapturingAuthEmailSender` in `apps/api/test/auth.test.ts` with separate `verificationMessages` and `passwordResetMessages`, plus `latestVerificationCode(email)` and `latestPasswordResetCode(email)` helpers so tests cannot confuse registration mail with reset mail.

- [ ] **Step 4: Run sender and API type checks**

Run: `npx vitest run apps/api/test/auth-email-sender.test.ts`

Run: `npm run build --workspace @aigc-flow/api`

Expected: PASS.

- [ ] **Step 5: Commit the sender change**

```bash
git add apps/api/src/modules/auth/auth-email-sender.ts apps/api/test/auth-email-sender.test.ts apps/api/test/auth.test.ts
git commit -m "feat(auth): add password reset email"
```

### Task 3: Request endpoint and enumeration resistance

**Files:**
- Modify: `apps/api/src/modules/auth/auth.schemas.ts`
- Modify: `apps/api/src/modules/auth/auth.routes.ts`
- Modify: `apps/api/src/modules/auth/auth.service.ts`
- Modify: `apps/api/test/auth.test.ts`

- [ ] **Step 1: Write failing registered/unknown email tests**

In the database-backed `auth v2` suite, register and verify `reset@example.com`, then assert:

```ts
const known = await api.inject({
  method: "POST",
  payload: { email: " RESET@example.com " },
  url: "/api/v2/auth/password-reset/request",
});
const unknown = await api.inject({
  method: "POST",
  payload: { email: "missing@example.com" },
  url: "/api/v2/auth/password-reset/request",
});

expect(known.statusCode).toBe(202);
expect(unknown.statusCode).toBe(202);
for (const response of [known, unknown]) {
  expect(response.json()).toMatchObject({
    expiresInSeconds: 600,
    resendAvailableInSeconds: 60,
    message: "如果该邮箱已注册，验证码已发送。",
  });
  expect(response.json().challengeToken).toEqual(expect.any(String));
}
expect(authEmailSender.latestPasswordResetCode("reset@example.com")).toMatch(/^\d{6}$/);
expect(authEmailSender.latestPasswordResetCode("missing@example.com")).toBeUndefined();
```

Query `auth_email_challenges` through `adminPool` and assert `purpose`, `reason`, null `tenant_id`, hashed token, and hashed code; also assert no row exists for the unknown email.

- [ ] **Step 2: Run the test and verify RED**

Run: `npx vitest run apps/api/test/auth.test.ts -t "requests a password reset without revealing account existence"`

Expected: FAIL with route not found.

- [ ] **Step 3: Add request schemas and route**

```ts
export const requestPasswordResetSchema = z.object({
  email: z.string().trim().email(),
});
export const resendPasswordResetSchema = z.object({
  challengeToken: z.string().min(32).max(512),
});
export const confirmPasswordResetSchema = z.object({
  challengeToken: z.string().min(32).max(512),
  code: z.string().regex(/^\d{6}$/),
  newPassword: z.string().min(8).max(256),
});
```

Register `/api/v2/auth/password-reset/request` with `authRateLimitConfig`, parse `RequestPasswordResetInput`, call `requestPasswordReset(body, requestMetadata(request))`, and return HTTP 202.

- [ ] **Step 4: Implement the minimal request service**

Implement `requestPasswordReset` to normalize email, select only an active user, return a 32-byte synthetic opaque token for an unknown user, consume older pending reset challenges for a known user, insert a ten-minute/five-attempt hashed challenge with null `tenant_id`, and call `sendPasswordResetCode`.

Return only:

```ts
{
  challengeToken,
  expiresInSeconds: EMAIL_CODE_TTL_SECONDS,
  resendAvailableInSeconds: EMAIL_CODE_RESEND_COOLDOWN_SECONDS,
  message: "如果该邮箱已注册，验证码已发送。",
}
```

Give `requestPasswordReset` the return type `Promise<{ deliveryFailed: boolean; response: PasswordResetChallengeResponse }>` where `PasswordResetChallengeResponse` contains exactly the four public fields shown above. If delivery fails, preserve the same public response and set only the internal flag. The route destructures `{ deliveryFailed, response }`, logs only `{ requestId }` with the fixed message `password reset email delivery failed` when the flag is true, and sends `response`. Do not include email, code, challenge token, request body, or provider error text in the log or public body.

- [ ] **Step 5: Run the focused request tests**

Run: `npx vitest run apps/api/test/auth.test.ts -t "password reset"`

Expected: request and account-enumeration tests PASS.

- [ ] **Step 6: Commit request support**

```bash
git add apps/api/src/modules/auth/auth.schemas.ts apps/api/src/modules/auth/auth.routes.ts apps/api/src/modules/auth/auth.service.ts apps/api/test/auth.test.ts
git commit -m "feat(auth): request password reset codes"
```

### Task 4: Resend, confirmation, and session revocation

**Files:**
- Modify: `apps/api/src/modules/auth/auth.routes.ts`
- Modify: `apps/api/src/modules/auth/auth.service.ts`
- Modify: `apps/api/test/auth.test.ts`

- [ ] **Step 1: Write failing resend lifecycle tests**

Cover these behaviors with real API calls and database state:

```ts
expect(immediateResend.statusCode).toBe(200);
expect(immediateResend.json()).toMatchObject({
  challengeToken,
  expiresInSeconds: 600,
  resendAvailableInSeconds: 60,
  message: "如果该邮箱已注册，验证码已发送。",
});
expect(authEmailSender.latestPasswordResetCode(email)).toBe(oldCode);

await adminPool.query(
  "UPDATE auth_email_challenges SET last_sent_at = now() - interval '61 seconds' WHERE challenge_token_hash = $1",
  [hashOpaqueToken(challengeToken)],
);
expect(allowedResend.statusCode).toBe(200);
expect(newCode).not.toBe(oldCode);
```

Also assert arbitrary/synthetic, consumed, and expired tokens receive the same HTTP 200 response shape and no account fields. They must not send mail.

- [ ] **Step 2: Write failing confirmation and revocation tests**

Create two verified login sessions before requesting reset. Assert wrong codes decrement `attempts_remaining`, expired and consumed challenges fail, and success produces:

```ts
expect(confirm.statusCode).toBe(200);
expect(confirm.json()).toEqual({ message: "密码已重置，请重新登录。" });
expect((await loginWithOldPassword()).statusCode).toBe(401);
expect((await loginWithNewPassword()).statusCode).not.toBe(401);
expect(sessionRows.rows.every((row) => row.status === "revoked" && row.revoked_at)).toBe(true);
expect(refreshRows.rows.every((row) => row.revoked_at)).toBe(true);
```

Send two concurrent confirm requests with the same challenge and assert exactly one HTTP 200 response.

- [ ] **Step 3: Run the tests and verify RED**

Run: `npx vitest run apps/api/test/auth.test.ts -t "password reset"`

Expected: FAIL because resend and confirm routes are missing.

- [ ] **Step 4: Implement reset-specific resend**

Add `/api/v2/auth/password-reset/resend` with the shared auth rate limit. In `resendPasswordReset`, lock by hashed token. Only a pending `password_reset` challenge outside the 60-second cooldown generates a different code hash, resets attempts to five, extends expiry to ten minutes, and calls `sendPasswordResetCode`. Every syntactically valid token receives the same HTTP 200 challenge/cooldown response without email or account data; delivery failures are signaled internally for fixed-message route logging only.

- [ ] **Step 5: Implement atomic confirmation**

Add `/api/v2/auth/password-reset/confirm`. In `confirmPasswordReset`, begin a transaction and lock the reset challenge. Missing, wrong-purpose, consumed, expired, exhausted, and wrong-code states all return HTTP 400 `PASSWORD_RESET_INVALID` with `验证码无效或已过期，请重新申请`; a wrong code still decrements and commits attempts. For a valid challenge, hash the new password, then execute:

```sql
UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1::uuid;
UPDATE auth_email_challenges SET consumed_at = COALESCE(consumed_at, now()), updated_at = now()
WHERE user_id = $1::uuid AND purpose = 'password_reset' AND consumed_at IS NULL;
UPDATE auth_sessions SET status = 'revoked', revoked_at = COALESCE(revoked_at, now())
WHERE user_id = $1::uuid;
UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, now())
WHERE user_id = $1::uuid;
```

Commit before returning. Record a secret-free `auth.password_reset` audit event after commit using the same safe audit helper and request metadata conventions as login/logout.

- [ ] **Step 6: Run auth, DB, and API tests**

Run: `npx vitest run apps/api/test/auth.test.ts apps/api/test/auth-verification.test.ts apps/api/test/auth-email-sender.test.ts`

Run: `npm run test --workspace @aigc-flow/api`

Expected: focused tests PASS; database-backed tests may skip only when no test database exists.

- [ ] **Step 7: Commit reset completion**

```bash
git add apps/api/src/modules/auth/auth.routes.ts apps/api/src/modules/auth/auth.service.ts apps/api/test/auth.test.ts
git commit -m "feat(auth): confirm password resets"
```

### Task 5: Typed frontend client

**Files:**
- Modify: `src/services/v2AuthClient.test.ts`
- Modify: `src/services/v2AuthClient.ts`

- [ ] **Step 1: Write failing client endpoint tests**

Import the three wished-for functions and assert their request paths and bodies:

```ts
await requestPasswordReset({ email: "alice@example.com" });
await resendPasswordReset({ challengeToken: "challenge-token-12345678901234567890" });
await confirmPasswordReset({
  challengeToken: "challenge-token-12345678901234567890",
  code: "123456",
  newPassword: "NewStrongPass123!",
});

expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
  "/api/v2/auth/password-reset/request",
  "/api/v2/auth/password-reset/resend",
  "/api/v2/auth/password-reset/confirm",
]);
```

Assert all calls use `auth: false` behavior and do not clear or write access, refresh, or trusted-device tokens.

- [ ] **Step 2: Run the test and verify RED**

Run: `npx vitest run src/services/v2AuthClient.test.ts`

Expected: FAIL because the functions are not exported.

- [ ] **Step 3: Add client types and calls**

```ts
export type PasswordResetChallenge = {
  challengeToken: string;
  expiresInSeconds: number;
  resendAvailableInSeconds: number;
  message: string;
};

export function requestPasswordReset(input: { email: string }) {
  return apiPost<PasswordResetChallenge>("/auth/password-reset/request", input, { auth: false, retryOnUnauthorized: false });
}

export function resendPasswordReset(input: { challengeToken: string }) {
  return apiPost<PasswordResetChallenge>("/auth/password-reset/resend", input, { auth: false, retryOnUnauthorized: false });
}

export function confirmPasswordReset(input: { challengeToken: string; code: string; newPassword: string }) {
  return apiPost<{ message: string }>("/auth/password-reset/confirm", input, { auth: false, retryOnUnauthorized: false });
}
```

- [ ] **Step 4: Run the client tests**

Run: `npx vitest run src/services/v2AuthClient.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the client**

```bash
git add src/services/v2AuthClient.ts src/services/v2AuthClient.test.ts
git commit -m "feat(auth): add password reset client"
```

### Task 6: Public recovery UI and routing

**Files:**
- Create: `src/auth/ForgotPasswordPage.tsx`
- Modify: `src/auth/LoginPage.tsx`
- Modify: `src/auth/AuthPages.test.tsx`
- Modify: `src/app/routes.ts`
- Modify: `src/app/AppRouter.tsx`

- [ ] **Step 1: Write failing login-link and route tests**

Import `ForgotPasswordPage`. Assert the login page exposes `忘记密码？`, clicking it changes `window.location.pathname` to `/forgot-password`, and the recovery page renders `找回密码`, `邮箱`, and `发送验证码`.

- [ ] **Step 2: Write failing request/confirm interaction tests**

Mock `../services/v2AuthClient` and cover:

```ts
expect(requestPasswordReset).toHaveBeenCalledWith({ email: "creator@example.com" });
expect(await screen.findByLabelText("6 位验证码")).toBeTruthy();
expect(screen.getByLabelText("新密码").getAttribute("autocomplete")).toBe("new-password");
expect(screen.getByLabelText("确认新密码").getAttribute("autocomplete")).toBe("new-password");
```

Assert a mismatch displays `两次输入的密码不一致`, a short password is blocked, resend counts down from the server value and calls the reset resend client, and confirmation navigates to `/login?passwordReset=success` only after the promise resolves.

- [ ] **Step 3: Run the page tests and verify RED**

Run: `npx vitest run src/auth/AuthPages.test.tsx`

Expected: FAIL because the page, route, and login action are missing.

- [ ] **Step 4: Add route and login entry**

Add:

```ts
export const FORGOT_PASSWORD_ROUTE = "/forgot-password";
```

Add `FORGOT_PASSWORD_ROUTE` to `PRODUCT_ROUTES`, import `ForgotPasswordPage`, and mount it beside the login/register public branches in `AppRouter`. Add a text button next to the login password label that navigates to the new route.

Change `AuthShellProps.mode` to `"login" | "register" | "forgot-password"`. Extend `AuthField` with these exact optional props:

```ts
inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
labelAction?: ReactNode;
maxLength?: number;
```

Pass `inputMode` and `maxLength` to `<input>`. Render the label row as:

```tsx
<span className="mb-2 flex items-center justify-between gap-3 font-medium text-slate-200">
  <span>{label}</span>
  {labelAction}
</span>
```

All new props remain optional so existing login and registration fields preserve their current output.

- [ ] **Step 5: Implement the two-state page**

Use `AuthShell`, `AuthField`, `AuthErrorMessage`, `AuthPrimaryButton`, and `AuthSecondaryButton`. Keep state local:

```ts
type RecoveryStep = "request" | "confirm";
const [step, setStep] = useState<RecoveryStep>("request");
const [challenge, setChallenge] = useState<PasswordResetChallenge | null>(null);
```

The request handler calls `requestPasswordReset`. The confirmation handler locally checks six digits, 8–256 password length, and equality before calling `confirmPasswordReset`. The resend handler calls `resendPasswordReset` and restarts the countdown. Use `inputMode="numeric"`, `maxLength={6}`, and `autoComplete="one-time-code"` for the code, and `autoComplete="new-password"` for both password fields. Success navigates to `/login?passwordReset=success`; login derives the initial success message from `new URLSearchParams(window.location.search).get("passwordReset") === "success"` and shows `密码已重置，请重新登录。` without storing it in auth state or browser storage.

- [ ] **Step 6: Run frontend tests**

Run: `npx vitest run src/auth/AuthPages.test.tsx src/services/v2AuthClient.test.ts src/auth/AuthProvider.test.tsx src/auth/AuthGate.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit the UI**

```bash
git add src/auth/ForgotPasswordPage.tsx src/auth/LoginPage.tsx src/auth/AuthPages.test.tsx src/app/routes.ts src/app/AppRouter.tsx
git commit -m "feat(auth): add password recovery page"
```

### Task 7: Validation, browser QA, and project record

**Files:**
- Modify: `PROJECT_RECORD.md`

- [ ] **Step 1: Run focused and workspace tests**

```bash
npx vitest run packages/db/test/password-reset-migration.test.ts packages/db/test/auth-email-device-migration.test.ts
npx vitest run apps/api/test/auth.test.ts apps/api/test/auth-verification.test.ts apps/api/test/auth-email-sender.test.ts
npx vitest run src/auth/AuthPages.test.tsx src/services/v2AuthClient.test.ts src/auth/AuthProvider.test.tsx src/auth/AuthGate.test.tsx
npm run test --workspace @aigc-flow/db
npm run test --workspace @aigc-flow/api
```

Expected: all configured tests PASS. Record exact database-backed skips if local PostgreSQL is unavailable.

- [ ] **Step 2: Run the production build**

Run: `npm run build`

Expected: exit code 0. Existing Browserslist, mixed import, and chunk-size warnings may remain; no new TypeScript or bundling errors are acceptable.

- [ ] **Step 3: Start the local frontend for browser QA**

Start the existing v2 services per `docs/v2-local-development.md`. Use the normal frontend URL `http://localhost:5188`; if occupied by an unrelated process, start Vite on another port and report it.

- [ ] **Step 4: Verify desktop and mobile UI**

Use Playwright at desktop and mobile widths to verify:

- `/login` shows the recovery entry without overlap;
- `/forgot-password` request and confirmation layouts fit the viewport;
- code and password fields accept keyboard input;
- mismatch and API errors remain visible without shifting controls outside the form;
- resend disabled/enabled states do not resize the layout;
- success returns to login with the confirmation message.

Save screenshots under the task's existing temporary/browser artifact location, not as committed product assets.

- [ ] **Step 5: Update the project record**

Add a top entry dated `2026-08-02` to `PROJECT_RECORD.md` summarizing the three endpoints, 6-digit/10-minute/five-attempt/60-second security rules, enumeration-safe response, all-session revocation, UI route, migration number, and exact validation results.

- [ ] **Step 6: Commit documentation**

```bash
git add PROJECT_RECORD.md
git commit -m "docs(auth): record password reset delivery"
```

- [ ] **Step 7: Inspect final scope**

Run: `git status --short` and `git log -7 --oneline`

Expected: only pre-existing unrelated user changes remain unstaged; password-reset commits contain only the files listed in this plan.
