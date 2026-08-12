# Aittco Auth Drawer And Legal Consent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the centered authentication modal with a right-side cinematic auth drawer, remember only opted-in email addresses, publish Aittco legal pages, and record versioned legal consent through the v2 auth service.

**Architecture:** Keep `FilmStage` as the only video owner. Add one API legal module as the source of truth for document bodies and current versions, persist user-level consent in Postgres, and validate consent inside existing registration/login transactions before issuing sessions or challenges. The React app fetches the public legal manifest/documents, renders anonymous legal routes, and sends the current versions only after the user selects the consent checkbox.

**Tech Stack:** React 19, TypeScript, Vite, Fastify 5, Zod 4, PostgreSQL migrations/RLS, Vitest, Testing Library, Playwright CLI smoke checks.

---

## File Map

**Create:**

- `packages/db/migrations/000066_user_legal_consents.sql` - account-level immutable consent records and RLS.
- `packages/db/test/user-legal-consents-migration.test.ts` - schema, constraints, grants, and RLS coverage.
- `apps/api/src/modules/legal/legal.documents.ts` - Aittco document versions, metadata, and Chinese legal draft content.
- `apps/api/src/modules/legal/legal.service.ts` - public document reads and authoritative consent-version validation.
- `apps/api/src/modules/legal/legal.routes.ts` - anonymous manifest and document endpoints.
- `apps/api/test/legal.test.ts` - public legal API contract and production contact configuration coverage.
- `apps/api/src/modules/auth/legal-consent.repository.ts` - idempotent consent lookup and insert helpers.
- `src/legal/legalApi.ts` - public legal API client and shared frontend types.
- `src/legal/LegalDocumentPage.tsx` - terms/privacy public page.
- `src/legal/legalDocumentPage.css` - responsive and print-friendly legal layout.
- `src/legal/LegalDocumentPage.test.tsx` - document loading, error, route, and branding tests.
- `src/auth/rememberedEmailPreference.ts` - isolated best-effort remembered-email persistence.
- `src/auth/rememberedEmailPreference.test.ts` - storage success/failure tests.
- `src/auth/LegalConsentControl.tsx` - required checkbox, links, and accessible inline error.
- `src/auth/AuthDrawer.tsx` - responsive drawer/bottom-sheet shell replacing the old visual dialog shell.
- `src/auth/AuthDrawer.test.tsx` - focus, dismissal, layout hooks, and pending-state coverage.

**Modify:**

- `apps/api/src/config/env.ts` and `apps/api/test/env.test.ts` - `LEGAL_CONTACT_URL` production configuration.
- `apps/api/src/app.ts` and `apps/api/src/fastify.d.ts` - register the legal service/routes.
- `apps/api/src/modules/auth/auth.schemas.ts` - structured legal consent request schema.
- `apps/api/src/modules/auth/auth.service.ts` - validate and persist consent during registration/login.
- `apps/api/test/auth.test.ts` - registration/login consent behavior and atomicity.
- `src/app/routes.ts`, `src/app/routes.test.ts`, and `src/app/AppRouter.tsx` - anonymous legal routes.
- `src/services/v2AuthClient.ts` and `src/services/v2AuthClient.test.ts` - legal payload and manifest mismatch handling.
- `src/auth/useAuth.ts`, `src/auth/AuthProvider.tsx`, and `src/auth/AuthProvider.test.tsx` - consent-aware input types.
- `src/auth/AuthFormControls.tsx` - dark fields and password visibility control.
- `src/auth/LoginPage.tsx` and `src/auth/RegisterPage.tsx` - remembered email and required Aittco consent.
- `src/auth/AuthPages.test.tsx` - blocked submission, payload, remembered email, and Chinese labels.
- `src/auth/AuthExperiencePage.tsx` - drawer orchestration.
- `src/auth/landing/FilmStage.tsx`, `src/auth/landing/FilmStage.test.tsx`, and `src/auth/landing/cinematicAuthHome.css` - drawer-open stage layout and rail collision prevention.
- `scripts/smoke-cinematic-auth-home.ts` and `scripts/smoke-cinematic-auth-home.test.ts` - desktop/mobile drawer and legal-flow checks.
- `docker-compose.staging.yml` and `docs/STAGING_ENV_TEMPLATE.md` - legal contact runtime variable.
- `PROJECT_RECORD.md` - completed behavior and validation record.

