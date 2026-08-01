# Resend Auth Email Transport Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the production Brevo authentication-email transport with Resend while preserving all registration, verification, and trusted-device behavior.

**Architecture:** Keep `AuthEmailSender` as the transport boundary used by `AuthService`. Replace its Brevo implementation with a native-`fetch` Resend adapter, rename production configuration to `RESEND_*`, and update only active staging/deployment documentation; no database or frontend changes are required.

**Tech Stack:** TypeScript, Node.js built-in `fetch`, Fastify, Vitest, Docker Compose v2, Resend HTTPS API

---

## File Map

- `apps/api/src/modules/auth/auth-email-sender.ts` - `AuthEmailSender` interface, sanitized error, and Resend HTTP adapter.
- `apps/api/test/auth-email-sender.test.ts` - Resend request, timeout, and error-sanitization tests.
- `apps/api/src/config/env.ts` - parse and validate server-only `RESEND_*` configuration.
- `apps/api/test/env.test.ts` - Resend environment parsing and production requirement tests.
- `apps/api/src/app.ts` - construct `ResendAuthEmailSender` for the production application.
- `scripts/auth-email-compose.test.ts` - static regression proving Compose injects Resend and no longer injects Brevo.
- `docker-compose.staging.yml` - shared runtime injection for the three `RESEND_*` variables.
- `docs/STAGING_ENV_TEMPLATE.md` - staging secret checklist and Resend domain readiness.
- `docs/staging-runbook.md` - deployment and smoke-test instructions for Resend.
- `PROJECT_RECORD.md` - record the completed provider replacement and validation evidence.

## Task 1: Replace the Transport and Environment Contract

**Files:**

- Modify: `apps/api/test/auth-email-sender.test.ts`
- Modify: `apps/api/test/env.test.ts`
- Modify: `apps/api/src/modules/auth/auth-email-sender.ts`
- Modify: `apps/api/src/config/env.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Rewrite the sender test around the desired Resend contract**

Change the test import and factory to use `ResendAuthEmailSender`:

```ts
import {
  AuthEmailDeliveryError,
  ResendAuthEmailSender,
} from "../src/modules/auth/auth-email-sender.js";

const API_KEY = "re_test_api_key";

function createSender(fetchImpl: typeof fetch, timeoutMs?: number) {
  return new ResendAuthEmailSender({
    apiKey: API_KEY,
    fetchImpl,
    fromEmail: "art@art.aittco.com",
    fromName: "Art-Aittco",
    timeoutMs,
  });
}
```

The successful-request assertion must require this request shape:

```ts
expect(url).toBe("https://api.resend.com/emails");
expect(init?.method).toBe("POST");
expect(init?.headers).toMatchObject({
  authorization: `Bearer ${API_KEY}`,
  "content-type": "application/json",
});

const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
expect(body).toMatchObject({
  from: "Art-Aittco <art@art.aittco.com>",
  subject: "Your Art-Aittco verification code",
  to: [EMAIL],
});
expect(body.html).toEqual(expect.stringContaining(CODE));
expect(body.html).toEqual(expect.stringContaining("10 minutes"));
expect(body.text).toEqual(expect.stringContaining(CODE));
expect(body.text).toEqual(expect.stringContaining("10 minutes"));
```

Keep the existing timeout, non-success, network-failure, malformed-response, and secret-sanitization cases, but rename the suite and test descriptions from Brevo to Resend.

- [ ] **Step 2: Rewrite the environment tests around `RESEND_*`**

Set the production test defaults to:

```ts
RESEND_API_KEY: "re_test_api_key",
RESEND_FROM_EMAIL: "art@art.aittco.com",
RESEND_FROM_NAME: "Art-Aittco",
```

Replace the Brevo-specific tests with:

```ts
test("reads the complete Resend sender configuration", () => {
  withRequiredProductionEnv({
    RESEND_API_KEY: "  re_test_api_key  ",
    RESEND_FROM_EMAIL: "  art@art.aittco.com  ",
    RESEND_FROM_NAME: "  Art-Aittco  ",
  });

  const env = getApiEnv();

  expect(env.resendApiKey).toBe("re_test_api_key");
  expect(env.resendFromEmail).toBe("art@art.aittco.com");
  expect(env.resendFromName).toBe("Art-Aittco");
});

test.each([
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "RESEND_FROM_NAME",
])("requires %s in production", (variable) => {
  withRequiredProductionEnv();
  delete process.env[variable];

  expect(() => getApiEnv()).toThrow(
    `${variable} is required to start the v2 API in production`,
  );
});
```

- [ ] **Step 3: Run the focused tests and verify the RED state**

Run:

```bash
npm run test --workspace @aigc-flow/api -- auth-email-sender.test.ts env.test.ts
```

Expected: FAIL because `ResendAuthEmailSender` and `ApiEnv.resend*` do not exist and production still requires `BREVO_*`.

- [ ] **Step 4: Implement the minimal Resend adapter**

In `auth-email-sender.ts`, replace the Brevo URL/class with:

```ts
const RESEND_EMAIL_URL = "https://api.resend.com/emails";

