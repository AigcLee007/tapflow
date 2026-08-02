# Password Reset Design

## Goal

Add a secure email-code password recovery flow to the v2 authentication experience. A user can request a six-digit code, set a new password, and return to login. A successful reset invalidates every existing session for the account.

## Scope

This change covers:

- a `忘记密码？` entry on the existing login page;
- a public `/forgot-password` page with request and confirmation states;
- anonymous v2 API endpoints for request, resend, and confirmation;
- a password-reset purpose in the existing email challenge store;
- a dedicated Resend password-reset email;
- session and refresh-token revocation after a successful reset;
- focused database, API, email, client, page, and browser coverage.

This change does not add an authenticated password-change screen, recovery links, SMS recovery, support-assisted recovery, or a second email provider.

## User Experience

The login form displays `忘记密码？` next to the password label. It navigates to `/forgot-password` without changing the normal login and registration routes.

The recovery page has two states:

1. The user enters an email address and submits the request.
2. The page displays fields for the six-digit code, new password, and password confirmation. It also provides resend and return-to-login actions.

The request result always uses the same message: `如果该邮箱已注册，验证码已发送。` This prevents the page from revealing whether an address belongs to an account.

After a successful reset, the page navigates to `/login` and displays `密码已重置，请重新登录。` The reset does not create a new authenticated session.

The page follows the existing auth shell, field, button, responsive layout, and Chinese copy conventions. Password fields use appropriate autocomplete values, and the code field supports numeric input and keyboard submission.

## API Contract

### Request a reset

`POST /api/v2/auth/password-reset/request`

Request:

```json
{
  "email": "user@example.com"
}
```

Response: HTTP 202 for syntactically valid requests.

```json
{
  "challengeToken": "opaque-token",
  "expiresInSeconds": 600,
  "resendAvailableInSeconds": 60,
  "message": "如果该邮箱已注册，验证码已发送。"
}
```

For an unknown email, the API returns the same shape with a random, non-persisted challenge token. It does not send an email.

### Resend the code

`POST /api/v2/auth/password-reset/resend`

Request:

```json
{
  "challengeToken": "opaque-token"
}
```

For a valid challenge after the cooldown, the API replaces the stored code hash, resets the attempt count and expiry, and sends a new code. The previous code stops working. Responses do not expose the email address or account status.

The client enables resend only after the server-provided cooldown. Valid, cooling-down, synthetic, consumed, and expired challenge tokens all receive the same HTTP 200 response shape. Only an eligible real challenge causes email delivery. This prevents the resend endpoint from becoming an account-enumeration side channel.

### Confirm the reset

`POST /api/v2/auth/password-reset/confirm`

Request:

```json
{
  "challengeToken": "opaque-token",
  "code": "123456",
  "newPassword": "new-password"
}
```

Response: HTTP 200 after the password update and session revocation commit.

```json
{
  "message": "密码已重置，请重新登录。"
}
```

The password schema accepts 8 to 256 characters, matching registration. The browser validates password confirmation, while the API remains authoritative for password length and code validation.

## Data Model

A forward-only migration extends `auth_email_challenges`:

- `purpose` accepts `password_reset`;
- `reason` accepts `password_reset`.

Password-reset challenges use the existing columns for challenge-token hash, code hash, attempt count, last-send time, expiration, consumption, and timestamps. `user_id` identifies the global user. `tenant_id` is null because credentials and sessions belong to the user across all tenant memberships.

No plaintext code, password, raw challenge token, or email body is stored. Existing registration, email-verification, and device-verification challenge records remain valid.

## Service Flow

### Request

1. Normalize the submitted email by trimming and lowercasing it.
2. Look up an active user without tenant context.
3. If no user exists, create a random response token in memory and return the generic response.
4. If a user exists, invalidate any pending password-reset challenges for that user.
5. Generate a random challenge token and six-digit code.
6. Store only the SHA-256 challenge-token hash and the keyed code hash with a ten-minute expiry and five attempts.
7. Send the password-reset code through `AuthEmailSender`.
8. Return the generic response and never return the code.

The request is covered by the existing authentication rate-limit configuration. Email-provider failures are logged with sanitized metadata and do not change the account-enumeration-safe public response.

### Resend