Delete `src/auth/AuthDialog.tsx` and `src/auth/AuthDialog.test.tsx` only after all imports and behavioral tests have moved to `AuthDrawer`.

## Task 1: Add The Account-Level Consent Schema

**Files:**

- Create: `packages/db/migrations/000066_user_legal_consents.sql`
- Create: `packages/db/test/user-legal-consents-migration.test.ts`

- [ ] **Step 1: Write the failing migration test**

Create a database-gated test following `auth-email-device-migration.test.ts`. It must run all migrations, inspect `user_legal_consents`, and assert:

```ts
expect(columnNames).toEqual(expect.arrayContaining([
  "id", "user_id", "document_type", "document_version",
  "consented_at", "consent_source", "created_at",
]));
expect(columnNames).not.toContain("tenant_id");
expect(indexNames).toContain("user_legal_consents_user_document_version_uidx");
expect(policyNames).toContain("user_legal_consents_select_own");
```

Also insert the same `(user_id, document_type, document_version)` twice and expect PostgreSQL error `23505`.

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npm run test --workspace @aigc-flow/db -- user-legal-consents-migration.test.ts
```

Expected: FAIL because migration `000066_user_legal_consents.sql` and its table do not exist.

- [ ] **Step 3: Add the migration**

Create the table with this contract:

```sql
CREATE TABLE user_legal_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_type text NOT NULL CHECK (document_type IN ('terms', 'privacy')),
  document_version text NOT NULL CHECK (length(trim(document_version)) BETWEEN 1 AND 64),
  consented_at timestamptz NOT NULL DEFAULT now(),
  consent_source text NOT NULL CHECK (
    consent_source IN ('auth_login', 'auth_register', 'account_reconsent')
  ),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX user_legal_consents_user_document_version_uidx
  ON user_legal_consents (user_id, document_type, document_version);

CREATE INDEX user_legal_consents_user_consented_at_idx
  ON user_legal_consents (user_id, consented_at DESC);

ALTER TABLE user_legal_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_legal_consents_select_own ON user_legal_consents
  FOR SELECT USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);

CREATE POLICY user_legal_consents_insert_own ON user_legal_consents
  FOR INSERT WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);
```

Follow current migration grant conventions so the configured API runtime role can `SELECT` and `INSERT` but not `UPDATE` or `DELETE`. Document in SQL that this table intentionally has no `tenant_id` because consent belongs to an Aittco user across tenants.

- [ ] **Step 4: Run database tests and build**

Run:

```bash
npm run test --workspace @aigc-flow/db -- user-legal-consents-migration.test.ts auth-email-device-migration.test.ts
npm run build --workspace @aigc-flow/db
```

Expected: PASS; database-dependent assertions may be reported as skipped only when `DATABASE_URL` is unavailable, while migration version/static checks still pass.

- [ ] **Step 5: Commit**

```bash
git add packages/db/migrations/000066_user_legal_consents.sql packages/db/test/user-legal-consents-migration.test.ts
git commit -m "feat(db): add user legal consent records"
```

## Task 2: Create The Aittco Legal Source Of Truth And Public API

**Files:**

- Create: `apps/api/src/modules/legal/legal.documents.ts`
- Create: `apps/api/src/modules/legal/legal.service.ts`
- Create: `apps/api/src/modules/legal/legal.routes.ts`
- Create: `apps/api/test/legal.test.ts`
- Modify: `apps/api/src/config/env.ts`
- Modify: `apps/api/test/env.test.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/fastify.d.ts`

- [ ] **Step 1: Write failing legal API and environment tests**

Add tests for:

```ts
expect(manifest).toEqual({
  privacy: { effectiveAt: "2026-08-12", requiresConsent: true, version: "2026-08-12" },
  terms: { effectiveAt: "2026-08-12", requiresConsent: true, version: "2026-08-12" },
});
expect(terms.operatorName).toBe("Aittco");
expect(terms.title).toBe("Aittco 用户协议");
expect(privacy.title).toBe("Aittco 隐私政策");
expect(JSON.stringify([terms, privacy])).not.toContain("TapFlow 用户协议");
expect(JSON.stringify([terms, privacy])).not.toContain("TapFlow 隐私政策");
```

Verify `GET /api/v2/legal/manifest`, `GET /api/v2/legal/documents/terms`, and `GET /api/v2/legal/documents/privacy` work without Authorization. Extend `env.test.ts` so production requires nonempty `LEGAL_CONTACT_URL` and trims it.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm run test --workspace @aigc-flow/api -- legal.test.ts env.test.ts
```

