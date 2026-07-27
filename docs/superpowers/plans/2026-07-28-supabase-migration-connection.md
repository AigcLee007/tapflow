# Supabase Migration Connection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a one-shot Docker Compose migrator that uses a Supabase Direct or Session Pooler connection without exposing that credential to long-running API or Worker containers.

**Architecture:** Keep runtime `DATABASE_URL` on the existing transaction pooler. Add `tapflow-migrator` under the `tools` Compose profile and map external `MIGRATION_DATABASE_URL` to `DATABASE_URL` only inside that service, allowing the existing compiled CLIs to run unchanged. Protect the credential boundary with a static Compose regression test and document the exact staging commands.

**Tech Stack:** Docker Compose v2, Node.js 22, Vitest, TypeScript, PostgreSQL 17, Supabase

---

### Task 1: Add The Dedicated Migrator Service

**Files:**
- Create: `scripts/staging-migrator-compose.test.ts`
- Create: `scripts/fixtures/staging-compose.env`
- Modify: `docker-compose.staging.yml`

- [ ] **Step 1: Write the failing Compose boundary tests**

Create `scripts/fixtures/staging-compose.env` with non-secret validation values:

```dotenv
DATABASE_URL=postgres://runtime:runtime@runtime-db.example:6543/tapflow
MIGRATION_DATABASE_URL=postgres://migrator:migrator@direct-db.example:5432/tapflow
CREDENTIAL_MASTER_KEY=0000000000000000000000000000000000000000000000000000000000000000
JWT_ACCESS_SECRET=test-access-secret
JWT_REFRESH_SECRET=test-refresh-secret
S3_ENDPOINT=https://s3.example.invalid
S3_REGION=ap-northeast-1
S3_BUCKET=tapflow-test
S3_ACCESS_KEY_ID=test-access-key
S3_SECRET_ACCESS_KEY=test-secret-key
```

Create `scripts/staging-migrator-compose.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, test } from "vitest";

const composePath = path.resolve(import.meta.dirname, "../docker-compose.staging.yml");

function serviceBlock(compose: string, serviceName: string): string {
  const match = compose.match(
    new RegExp(`\\n  ${serviceName}:\\r?\\n[\\s\\S]*?(?=\\n  [a-zA-Z0-9_-]+:\\r?\\n|\\nvolumes:)`),
  );
  if (!match) throw new Error(`Missing Compose service ${serviceName}`);
  return match[0];
}

describe("staging migration connection", () => {
  test("isolates the direct database URL to the one-shot migrator", async () => {
    const compose = await readFile(composePath, "utf8");
    const sharedEnvironment = compose.slice(0, compose.indexOf("services:"));
    const api = serviceBlock(compose, "tapflow-api");
    const worker = serviceBlock(compose, "tapflow-worker");
    const migrator = serviceBlock(compose, "tapflow-migrator");

    expect(sharedEnvironment).not.toContain("MIGRATION_DATABASE_URL");
    expect(api).not.toContain("MIGRATION_DATABASE_URL");
    expect(worker).not.toContain("MIGRATION_DATABASE_URL");
    expect(migrator).toContain('profiles: ["tools"]');
    expect(migrator).toContain("DATABASE_URL: ${MIGRATION_DATABASE_URL:-}");
    expect(migrator).toContain('command: ["node", "packages/db/dist/cli.js"]');
    expect(migrator).not.toContain("ports:");
    expect(migrator).not.toContain("tapflow-redis");
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm test -- scripts/staging-migrator-compose.test.ts
```

Expected: FAIL with `Missing Compose service tapflow-migrator`.

- [ ] **Step 3: Add the minimal one-shot Compose service**

Add this service after `tapflow-worker` in `docker-compose.staging.yml`:

```yaml
  tapflow-migrator:
    profiles: ["tools"]
    build: .
    restart: "no"
    command: ["node", "packages/db/dist/cli.js"]
    environment:
      NODE_ENV: production
      DATABASE_URL: ${MIGRATION_DATABASE_URL:-}
```

