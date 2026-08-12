# Aittco Auth Drawer And Legal Consent Design

**Date:** 2026-08-12

**Status:** Approved

**Primary goal:** Upgrade the cinematic TapFlow authentication experience with a desktop right-side auth drawer, a mobile bottom sheet, remembered email, and auditable consent to the Aittco User Agreement and Aittco Privacy Policy.

## 1. Scope And Naming

The product UI continues to use the `TapFlow` product name and existing Aittco brand mark. Legal content uses `Aittco` consistently:

- `Aittco 用户协议`
- `Aittco 隐私政策`
- legal operating subject: `Aittco`

The legal documents must not refer to the service operator as TapFlow. TapFlow may appear only when a document needs to identify the product provided by Aittco, for example: `Aittco 通过 TapFlow 产品向用户提供服务`.

This release keeps email-and-password authentication. It does not add mobile-number login, SMS verification, social login, or a TapFlow-managed password vault.

## 2. Experience Direction

The approved direction keeps the existing four-chapter cinematic film stage and replaces the centered split dialog with a right-side authentication drawer.

### 2.1 Desktop

- The film stage remains full viewport and continues to own chapter selection, playback, preload, poster fallback, and reduced-motion behavior.
- The auth drawer is fixed to the right edge and occupies approximately 480-540 px, capped at 45% of the viewport width.
- The remaining viewport continues to expose the active film and chapter content.
- Opening the drawer applies a restrained dark shade to the film and slows the active film to approximately 0.35x where supported.
- The drawer uses a near-black neutral surface, a fine neutral border, and an 8 px or smaller corner treatment. It does not use cyan glow, purple gradients, decorative glass, or nested cards.
- The existing right-side chapter rail moves or hides while the drawer is open so it never sits beneath the drawer.

### 2.2 Mobile

- The active film remains the full-screen background.
- Authentication appears as a bottom sheet within safe-area bounds.
- The sheet body scrolls independently when verification, registration, or password reset needs more height.
- The legal consent row wraps naturally and remains above the submit button without overlap.
- The close button, title, fields, validation text, and primary action remain visible at 390 x 844 and representative smaller widths.

### 2.3 Drawer Header And States

The drawer header contains the TapFlow product identity, a concise Chinese title, optional supporting copy, and an icon close control with the accessible name `关闭登录面板`.

The same drawer shell hosts:

- login;
- registration;
- email or trusted-device verification;
- password reset request and completion;
- pending, field-validation, API-error, and success states.

Direct visits to `/register` and `/forgot-password` keep the corresponding state open. The existing `returnTo` behavior remains authoritative.

## 3. Login Form

The login state contains:

1. `邮箱` field with `autocomplete="email"`.
2. `密码` field with `autocomplete="current-password"`.
3. A familiar eye icon for password visibility, with accessible labels for show and hide states.
4. A `记住账号` checkbox.
5. A `忘记密码？` action aligned on the same utility row.
6. A primary action labeled `立即登录`.
7. A secondary action labeled `创建账号`.
8. A required legal consent control.

The form does not include mobile-number tabs or placeholder controls for unsupported login methods.

## 4. Remembered Email

`记住账号` means remember the email address only.

- TapFlow never stores the user's password, verification code, or complete login response for this feature.
- The password field relies on standard browser password-manager behavior.
- A dedicated UI-preference helper owns an isolated key such as `tapflow-auth-remembered-email-v1`.
- When selected, a successful login stores the normalized email address.
- When cleared, a successful login removes the remembered email.
- A remembered email pre-fills the login form and leaves the password field empty.
- If browser storage is unavailable or throws, login remains functional and the preference silently degrades to the current page session.
- This preference is not an authoritative account or canvas store and must not be read by backend services.

## 5. Legal Consent UI

Login and registration display one unchecked checkbox with this copy:

```text
我已阅读并同意《Aittco 用户协议》和《Aittco 隐私政策》
```

Both document names are keyboard-accessible links. They open the corresponding public legal route in a new browser tab, preserving all form input in the current tab.

Consent rules:

- Consent is unchecked whenever an anonymous login or registration form opens.
- The client does not query or infer an account's prior consent before credential validation, preventing account-status disclosure.
- Submitting while consent is required and unchecked does not call the auth API.
- The form exposes an inline error: `请先阅读并同意 Aittco 用户协议和 Aittco 隐私政策。`
- Keyboard focus moves to the consent control after a blocked submission.
- Login, registration, verification, and password-reset requests remain disabled only for their own pending state; reading a legal page does not destroy form state.

## 6. Public Legal Routes

Add two routes that are accessible without authentication:

```text
/legal/terms
/legal/privacy
```

Each page provides:

- Aittco brand identity and document title;
- current version;
- effective date and last-updated date;
- a compact table of contents on desktop;
- readable single-column content on mobile;
- a print-friendly layout;
- a link back to the login page;
- a legal contact entry sourced from an operator-approved production configuration.