Expected: FAIL because the routes, service, documents, and environment field do not exist.

- [ ] **Step 3: Implement document types and content**

Define:

```ts
export type LegalDocumentType = "terms" | "privacy";
export type LegalSection = { id: string; title: string; paragraphs: string[]; items?: string[] };
export type LegalDocument = {
  effectiveAt: string;
  lastUpdatedAt: string;
  operatorName: "Aittco";
  sections: LegalSection[];
  title: string;
  type: LegalDocumentType;
  version: string;
};

export const CURRENT_LEGAL_VERSION = "2026-08-12";
```

Write complete Chinese draft sections required by Sections 7 and 8 of the approved design. Describe TapFlow only as the product delivered by Aittco. Do not add a fabricated company registration name, address, or email.

- [ ] **Step 4: Implement service, routes, and production contact configuration**

Add `legalContactUrl: string` to `ApiEnv`, load `LEGAL_CONTACT_URL`, and require it in production. The legal service returns documents with `contactUrl` from `env.legalContactUrl`. Register:

```ts
GET /api/v2/legal/manifest
GET /api/v2/legal/documents/:type
```

Return `404 LEGAL_DOCUMENT_NOT_FOUND` for unsupported types. Register `LegalService` in `buildApp` and expose it in the Fastify type declaration.

- [ ] **Step 5: Run focused tests and API build**

```bash
npm run test --workspace @aigc-flow/api -- legal.test.ts env.test.ts
npm run build --workspace @aigc-flow/api
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/legal apps/api/src/config/env.ts apps/api/test/env.test.ts apps/api/test/legal.test.ts apps/api/src/app.ts apps/api/src/fastify.d.ts
git commit -m "feat(api): publish Aittco legal documents"
```

## Task 3: Require And Persist Consent During Registration

**Files:**

- Create: `apps/api/src/modules/auth/legal-consent.repository.ts`
- Modify: `apps/api/src/modules/auth/auth.schemas.ts`
- Modify: `apps/api/src/modules/auth/auth.service.ts`
- Modify: `apps/api/test/auth.test.ts`

- [ ] **Step 1: Add failing registration consent tests**

Update the registration helper to send current consent versions. Add tests proving:

- missing consent returns `400 VALIDATION_ERROR`;
- stale versions return `409 LEGAL_CONSENT_VERSION_MISMATCH`;
- successful registration creates exactly one terms and one privacy row with source `auth_register`;
- duplicate-email failure creates no extra consent rows;
- forced consent insert failure rolls back the new user and tenant.

Use this payload:

```ts
const currentConsent = {
  privacyVersion: "2026-08-12",
  termsVersion: "2026-08-12",
};
```

- [ ] **Step 2: Run the registration tests and verify RED**

```bash
npm run test --workspace @aigc-flow/api -- auth.test.ts
```

Expected: FAIL because auth schemas and transactions ignore consent.

- [ ] **Step 3: Add the consent schema and repository**

In `auth.schemas.ts` define:

```ts
export const legalConsentSchema = z.object({
  privacyVersion: z.string().trim().min(1).max(64),
  termsVersion: z.string().trim().min(1).max(64),
});
```

Require it in `registerSchema` and `loginSchema`. Implement repository functions:

```ts
validateCurrentConsent(input): void
recordLegalConsent(client, { source, userId, versions }): Promise<void>
```

`recordLegalConsent` inserts two rows with `ON CONFLICT (user_id, document_type, document_version) DO NOTHING`. Version validation uses `CURRENT_LEGAL_VERSION` from `legal.documents.ts` and throws `AuthApiError(409, "LEGAL_CONSENT_VERSION_MISMATCH", ...)`.

- [ ] **Step 4: Insert consent atomically in registration**

Validate versions before password hashing and database work. Inside the existing registration transaction, insert both consent records after `users` exists and before returning. Keep email challenge creation in the same transaction so user, tenant, membership, consent, and challenge either all commit or all roll back.

