# Supabase Migration Connection Design

## Context

The staging runtime currently uses a Supabase transaction-pooler connection on port 6543 for `DATABASE_URL`. That connection is appropriate for API and Worker query traffic, but it terminates sessions that execute the role and ownership DDL in personal-wallet migrations `000044` and `000045`.

Staging evidence established the boundary:

- migrations `000042` and `000043` are recorded;
- `000044` fails while executing its SQL and is rolled back;
- the callback role retains only Supabase's non-inheriting, non-settable automatic administration grant;
- the checkout function from `000044` is absent;
- repeated execution through the transaction pooler cannot complete the remaining ownership changes.

## Decision

Introduce a separate server-side environment variable:

```text
MIGRATION_DATABASE_URL=<Supabase direct connection or session-pooler connection on port 5432>
```

Keep the existing runtime connection unchanged:

```text
DATABASE_URL=<Supabase transaction-pooler connection on port 6543>
```

Docker Compose will provide a one-shot `tapflow-migrator` service built from the same production image. Inside that service only, `MIGRATION_DATABASE_URL` is mapped to `DATABASE_URL`, so the existing compiled migration CLIs use the direct/session connection without receiving a second credential name.

The long-running `tapflow-api` and `tapflow-worker` services will not receive `MIGRATION_DATABASE_URL`.

## Components

### `tapflow-migrator`

- Uses the same image/build context as `tapflow-api` and `tapflow-worker`.
- Uses `profiles: ["tools"]`, is explicitly invoked, and never starts during normal `up -d` deployment.
- Has no published ports, restart policy, Redis dependency, or persistent runtime.
- Receives only the environment needed by the compiled database CLIs:
  - `NODE_ENV=production`
  - `DATABASE_URL=${MIGRATION_DATABASE_URL:-}`
- Defaults to `node packages/db/dist/cli.js`.
- Supports command override for `personal-wallet-migration-cli.js --dry-run` and confirmed write mode.

### Runtime services

`tapflow-api` and `tapflow-worker` continue to receive the existing `DATABASE_URL` from `x-tapflow-env`. No application query path changes connection mode.

### External environment file

`/opt/aittco/env/tapflow.staging.env` stores both URLs. Repository templates contain placeholders only. The direct/session credential must never be committed, printed, passed as a shell argument, or included in screenshots.

## Deployment Flow

1. Obtain the Supabase Direct connection string. When Direct IPv6 connectivity is unavailable, use the Supabase Session Pooler on port 5432. Do not use Transaction Pooler port 6543 for migrations.
2. Add `MIGRATION_DATABASE_URL` to the external staging environment file.
3. Pull and build the current image.
4. Stop `tapflow-worker`.
5. Run schema migrations through `tapflow-migrator`.
6. Verify migrations `000042` through `000045` are recorded and the checkout functions exist.
7. Reconcile all terminal legacy reservations and orphan grant reservations before wallet migration write mode.
8. Run the personal-wallet dry run through `tapflow-migrator` and require:
   - `activeReservationCount: 0`;
   - no unresolved tenants;
   - equal source and migrated totals;
   - `verificationMatched: true`.
9. Run confirmed wallet write mode only after the dry-run gate passes.
10. Start and verify Redis, API, Worker, and frontend.

## Failure Handling

- Missing or blank `MIGRATION_DATABASE_URL` causes the one-shot CLI to fail before database work; it does not prevent normal runtime services from starting.
- A migration failure leaves Worker stopped. The operator inspects `schema_migrations` and reruns the idempotent migrator only after correcting the connection or SQL error.
- Runtime must not silently fall back from `MIGRATION_DATABASE_URL` to the pooled `DATABASE_URL` inside `tapflow-migrator`, because that would recreate the current failure mode.
- Local development keeps using `DATABASE_URL` and the existing local PostgreSQL container; the dedicated staging service is not required for ordinary local migration commands.

## Security

- Direct/session database credentials remain server-side and external to git.
- The credential is scoped to the one-shot migrator container rather than all long-running services.
- Logs report sanitized PostgreSQL error fields only and never serialize attached clients or connection parameters.
- The frontend and built Vite assets never receive either database URL.

## Verification

Implementation must add focused coverage that proves:

- Compose defines `tapflow-migrator` and maps only `MIGRATION_DATABASE_URL` into its `DATABASE_URL`;
- shared `x-tapflow-env`, API, and Worker do not expose `MIGRATION_DATABASE_URL`;
- repository environment and runbook documentation distinguish port 6543 runtime traffic from direct/session migration traffic;
- `docker compose config` succeeds with placeholder values;
- DB tests and DB/API/Worker/root builds remain green.

Live staging acceptance requires successful completion of migrations `000044` and `000045` through the new service. It does not authorize wallet write mode until the legacy reservation gate is separately clean.

## Non-Goals

- Do not change the API/Worker runtime database topology.
- Do not weaken callback-role ownership or RLS controls.
- Do not embed the migration credential in an image or repository file.
- Do not automatically mutate the 301.2 credits currently marked reserved in legacy grants; reconciliation requires separate evidence and an idempotent repair path.