Production publication is blocked until the operator provides an approved legal contact URL or email through deployment configuration. Repository defaults and tests use a clearly non-production fixture; the application must not invent a production email address.

## 7. Aittco User Agreement Content

The first legal draft must cover at least:

1. Agreement scope, acceptance, and updates.
2. Aittco as service operator and TapFlow as the product/service name.
3. Account registration, truthful information, credential safety, and account responsibility.
4. TapFlow services: AI Flow workspace, projects, canvas, prompts, generated media, assets, billing, and related features.
5. AI output uncertainty, user review obligations, and no guarantee that generated content is accurate, unique, lawful, or fit for a particular purpose.
6. User content rights, permissions required for uploaded content, and user responsibility for prompts and outputs.
7. Prohibited content and behavior, including illegal, infringing, fraudulent, abusive, malicious, or restriction-bypassing use.
8. Credits, estimates, reservation, settlement, refund/release on failure, and price-adjustment notices.
9. Third-party model and infrastructure dependencies.
10. Service changes, suspension, account restriction, and termination.
11. Intellectual-property notices for Aittco and TapFlow product materials.
12. Disclaimers and limitation of liability to the extent permitted by applicable law.
13. User complaints, legal contact entry, governing rules, and effective date.

The agreement is a product legal draft and requires review by the actual operator before production publication.

## 8. Aittco Privacy Policy Content

The first legal draft must cover at least:

1. Scope and the relationship between Aittco and TapFlow.
2. Account information such as email address and optional display name.
3. Authentication, security, device, network, login, and audit information.
4. Project, canvas, prompt, asset, generated-media, billing, and operational metadata processed to provide the service.
5. Data sent to selected AI providers only as required to perform user-requested generation.
6. Object storage, database, queue, email, observability, and other service-provider categories.
7. Processing purposes and the minimum-necessary principle.
8. Retention, deletion, backup, and legal-compliance periods.
9. User access, correction, export, deletion, account cancellation, and privacy-request channels.
10. Cookies, browser local storage, trusted-device tokens, remembered email, and browser password managers.
11. Security measures and incident response.
12. Cross-region or third-party processing disclosures where applicable.
13. Rules for minors and the minimum permitted age.
14. Material policy updates and renewed consent.
15. Contact entry, version, and effective date.

The policy explicitly states that the remembered-account feature stores only an email address and that Aittco does not receive or store passwords saved by the browser's password manager.

The privacy policy is a product legal draft and requires review by the actual operator before production publication.

## 9. Versioning And Server Records

Legal content uses explicit immutable version identifiers, initially formatted as an effective date such as `2026-08-12`.

The backend exposes a public legal-manifest response containing only non-secret data:

```ts
{
  terms: { version: string; effectiveAt: string; requiresConsent: boolean };
  privacy: { version: string; effectiveAt: string; requiresConsent: boolean };
}
```

A new account-level consent table records acceptance. The table is not tenant-scoped because one Aittco user may belong to multiple tenants.

Suggested fields:

```text
id
user_id
document_type       // terms | privacy
document_version
consented_at
consent_source      // auth_login | auth_register | account_reconsent
created_at
```

Constraints and access:

- unique `(user_id, document_type, document_version)` so repeated consent to the same version is idempotent;
- indexes on `(user_id, document_type, document_version)`;
- frontend responses never expose raw IP addresses or complete user-agent strings;
- ordinary users may read their current consent status but cannot rewrite historical timestamps;
- inserts happen only inside authenticated server workflows.

## 10. Auth API Contract

Registration and login requests add a structured consent payload:

```ts
consent: {
  termsVersion: string;
  privacyVersion: string;
}
```

The server validates the submitted versions against the current required manifest. It records consent only after credentials are accepted and the relevant user identity is known.

For login:

- the anonymous form always requires the user to select the legal checkbox before submitting credentials;
- an existing valid acceptance for both versions is reused idempotently after credential validation rather than creating duplicate history rows;
- a missing or materially outdated acceptance creates the current version records after successful credential validation;
- version mismatch returns a stable error such as `LEGAL_CONSENT_VERSION_MISMATCH`, prompting the client to refresh the legal manifest;
- failed credential attempts do not create consent records.

For registration:

- current agreement and privacy versions are always required;
- user creation and consent recording occur in one transaction or in an equivalently atomic flow;
- registration cannot succeed if consent persistence fails.

Non-material editorial updates keep the existing version. A material change publishes a new version and sets `requiresConsent`; the next successful login records the newly selected version before issuing the authenticated session.

## 11. Component Boundaries

Implementation should preserve the existing auth and film responsibilities:

- `FilmStage`: unchanged owner of cinematic chapters and media playback.
- `AuthExperiencePage`: owns drawer state, auth mode, route behavior, and film/drawer coordination.
- `AuthDrawer`: replaces the present centered dialog shell and owns focus trap, dismissal, scroll lock, and responsive placement.
- `AuthFormControls`: gains checkbox, password visibility, legal error, and dark-theme field primitives.
- `RememberedEmailPreference`: owns isolated best-effort email persistence.
- `LegalConsentControl`: owns consent UI and link behavior, not server persistence.
- `legalDocumentManifest`: exposes current client document URLs and versions.
- public legal API and consent repository: own authoritative versions and audit records.

Existing v2 auth clients, request guards, trusted-device verification, token handling, tenant behavior, and `returnTo` navigation remain authoritative.

## 12. Security And Privacy Boundaries

- Never store a password, OTP, raw auth response, or provider secret for remembered-account behavior.
- Do not log consent payloads together with credentials.
- Do not expose IP addresses, raw user agents, tokens, or credential data in legal status responses.
- Password visibility is local component state and resets when the auth mode changes or drawer closes.
- Legal links use `rel="noopener noreferrer"` when opened in a new tab.
- Authentication failures must not reveal whether an account has previously consented.
- Server validation is authoritative; the checkbox alone is not evidence of consent.

## 13. Failure Behavior

- Legal manifest unavailable: show a non-destructive error and disable login/registration submission until current required versions can be established.
- Legal document route unavailable: keep the auth form intact and allow the user to retry opening the document; do not treat the document as accepted.
- Browser storage unavailable: remember-email silently degrades, while login remains usable.
- Consent version changes while the page is open: server rejects the stale version, client refreshes the manifest, clears consent, and asks the user to review again.
- Consent persistence fails after credential validation: do not issue a successful registration or new login session.
- Video failure or reduced motion: existing poster fallback remains operational and does not block authentication.

## 14. Accessibility And Responsive Requirements

- Drawer uses `role="dialog"`, an accessible title, focus trap, Escape dismissal, and focus restoration.
- Dismissal remains blocked while an auth request is pending.
- Checkbox and legal links are separate keyboard targets with visible focus states.
- Password visibility uses a familiar icon with a tooltip and changing accessible label.
- Validation uses `role="alert"` or an equivalent announced region and associates errors with the relevant control.
- All text meets readable contrast against the dark drawer.
- No text, checkbox, button, chapter rail, or playback control overlaps at supported desktop and mobile viewports.

## 15. Verification

Focused frontend tests cover:

- drawer placement, focus management, pending dismissal, and mode switches;
- remembered email load, successful save, successful removal, malformed data, and storage exceptions;
- password visibility and accessible labels;
- consent default state, blocked submission, error focus, legal links, and accepted submission payload;
- direct `/register`, `/forgot-password`, `/legal/terms`, and `/legal/privacy` routing;
- existing verification, reset, trusted-device, and `returnTo` behavior.

Backend and database tests cover:

- current legal manifest;
- registration requiring and atomically recording both current versions;
- login reusing existing current consent;
- material-version reconsent;
- stale-version rejection;
- failed credential attempts not recording consent;
- idempotent acceptance records and authorization boundaries.

Browser QA verifies desktop and mobile screenshots, visible nonblank film content, one-active-video playback, drawer scrolling, no overlap, legal-page navigation, consent validation, remembered email, and complete login/register flows. `npm run build` and relevant auth/API/database suites are required.

## 16. Rollout

1. Add legal routes, document drafts, current-version manifest, and server consent storage.
2. Deploy migrations and API validation before requiring consent in the frontend.
3. Deploy the auth drawer with remembered email and legal controls.
4. Review both legal drafts with the actual operator before production publication.
5. Mark the first production versions current only after legal approval.
6. Monitor login and registration failure codes after rollout.

Rollback disables the frontend consent requirement only when the backend current-version configuration is also reverted. Historical consent records remain immutable.

## 17. Non-Goals

- Mobile-number or SMS login.
- Social or third-party login.
- TapFlow-managed password storage or cross-device credential sync.
- Changes to trusted-device token architecture.
- Runtime generation of auth background videos.
- Changes to workspace, canvas, asset, billing, or AI Gateway architecture.
- Legal advice or a claim that product-authored drafts are production-ready without operator review.

## 18. Acceptance Criteria

- Desktop authentication opens as a right-side dark drawer while the existing cinematic film remains visible and operational.
- Mobile authentication opens as a usable bottom sheet without overlap.
- Login remembers only an opted-in email address and never stores a password.
- Login and registration enforce acceptance of the current Aittco User Agreement and Aittco Privacy Policy.
- Public legal pages are reachable without authentication and use Aittco consistently as the legal operator.
- Server records the accepted document type, version, time, and source only after valid authentication identity is established.
- Existing verification, password recovery, trusted-device, tenant, and `returnTo` behavior continues to work.
- Focused tests, browser QA, and production build pass before release.