- [ ] **Step 5: Re-run registration tests**

```bash
npm run test --workspace @aigc-flow/api -- auth.test.ts
```

Expected: all registration and existing email verification tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/auth/auth.schemas.ts apps/api/src/modules/auth/auth.service.ts apps/api/src/modules/auth/legal-consent.repository.ts apps/api/test/auth.test.ts
git commit -m "feat(auth): record registration legal consent"
```

## Task 4: Persist Consent Safely During Login

**Files:**

- Modify: `apps/api/src/modules/auth/auth.service.ts`
- Modify: `apps/api/test/auth.test.ts`

- [ ] **Step 1: Add failing login consent tests**

Cover these cases:

- wrong password creates no consent row;
- stale versions return `LEGAL_CONSENT_VERSION_MISMATCH` without revealing whether the email exists;
- trusted-device login records both versions before issuing the session;
- new-device login records both versions only after correct credentials, then returns its verification challenge;
- repeating login with the same versions leaves two total rows, not four;
- a new material version creates one new row per document type.

- [ ] **Step 2: Run the auth suite and verify RED**

```bash
npm run test --workspace @aigc-flow/api -- auth.test.ts
```

Expected: FAIL on missing login consent persistence/idempotency.

- [ ] **Step 3: Integrate consent with login ordering**

Preserve this security order:

```text
normalize email -> load user -> verify password -> validate submitted versions
-> record idempotent consent -> create verification challenge or authenticated session
```

Do not query or return prior consent before password validation. For trusted-device success, record consent inside the existing session transaction. For challenge responses, use `withAuthContextTransaction` to record consent with `app.user_id` before creating the challenge. If consent persistence fails, do not issue a challenge or session.

- [ ] **Step 4: Run auth/API/database checks**

```bash
npm run test --workspace @aigc-flow/api -- auth.test.ts legal.test.ts
npm run build --workspace @aigc-flow/api
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/auth/auth.service.ts apps/api/test/auth.test.ts
git commit -m "feat(auth): enforce login legal consent"
```

## Task 5: Add Public Aittco Legal Pages

**Files:**

- Create: `src/legal/legalApi.ts`
- Create: `src/legal/LegalDocumentPage.tsx`
- Create: `src/legal/legalDocumentPage.css`
- Create: `src/legal/LegalDocumentPage.test.tsx`
- Modify: `src/app/routes.ts`
- Modify: `src/app/routes.test.ts`
- Modify: `src/app/AppRouter.tsx`

- [ ] **Step 1: Write failing route and page tests**

Assert `/legal/terms` and `/legal/privacy` are anonymous product routes and render fetched content. Tests must verify:

```ts
expect(screen.getByRole("heading", { name: "Aittco 用户协议" })).toBeTruthy();
expect(screen.getByText("运营主体：Aittco")).toBeTruthy();
expect(screen.getByRole("link", { name: "返回登录" }).getAttribute("href")).toBe("/login");
```

Add loading and failed-fetch states with a `重新加载` button. Assert no document heading uses `TapFlow 用户协议` or `TapFlow 隐私政策`.

- [ ] **Step 2: Run tests and verify RED**

```bash
npx vitest --run --exclude '.worktrees/**' src/legal/LegalDocumentPage.test.tsx src/app/routes.test.ts
```

Expected: FAIL because routes/components do not exist.

- [ ] **Step 3: Implement the public API client and page**

Define frontend types matching the public legal API. Render semantic `<article>`, `<nav aria-label="协议目录">`, section headings with stable IDs, effective/updated dates, and configured contact link. The page must not use native HTML injection; render structured paragraphs/items as React nodes.

- [ ] **Step 4: Register anonymous legal routes**

Add:

```ts
export const LEGAL_TERMS_ROUTE = "/legal/terms";
export const LEGAL_PRIVACY_ROUTE = "/legal/privacy";
```

Handle both routes before `AuthGate` in `AppRouter`, just like public auth routes. Unknown `/legal/*` routes redirect to `/legal/terms` or `/login`, rather than entering the protected shell.

- [ ] **Step 5: Add responsive and print styling**

Use a restrained white/neutral reading surface, max text width around 760 px, compact sticky table of contents only when space permits, and `@media print` rules that remove navigation while keeping version/date metadata. Use 8 px or smaller radii and no decorative cards or gradients.

- [ ] **Step 6: Run tests and build**

```bash
npx vitest --run --exclude '.worktrees/**' src/legal/LegalDocumentPage.test.tsx src/app/routes.test.ts
npm run build
```

Expected: PASS, with only documented existing Vite warnings.

- [ ] **Step 7: Commit**

```bash
git add src/legal src/app/routes.ts src/app/routes.test.ts src/app/AppRouter.tsx
git commit -m "feat(legal): add public Aittco policy pages"
```

## Task 6: Add Remembered Email, Password Visibility, And Consent Controls

**Files:**

- Create: `src/auth/rememberedEmailPreference.ts`
- Create: `src/auth/rememberedEmailPreference.test.ts`
- Create: `src/auth/LegalConsentControl.tsx`
- Modify: `src/auth/AuthFormControls.tsx`
- Modify: `src/auth/LoginPage.tsx`
- Modify: `src/auth/RegisterPage.tsx`
- Modify: `src/auth/AuthPages.test.tsx`
- Modify: `src/services/v2AuthClient.ts`
- Modify: `src/services/v2AuthClient.test.ts`
- Modify: `src/auth/useAuth.ts`
- Modify: `src/auth/AuthProvider.tsx`
- Modify: `src/auth/AuthProvider.test.tsx`

- [ ] **Step 1: Write remembered-email tests and verify RED**

Test this API:

```ts
getRememberedEmail(): string
setRememberedEmail(email: string): void
clearRememberedEmail(): void
```

Assert normalization to lowercase/trimmed email, malformed stored values returning `""`, and caught `SecurityError`/quota exceptions.

Run:

```bash
npx vitest --run --exclude '.worktrees/**' src/auth/rememberedEmailPreference.test.ts
```

Expected: FAIL because the helper does not exist.

- [ ] **Step 2: Implement remembered-email storage**

Use only `tapflow-auth-remembered-email-v1`. Never read or write password, OTP, tokens, or auth response data. Wrap every storage access in `try/catch`; storage failure must not throw into a form submission.

- [ ] **Step 3: Write failing auth-panel interaction tests**

Add tests proving:

- login opens with remembered email and empty password;
- unselected consent blocks API calls and focuses `我已阅读并同意`;
- selected consent adds current `termsVersion` and `privacyVersion` to login/register calls;
- a successful opted-in login saves email;
- a successful non-opted-in login clears email;
- failed login does not change remembered preference;
- password visibility toggles input type and accessible label;
- legal links target `/legal/terms` and `/legal/privacy` with `_blank` and `rel="noopener noreferrer"`.

- [ ] **Step 4: Extend auth input types and client payloads**

Use one shared frontend type:

```ts
export type LegalConsentInput = {
  privacyVersion: string;
  termsVersion: string;
};
```

Require `consent: LegalConsentInput` in `register` and `login` inputs across `useAuth`, `AuthProvider`, and `v2AuthClient`. Fetch `/legal/manifest` before rendering an enabled login/register submit action. Convert `LEGAL_CONSENT_VERSION_MISMATCH` into the Chinese refresh/review prompt while retaining the stable error code in `V2HttpError`.

- [ ] **Step 5: Implement controls and form behavior**

Enhance `AuthField` with an optional trailing icon button for password visibility. Implement `LegalConsentControl` using a real checkbox and two separate anchors. Put `记住账号` and `忘记密码？` on one utility row. Rename the login action to `立即登录`.

On successful login only:

```ts
if (rememberEmail) setRememberedEmail(email);
else clearRememberedEmail();
```

Registration requires consent but does not show or write the remembered-email preference.

- [ ] **Step 6: Run frontend auth tests**

```bash
npx vitest --run --exclude '.worktrees/**' src/auth/rememberedEmailPreference.test.ts src/auth/AuthPages.test.tsx src/auth/AuthProvider.test.tsx src/services/v2AuthClient.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/auth/rememberedEmailPreference.ts src/auth/rememberedEmailPreference.test.ts src/auth/LegalConsentControl.tsx src/auth/AuthFormControls.tsx src/auth/LoginPage.tsx src/auth/RegisterPage.tsx src/auth/AuthPages.test.tsx src/services/v2AuthClient.ts src/services/v2AuthClient.test.ts src/auth/useAuth.ts src/auth/AuthProvider.tsx src/auth/AuthProvider.test.tsx
git commit -m "feat(auth): add remembered email and legal consent"
```

## Task 7: Replace The Centered Dialog With The Responsive Auth Drawer

**Files:**

- Create: `src/auth/AuthDrawer.tsx`
- Create: `src/auth/AuthDrawer.test.tsx`
- Modify: `src/auth/AuthExperiencePage.tsx`
- Modify: `src/auth/landing/FilmStage.tsx`
- Modify: `src/auth/landing/FilmStage.test.tsx`
- Modify: `src/auth/landing/cinematicAuthHome.css`
- Delete: `src/auth/AuthDialog.tsx`
- Delete: `src/auth/AuthDialog.test.tsx`

- [ ] **Step 1: Write failing drawer behavior tests**

Port existing focus trap, scroll lock, pending dismissal, and concurrent-layer tests. Add structural assertions:

```ts
expect(drawer.getAttribute("data-placement")).toBe("right");
expect(screen.getByRole("button", { name: "关闭登录面板" })).toBeTruthy();
expect(screen.queryByText("让下一帧更有意义。")).toBeNull();
```

Add `FilmStage` coverage that `dialogOpen` sets a stage data attribute and hides/moves the chapter rail without pausing poster fallback behavior.

- [ ] **Step 2: Run tests and verify RED**

```bash
npx vitest --run --exclude '.worktrees/**' src/auth/AuthDrawer.test.tsx src/auth/AuthPages.test.tsx src/auth/landing/FilmStage.test.tsx
```

Expected: FAIL because `AuthDrawer` does not exist and the old centered structure remains.

- [ ] **Step 3: Implement `AuthDrawer`**

Reuse the proven focus/scroll-lock logic from `AuthDialog` but render:

```text
backdrop: full viewport, restrained film shade
desktop panel: fixed right, width clamp(480px, 42vw, 540px), full height
mobile panel: bottom sheet, max-height calc(100svh - safe top), scrollable body
```

Use one unnested surface. Header contains TapFlow product identity, title, supporting copy, and Lucide `X`. Preserve outside click/Escape behavior except while pending and restore invoking focus after close.

- [ ] **Step 4: Coordinate the film stage**

`AuthExperiencePage` renders `AuthDrawer`. Add `data-drawer-open` to the cinematic root. While open, keep the active video at the existing 0.35 playback rate, shift desktop content into the remaining viewport, and move/hide the rail. On mobile, retain full-bleed video behind the bottom sheet.

- [ ] **Step 5: Remove the old dialog after tests are green**

Delete `AuthDialog.tsx` and its test only after `rg -n "AuthDialog" src` returns no production imports.

- [ ] **Step 6: Run focused visual behavior tests and build**

```bash
npx vitest --run --exclude '.worktrees/**' src/auth/AuthDrawer.test.tsx src/auth/AuthPages.test.tsx src/auth/landing/FilmStage.test.tsx src/auth/landing/filmPlaybackPolicy.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/auth/AuthDrawer.tsx src/auth/AuthDrawer.test.tsx src/auth/AuthExperiencePage.tsx src/auth/landing/FilmStage.tsx src/auth/landing/FilmStage.test.tsx src/auth/landing/cinematicAuthHome.css
git rm src/auth/AuthDialog.tsx src/auth/AuthDialog.test.tsx
git commit -m "feat(auth): replace modal with cinematic auth drawer"
```

## Task 8: Add Deployment Configuration And Browser Acceptance

**Files:**

- Modify: `docker-compose.staging.yml`
- Modify: `docs/STAGING_ENV_TEMPLATE.md`
- Modify: `scripts/smoke-cinematic-auth-home.ts`
- Modify: `scripts/smoke-cinematic-auth-home.test.ts`
- Modify: `PROJECT_RECORD.md`

- [ ] **Step 1: Write failing deployment/smoke contract tests**

Extend the contract test to require:

```ts
expect(compose).toContain("LEGAL_CONTACT_URL: ${LEGAL_CONTACT_URL}");
expect(stagingTemplate).toContain("LEGAL_CONTACT_URL = https://example.com/contact");
expect(code).toContain("关闭登录面板");
expect(code).toContain("Aittco 用户协议");
expect(code).toContain("记住账号");
```

- [ ] **Step 2: Run the contract test and verify RED**

```bash
npm run test:smoke-cinematic-auth-home
```

Expected: FAIL because deployment configuration and new browser assertions are absent.

- [ ] **Step 3: Wire deployment configuration**

Add `LEGAL_CONTACT_URL` to `x-tapflow-env` so `tapflow-api` receives it. Document a non-secret placeholder and state that production deploy is blocked until the operator supplies an approved legal contact URL or `mailto:` address in `/opt/aittco/env/tapflow.staging.env`.

- [ ] **Step 4: Extend browser checks**

At `1440x900` assert the drawer is right-aligned, film remains visible/nonblank, rail does not overlap, consent blocks an unchecked submission, and both legal links open correct routes. At `390x844` assert the bottom sheet fits, scrolls, and exposes the submit button without overlap. Also verify remembered email survives a reload while password stays empty.

Update stale English smoke selectors to the current Chinese UI. Keep reduced-motion and one-active-video checks.

- [ ] **Step 5: Run smoke contract and built-browser smoke**

```bash
npm run test:smoke-cinematic-auth-home
npm run smoke:cinematic-auth-home
```

Expected: PASS and screenshots written under `output/playwright/cinematic-auth-home`; no blank-media or overlap assertion failures.

- [ ] **Step 6: Update the project record**

Add a dated entry describing the drawer, remembered-email boundary, Aittco legal pages, versioned server consent, migration, validation commands, and the requirement for operator legal review/contact configuration before production publication.

- [ ] **Step 7: Commit**

```bash
git add docker-compose.staging.yml docs/STAGING_ENV_TEMPLATE.md scripts/smoke-cinematic-auth-home.ts scripts/smoke-cinematic-auth-home.test.ts PROJECT_RECORD.md
git commit -m "test(auth): verify Aittco consent drawer rollout"
```

## Task 9: Full Verification And Release Readiness

**Files:**

- Verify only; modify task-owned files solely to fix discovered regressions.

- [ ] **Step 1: Run focused frontend tests**

```bash
npx vitest --run --exclude '.worktrees/**' src/auth/AuthDrawer.test.tsx src/auth/AuthPages.test.tsx src/auth/AuthProvider.test.tsx src/auth/rememberedEmailPreference.test.ts src/auth/landing/FilmStage.test.tsx src/auth/landing/filmPlaybackPolicy.test.ts src/legal/LegalDocumentPage.test.tsx src/services/v2AuthClient.test.ts src/app/routes.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run backend and database suites**

```bash
npm run test --workspace @aigc-flow/api -- auth.test.ts legal.test.ts env.test.ts
npm run test --workspace @aigc-flow/db -- user-legal-consents-migration.test.ts auth-email-device-migration.test.ts
npm run build --workspace @aigc-flow/api
npm run build --workspace @aigc-flow/db
```

Expected: PASS. If database infrastructure is unavailable, report which integration assertions were skipped and do not claim migration runtime verification.

- [ ] **Step 3: Run frontend build and browser acceptance**

```bash
npm run build
npm run test:smoke-cinematic-auth-home
npm run smoke:cinematic-auth-home
```

Expected: PASS with only already-documented non-blocking Vite warnings.

- [ ] **Step 4: Inspect content, secrets, and diff quality**

```bash
rg -n -F -e "TapFlow 用户协议" -e "TapFlow 隐私政策" src apps/api
rg -n -F -e "password" src/auth/rememberedEmailPreference.ts
git diff --check
git status --short
```

Expected: no old legal names; the remembered-email helper contains no password storage; `git diff --check` exits 0; unrelated dirty files remain unstaged.

- [ ] **Step 5: Confirm production gates**

Before deployment, confirm:

```text
LEGAL_CONTACT_URL is configured with an operator-approved channel
Aittco User Agreement draft has operator/legal review
Aittco Privacy Policy draft has operator/legal review
migration 000066 runs before API/frontend rollout
worker is stopped during migration per the staging runbook
```

Do not mark the legal pages production-approved when these gates are unresolved.

- [ ] **Step 6: Commit any verification-only fixes**

If verification required task-scoped fixes:

```bash
git add <only the files changed for those fixes>
git commit -m "fix(auth): resolve consent drawer verification issues"
```

If no fixes were needed, do not create an empty commit.