1. Hash and lock the challenge identified by the supplied token.
2. If it is a pending password-reset challenge outside the 60-second cooldown, generate and persist a new keyed code hash, reset attempts to five, extend expiry to ten minutes, and send the new code.
3. Return the same generic response for eligible, cooling-down, missing, consumed, and expired challenges without account details.

### Confirm

1. Start a database transaction and lock the matching challenge row.
2. Reject a missing, wrong-purpose, consumed, expired, or exhausted challenge.
3. Compare the submitted code in constant-time form against the keyed stored hash.
4. On a wrong code, decrement attempts and commit that state before returning the validation error.
5. Hash the new password with the existing password helper.
6. Update `users.password_hash` and `users.updated_at`.
7. Mark the challenge consumed and invalidate other pending password-reset challenges for the user.
8. Revoke all active `auth_sessions` and `refresh_tokens` for the user.
9. Write a secret-free audit event and commit.

The row lock and consumed marker guarantee that concurrent confirmation requests cannot both succeed.

## Email Delivery

`AuthEmailSender` gains a dedicated `sendPasswordResetCode` method. The Resend implementation uses the existing API key, sender address, sender name, timeout, and server-only HTTP transport.

The subject and body clearly state that the code resets an Art-Aittco password, expires in ten minutes, and should be ignored if the recipient did not request it. Both plain-text and HTML forms are provided. Neither form includes a password, challenge token, tenant information, or login session details.

No new deployment secret is required. The existing `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and `RESEND_FROM_NAME` variables remain sufficient.

## Errors And Security

- Request responses do not reveal whether an email exists.
- Codes expire after ten minutes and allow five failed attempts.
- Resend is unavailable for 60 seconds and invalidates the previous code, while its public response remains identical for real and synthetic challenges.
- The API validates email, token, code, and password schemas before service execution.
- Password hashes use the existing password helper and never enter logs or responses.
- Reset confirmation does not issue access, refresh, or trusted-device tokens.
- Successful reset revokes every session and refresh token owned by the user across tenants.
- Logs and audit events exclude codes, raw challenge tokens, passwords, Resend authorization, and email bodies.
- Existing authentication rate limiting applies to request, resend, and confirmation endpoints.

Malformed request schemas remain distinguishable. Confirmation uses one generic invalid-or-expired error for a wrong code, missing challenge, expired challenge, consumed challenge, or exhausted attempts so those states cannot disclose account existence. The client represents the resend cooldown locally from server-provided metadata.

## Testing

### Database

- Verify the migration extends the purpose and reason constraints without removing existing allowed values.
- Verify challenge indexes and existing authentication migration expectations remain intact.

### API and service

- Registered and unknown emails return the same status and response shape.
- Unknown emails do not create a challenge or send mail.
- Stored reset records contain hashes rather than the raw token or code.
- A new request invalidates older pending reset challenges.
- Resend enforces cooldown and makes the old code invalid.
- Wrong codes decrement attempts; exhausted, expired, consumed, and wrong-purpose challenges fail.
- A successful confirmation lets the new password log in and rejects the old password.
- A successful confirmation revokes every session and refresh token for the user.
- Two concurrent confirmations yield one success at most.
- Existing registration and device-verification flows continue to pass.

### Email sender

- The Resend request uses the password-reset subject and includes the code and expiry in HTML and text.
- The authorization header remains server-side.
- Provider failures produce the sanitized delivery error path.

### Frontend

- The login-page entry navigates to `/forgot-password`.
- The request form calls the v2 client and switches to the confirmation state.
- Code input, password length, and password confirmation are validated.
- Resend remains disabled during cooldown and uses the challenge token when enabled.
- Success returns to login with the reset confirmation message.
- API errors render without destroying the current recovery state.

### Acceptance

- Run focused database, API auth, email-sender, v2 auth-client, and auth-page tests.
- Run the relevant database and API workspace suites.
- Run `npm run build` from the repository root.
- Use browser automation on desktop and mobile widths to complete the visual and interaction checks.
- Update `PROJECT_RECORD.md` with the completed auth capability and validation results.

## Deployment And Rollback

Deployment uses the documented Docker Compose v2 order: build images, stop the worker, apply the compiled database migration once, then start Redis, API, worker, and frontend. No new environment values are required.

Rollback should redeploy the previous application commit. The additive challenge constraint is harmless to older code and does not require destructive data rollback. Existing active sessions remain revoked if a password reset completed before rollback.