export class ResendAuthEmailSender implements AuthEmailSender {
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly fromEmail: string;
  private readonly fromName: string;
  private readonly timeoutMs: number;

  constructor(options: {
    apiKey: string;
    fetchImpl?: typeof fetch;
    fromEmail: string;
    fromName: string;
    timeoutMs?: number;
  }) {
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.fromEmail = options.fromEmail;
    this.fromName = options.fromName;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async sendVerificationCode(input: SendVerificationCodeInput): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(RESEND_EMAIL_URL, {
        body: JSON.stringify({
          from: `${this.fromName} <${this.fromEmail}>`,
          html: `<p>Your verification code is <strong>${input.code}</strong>.</p><p>It expires in ${input.expiresInMinutes} minutes.</p>`,
          subject: "Your Art-Aittco verification code",
          text: `Your verification code is ${input.code}. It expires in ${input.expiresInMinutes} minutes.`,
          to: [input.email],
        }),
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
        },
        method: "POST",
        signal: controller.signal,
      });

      if (!response?.ok) {
        throw new AuthEmailDeliveryError();
      }
    } catch {
      throw new AuthEmailDeliveryError();
    } finally {
      clearTimeout(timeout);
    }
  }
}
```

Retain the existing `AuthEmailSender`, `SendVerificationCodeInput`, `AuthEmailDeliveryError`, default timeout, and generic delivery error message unchanged.

- [ ] **Step 5: Rename the API environment contract and application wiring**

In `ApiEnv`, replace the Brevo properties with:

```ts
resendApiKey?: string;
resendFromEmail?: string;
resendFromName?: string;
```

Read the variables beside the existing auth configuration:

```ts
const resendApiKey = process.env.RESEND_API_KEY?.trim() || "";
const resendFromEmail = process.env.RESEND_FROM_EMAIL?.trim() || "";
const resendFromName = process.env.RESEND_FROM_NAME?.trim() || "";
```

Use these production guards:

```ts
if (isProduction && !resendApiKey) {
  throw new Error("RESEND_API_KEY is required to start the v2 API in production");
}

if (isProduction && !resendFromEmail) {
  throw new Error("RESEND_FROM_EMAIL is required to start the v2 API in production");
}

if (isProduction && !resendFromName) {
  throw new Error("RESEND_FROM_NAME is required to start the v2 API in production");
}
```

Return `resendApiKey`, `resendFromEmail`, and `resendFromName` in the `ApiEnv` object. Remove the corresponding Brevo properties, reads, guards, and return entries.

In `app.ts`, replace the import and construction with:

```ts
import {
  type AuthEmailSender,
  ResendAuthEmailSender,
} from "./modules/auth/auth-email-sender.js";

const authEmailSender = options?.authEmailSender ?? new ResendAuthEmailSender({
  apiKey: env.resendApiKey ?? "",
  fromEmail: env.resendFromEmail ?? "",
  fromName: env.resendFromName ?? "",
});
```

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```bash
npm run test --workspace @aigc-flow/api -- auth-email-sender.test.ts env.test.ts
```

Expected: 2 test files pass, with sender request/timeout/error tests and environment tests all green.

- [ ] **Step 7: Build the API and commit**

Run:

```bash
npm run build --workspace @aigc-flow/api
```

Expected: exit code 0.

Commit:

```bash
git add apps/api/src/modules/auth/auth-email-sender.ts apps/api/test/auth-email-sender.test.ts apps/api/src/config/env.ts apps/api/test/env.test.ts apps/api/src/app.ts
git commit -m "feat(auth): replace Brevo transport with Resend"
```

## Task 2: Replace Compose Runtime Injection

**Files:**

- Create: `scripts/auth-email-compose.test.ts`
- Modify: `docker-compose.staging.yml`

- [ ] **Step 1: Add the failing static Compose regression**

Create:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const compose = readFileSync("docker-compose.staging.yml", "utf8");

describe("staging auth email configuration", () => {
  test("injects Resend configuration and removes Brevo runtime variables", () => {
    expect(compose).toContain("RESEND_API_KEY: ${RESEND_API_KEY}");
    expect(compose).toContain(
      "RESEND_FROM_EMAIL: ${RESEND_FROM_EMAIL:-art@art.aittco.com}",
    );
    expect(compose).toContain(
      "RESEND_FROM_NAME: ${RESEND_FROM_NAME:-Art-Aittco}",
    );
    expect(compose).not.toContain("BREVO_");
  });
});
```

- [ ] **Step 2: Run the Compose test and verify RED**