Do not add `MIGRATION_DATABASE_URL` to `x-tapflow-env`, `tapflow-api`, or `tapflow-worker`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
npm test -- scripts/staging-migrator-compose.test.ts
```

Expected: PASS, 1 test.

- [ ] **Step 5: Validate the rendered Compose model**

Run from a shell with placeholder values for all required Compose inputs:

```bash
docker compose --env-file scripts/fixtures/staging-compose.env -f docker-compose.staging.yml --profile tools config --quiet
```

Expected: exit 0 with no rendered secret output.

- [ ] **Step 6: Commit the service and test**

```bash
git add docker-compose.staging.yml scripts/staging-migrator-compose.test.ts scripts/fixtures/staging-compose.env
git commit -m "feat(deploy): add dedicated database migrator"
```

### Task 2: Document The Migration Credential And Commands

**Files:**
- Modify: `docs/STAGING_ENV_TEMPLATE.md`
- Modify: `docs/staging-runbook.md`
- Modify: `docs/PRODUCTION_DEPLOYMENT.md`
- Modify: `docs/PRODUCTION_RUNBOOK.md`
- Test: `scripts/staging-migrator-compose.test.ts`

- [ ] **Step 1: Extend the failing test with documentation requirements**

Add a second test inside the existing `describe` block in `scripts/staging-migrator-compose.test.ts`:

```ts
test("documents direct migrations without replacing the runtime pooler", async () => {
  const [template, stagingRunbook, productionDeployment, productionRunbook] = await Promise.all([
    readFile(path.resolve(import.meta.dirname, "../docs/STAGING_ENV_TEMPLATE.md"), "utf8"),
    readFile(path.resolve(import.meta.dirname, "../docs/staging-runbook.md"), "utf8"),
    readFile(path.resolve(import.meta.dirname, "../docs/PRODUCTION_DEPLOYMENT.md"), "utf8"),
    readFile(path.resolve(import.meta.dirname, "../docs/PRODUCTION_RUNBOOK.md"), "utf8"),
  ]);

  expect(template).toContain("MIGRATION_DATABASE_URL");
  expect(template).toContain("Session Pooler");
  expect(stagingRunbook).toContain("run --rm tapflow-migrator");
  expect(stagingRunbook).toContain("personal-wallet-migration-cli.js --dry-run");
  expect(productionDeployment).toContain("MIGRATION_DATABASE_URL");
  expect(productionRunbook).toContain("tapflow-migrator");
  expect(productionRunbook).toContain("port 6543");
  expect(productionRunbook).toContain("port 5432");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm test -- scripts/staging-migrator-compose.test.ts
```

Expected: FAIL because the four deployment documents do not yet contain the new variable and commands.

- [ ] **Step 3: Update the staging environment template**

In `docs/STAGING_ENV_TEMPLATE.md`, replace the single database entry with:

```markdown
- `DATABASE_URL =<secret: Supabase Transaction Pooler connection string, port 6543>`
- `MIGRATION_DATABASE_URL =<secret: Supabase Direct connection or Session Pooler connection string, port 5432>`
```

State that both values remain only in `/opt/aittco/env/tapflow.staging.env`, and that the migration value is scoped to `tapflow-migrator`.

- [ ] **Step 4: Replace API-based migration commands in the runbooks**

Use these schema and dry-run commands in `docs/staging-runbook.md`, `docs/PRODUCTION_DEPLOYMENT.md`, and `docs/PRODUCTION_RUNBOOK.md`:

```bash
docker compose --env-file /opt/aittco/env/tapflow.staging.env \
  -f docker-compose.staging.yml run --rm tapflow-migrator \
  node packages/db/dist/cli.js

docker compose --env-file /opt/aittco/env/tapflow.staging.env \
  -f docker-compose.staging.yml run --rm tapflow-migrator \
  node packages/db/dist/personal-wallet-migration-cli.js --dry-run
```

Use this command only after the dry-run acceptance gate passes:

```bash
docker compose --env-file /opt/aittco/env/tapflow.staging.env \
  -f docker-compose.staging.yml run --rm tapflow-migrator \
  node packages/db/dist/personal-wallet-migration-cli.js \
  --write --confirm PERSONAL_WALLET_CUTOVER
```

Document these invariants next to the commands:

- `DATABASE_URL` on port 6543 remains the API/Worker runtime connection.
- `MIGRATION_DATABASE_URL` must use Direct or Session Pooler port 5432.
- Never print either URL or put it directly in the shell command.
- Keep Worker stopped until schema migration, legacy reservation reconciliation, wallet dry run, and confirmed wallet write are complete.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run:

```bash
npm test -- scripts/staging-migrator-compose.test.ts
```

Expected: PASS, 2 tests.

- [ ] **Step 6: Commit the documentation**

```bash
git add docs/STAGING_ENV_TEMPLATE.md docs/staging-runbook.md docs/PRODUCTION_DEPLOYMENT.md docs/PRODUCTION_RUNBOOK.md scripts/staging-migrator-compose.test.ts
git commit -m "docs: document direct database migrations"
```

### Task 3: Verify And Record The Deployment Boundary

**Files:**
- Modify: `PROJECT_RECORD.md`

- [ ] **Step 1: Run focused and package verification**

Run:

```bash
npm test -- scripts/staging-migrator-compose.test.ts
npm run test --workspace @aigc-flow/db
npm run build --workspace @aigc-flow/db
npm run build --workspace @aigc-flow/api
npm run build --workspace @aigc-flow/worker
npm run build
```

Expected: focused tests pass; DB tests pass with only database-dependent skips when local `DATABASE_URL` is unavailable; all builds exit 0. Existing Browserslist, dynamic-import, and chunk-size warnings are acceptable.

- [ ] **Step 2: Search for credential leakage**

Run:

```bash
rg -n "MIGRATION_DATABASE_URL" docker-compose.staging.yml docs scripts packages src apps
```

Expected: occurrences are limited to the migrator service, deployment documentation, design/plan files, and the focused test. There must be no occurrence in frontend source, API/Worker runtime configuration, or `x-tapflow-env`.

- [ ] **Step 3: Record implementation verification**

Add a dated implementation bullet to `PROJECT_RECORD.md` containing:

```markdown
- implemented the tools-profile `tapflow-migrator` boundary so Supabase Direct/Session credentials are available only to one-shot database CLIs; API and Worker remain on Transaction Pooler port 6543. Focused Compose tests, DB tests, and DB/API/Worker/root builds passed locally. Live acceptance of migrations `000044` and `000045` remains pending server configuration of `MIGRATION_DATABASE_URL`.
```

- [ ] **Step 4: Commit the verification record**

```bash
git add PROJECT_RECORD.md
git commit -m "docs: record migration connection verification"
```

- [ ] **Step 5: Push and perform staging acceptance**

Push the feature branch and fast-forward `main` without force:

```bash
git push origin codex/xunhupay-personal-wallet
git push origin HEAD:main
```

On the server, add the secret `MIGRATION_DATABASE_URL` to `/opt/aittco/env/tapflow.staging.env` without printing it, then run:

```bash
cd /opt/aittco/tapflow
git fetch --all --prune
git pull --ff-only origin main
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml build tapflow-migrator
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml stop tapflow-worker
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml run --rm tapflow-migrator node packages/db/dist/cli.js
```

Expected staging evidence:

```text
schema_migrations contains versions 42, 43, 44, and 45
app.create_wallet_payment(uuid,text,text,text) exists
```

Do not run personal-wallet write mode during this task. Continue with a separate, evidence-backed legacy reservation reconciliation plan for the 301.2 reserved credits.
