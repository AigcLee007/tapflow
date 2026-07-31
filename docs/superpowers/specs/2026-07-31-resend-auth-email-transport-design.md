# Resend Auth Email Transport Design

**Date:** 2026-07-31

## Objective

Replace Brevo with Resend as the server-side transport for registration and login-device verification emails. Keep the existing verification rules, database schema, API responses, frontend flow, and trusted-device behavior unchanged.

## Decisions

- Use Resend's HTTPS API directly through Node's built-in `fetch`; do not add the Resend SDK or another production dependency.
- Use `Art-Aittco <art@art.aittco.com>` as the production sender after the `art.aittco.com` domain is verified in Resend.
- Remove active Brevo runtime configuration instead of maintaining a provider switch.
- Keep the existing `AuthEmailSender` interface so `AuthService` and its database-backed tests remain transport-independent.
- Preserve the current ten-second timeout and fail-closed behavior.

## Architecture

`AuthService` continues to generate one-time codes and call `AuthEmailSender.sendVerificationCode`. The production application constructs `ResendAuthEmailSender`, which sends one request to `https://api.resend.com/emails` with an `Authorization: Bearer <key>` header.

The transport request contains:

```json
{
  "from": "Art-Aittco <art@art.aittco.com>",
  "to": ["recipient@example.com"],
  "subject": "Your Art-Aittco verification code",
  "html": "<p>...</p>",
  "text": "Your verification code is ..."
}
```

Any non-2xx response, network failure, malformed response, or timeout becomes the existing sanitized `AuthEmailDeliveryError`. The application continues returning `EMAIL_DELIVERY_FAILED` without issuing access, refresh, or trusted-device tokens.

## Configuration

Production requires these server-only variables:

```text
RESEND_API_KEY=<secret>
RESEND_FROM_EMAIL=art@art.aittco.com
RESEND_FROM_NAME=Art-Aittco
```

`docker-compose.staging.yml` injects these variables into the v2 runtime environment. Active staging templates and runbooks use only `RESEND_*`; historical design and project records may retain Brevo references as historical facts.

The Resend API key, Authorization header, verification code, challenge token, trusted-device token, and full recipient address must not be written to frontend responses, audit metadata, application logs, repository files, or screenshots.

## Operational Setup

Before deployment:

1. Add `art.aittco.com` in Resend Domains.
2. Copy the exact DNS records supplied by Resend into Alibaba Cloud DNS and wait for Resend to show the domain as verified.
3. Create a sending API key in Resend and store it only in `/opt/aittco/env/tapflow.staging.env`.
4. Replace the three `BREVO_*` entries with the three `RESEND_*` entries.
5. Rebuild and restart through `docker-compose.staging.yml`; no database migration is required for this transport-only change.

## Testing

- Sender unit tests verify the Resend URL, Bearer authorization, sender formatting, recipient array, message content, AbortSignal, timeout, and sanitized failures.
- Environment tests verify trimming and production requirements for all three `RESEND_*` variables and confirm that `BREVO_*` variables are no longer required.
- Existing auth integration tests remain unchanged because they inject an in-memory `AuthEmailSender`.
- Build the database dependency, API, and complete frontend before deployment.
- After deployment, send one direct Resend API smoke email, then verify registration, unverified-account login recovery, same-device login, new-device verification, resend cooldown, and secret-free logs.

## Non-Goals

- Supporting Brevo and Resend simultaneously.
- Adding a user-facing email-provider setting.
- Changing verification codes, challenge lifetimes, device trust rules, database tables, or frontend screens.
- Implementing marketing email, inbound email, password reset, or email templates beyond the existing verification message.