Run:

```bash
npm test -- scripts/auth-email-compose.test.ts
```

Expected: FAIL because Compose still contains `BREVO_*` and does not contain `RESEND_*`.

- [ ] **Step 3: Replace the shared Compose entries**

Use exactly:

```yaml
RESEND_API_KEY: ${RESEND_API_KEY}
RESEND_FROM_EMAIL: ${RESEND_FROM_EMAIL:-art@art.aittco.com}
RESEND_FROM_NAME: ${RESEND_FROM_NAME:-Art-Aittco}
```

Remove all three `BREVO_*` entries.

- [ ] **Step 4: Run the Compose test and verify GREEN**

Run:

```bash
npm test -- scripts/auth-email-compose.test.ts
```

Expected: 1 test passes.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.staging.yml scripts/auth-email-compose.test.ts
git commit -m "chore(deploy): inject Resend auth email settings"
```

## Task 3: Update Active Staging Documentation

**Files:**

- Modify: `docs/STAGING_ENV_TEMPLATE.md`
- Modify: `docs/staging-runbook.md`

- [ ] **Step 1: Replace the active environment template section**

Rename `Auth Email Verification / Brevo` to `Auth Email Verification / Resend` and use:

```text
RESEND_API_KEY=<secret: Resend sending API key>
RESEND_FROM_EMAIL=art@art.aittco.com
RESEND_FROM_NAME=Art-Aittco
Resend art.aittco.com domain verified=No
Real mailbox verification tested=No
```

Change the log-safety checklist to prohibit Resend API keys and Authorization headers. Do not rewrite the historical 2026-07-27 design or implementation plan.

- [ ] **Step 2: Replace the active staging runbook instructions**

Document the same three environment entries, require Resend domain verification before deployment, and update failure diagnosis to check Resend domain status and sanitized delivery errors. Keep the Docker Compose v2 deployment commands and verification workflow unchanged.

- [ ] **Step 3: Verify active files contain no Brevo runtime configuration**

Run:

```bash
rg -n "BREVO_|Brevo" apps/api/src apps/api/test docker-compose.staging.yml docs/STAGING_ENV_TEMPLATE.md docs/staging-runbook.md scripts/auth-email-compose.test.ts
```

Expected: no matches.

Run:

```bash
rg -n "RESEND_|Resend" apps/api/src apps/api/test docker-compose.staging.yml docs/STAGING_ENV_TEMPLATE.md docs/staging-runbook.md scripts/auth-email-compose.test.ts
```

Expected: matches only in the new runtime, tests, and active documentation.

- [ ] **Step 4: Commit**

```bash
git add docs/STAGING_ENV_TEMPLATE.md docs/staging-runbook.md
git commit -m "docs: document Resend auth email rollout"
```

## Task 4: Verify the Provider Replacement and Record It

**Files:**

- Modify: `PROJECT_RECORD.md`

- [ ] **Step 1: Run focused auth and configuration tests**

Run:

```bash
npm run test --workspace @aigc-flow/api -- auth-email-sender.test.ts env.test.ts auth-verification.test.ts auth.test.ts
npm test -- scripts/auth-email-compose.test.ts
```

Expected: all infrastructure-free cases pass. Database-backed auth cases may skip if local PostgreSQL is unavailable; record the exact passed/skipped counts.

- [ ] **Step 2: Run required builds**

Run separately:

```bash
npm run build --workspace @aigc-flow/db
npm run build --workspace @aigc-flow/api
npm run build
```

Expected: all commands exit 0. Existing Browserslist, mixed dynamic-import, and large-chunk warnings may remain.

- [ ] **Step 3: Audit the diff and repository status**

Run:

```bash
git diff --check
git status --short
git diff --stat origin/main...HEAD
```

Confirm no API key, Authorization value, verification code, or unrelated user file is present. Confirm no database migration or frontend source file changed.

- [ ] **Step 4: Update the project record with exact evidence**

Add a top-level `2026-07-31 - Resend Auth Email Transport` entry that records:

- Brevo was replaced by Resend without changing verification or trusted-device behavior.
- The sender is `Art-Aittco <art@art.aittco.com>` and requires verified Resend DNS.
- Active server variables are the three `RESEND_*` values and remain server-only.
- No database migration is required.
- Exact focused test and build results from Steps 1-2.
- Live sending remains pending Resend domain verification, server secret update, deployment, and a real-mail smoke test.

- [ ] **Step 5: Commit the project record**

```bash
git add PROJECT_RECORD.md
git commit -m "docs: record Resend auth email migration"
```

- [ ] **Step 6: Run final status and log verification**

Run:

```bash
git status --short --branch
git log -5 --oneline --decorate
```

Expected: clean `codex/resend-auth-email` worktree with the design, implementation, deployment, documentation, and project-record commits on top of `origin/main`.
