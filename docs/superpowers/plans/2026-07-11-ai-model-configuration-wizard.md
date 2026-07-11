# AI Model Configuration Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a five-step Model Center wizard that saves a complete model/connection/route/credential/pricing draft, requires a successful test of the current revision, and publishes the model without leaving Model Center.

**Architecture:** Add a focused API module for model-configuration drafts and publication while retaining the normalized AI Gateway tables and plugin manifests. The frontend wizard owns transient state in React memory, calls one transactional draft endpoint, calls the existing route-test endpoint outside the transaction, and calls a guarded publish endpoint only when the tested revision still matches.

**Tech Stack:** TypeScript, React 19, Vite, Fastify 5, Zod 4, PostgreSQL/RLS, Vitest, Testing Library, existing `@aigc-flow/ai-gateway-core` plugin registry and CredentialVault.

---

## File Structure

**Backend and database**

- Create `packages/db/migrations/000031_ai_model_configuration_revisions.sql`: persisted configuration/test revisions and indexes used by the publication guard.
- Create `apps/api/src/modules/ai-model-configurations/ai-model-configurations.schemas.ts`: request schemas and inferred input types.
- Create `apps/api/src/modules/ai-model-configurations/ai-model-configurations.service.ts`: transactional draft orchestration and guarded publication.
- Create `apps/api/src/modules/ai-model-configurations/ai-model-configurations.routes.ts`: system-admin HTTP endpoints and sanitized error mapping.
- Modify `apps/api/src/app.ts`: construct, decorate, and register the new service/routes.
- Modify `apps/api/src/fastify.d.ts`: type the Fastify service decoration.
- Modify `apps/api/src/modules/ai-gateway/ai-gateway.service.ts`: record the tested route revision after a successful route health test; block credential deletion while referenced.
- Test `apps/api/test/ai-model-configurations.schemas.test.ts`: schema and secret-choice validation.
- Test `apps/api/test/ai-model-configurations.test.ts`: database transaction, credential binding, testing revision, and publication behavior.
- Modify `apps/api/test/ai-gateway.service.test.ts`: referenced-credential deletion regression coverage.
- Modify `packages/db/test/ai-plugin-packages.test.ts`: migration shape and RLS regression coverage.

**Frontend**

- Create `src/services/v2AiModelConfigurationsApi.ts`: sanitized draft/publish contracts and API calls.
- Create `src/services/v2AiModelConfigurationsApi.test.ts`: endpoint and payload regression tests.
- Create `src/account/ai-settings/modelConfigurationWizardState.ts`: wizard types, defaults, per-step validation, and payload construction.
- Create `src/account/ai-settings/modelConfigurationWizardState.test.ts`: pure state and validation tests.
- Create `src/account/ai-settings/ModelConfigurationWizard.tsx`: dialog shell, progress navigation, orchestration, test, and publication state.
- Create `src/account/ai-settings/ModelConfigurationWizard.test.tsx`: complete flow, credential alternatives, failure recovery, and secret-redaction UI tests.
- Create `src/account/ai-settings/ModelConfigurationWizardSteps.tsx`: focused step renderers using shared menu components.
- Modify `src/account/ai-settings/AiSettingsPage.tsx`: add the primary command, open the wizard, refresh models after publish, and move advanced links behind a secondary entry.
- Modify `src/account/ai-settings/AiSettingsPage.test.tsx`: entry-point and refresh integration tests.
- Modify `PROJECT_RECORD.md`: record the completed product and validation work.

## Task 1: Persist Tested Configuration Revisions

**Files:**
- Create: `packages/db/migrations/000031_ai_model_configuration_revisions.sql`
- Modify: `packages/db/test/ai-plugin-packages.test.ts`

- [ ] **Step 1: Write the failing migration assertions**

Add a database test that runs migrations and inspects `ai_routes`:

```ts
const columns = await client.query<{ column_name: string; is_nullable: string }>(`
  SELECT column_name, is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'ai_routes'
    AND column_name IN ('configuration_revision', 'tested_revision')
  ORDER BY column_name
`);

expect(columns.rows).toEqual([
  { column_name: "configuration_revision", is_nullable: "NO" },
  { column_name: "tested_revision", is_nullable: "YES" },
]);
```

- [ ] **Step 2: Run the database test to verify it fails**

Run: `npm run test --workspace @aigc-flow/db -- ai-plugin-packages.test.ts`

Expected: FAIL because `configuration_revision` and `tested_revision` do not exist.

- [ ] **Step 3: Add the migration**

Create the migration with monotonic route revision fields:

```sql
ALTER TABLE ai_routes
  ADD COLUMN IF NOT EXISTS configuration_revision integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS tested_revision integer;

ALTER TABLE ai_routes
  DROP CONSTRAINT IF EXISTS ai_routes_tested_revision_valid;

ALTER TABLE ai_routes
  ADD CONSTRAINT ai_routes_tested_revision_valid
  CHECK (tested_revision IS NULL OR tested_revision <= configuration_revision);

CREATE INDEX IF NOT EXISTS ai_routes_publish_readiness_idx
  ON ai_routes (status, configuration_revision, tested_revision)
  WHERE deleted_at IS NULL;
```

Do not change `tenant_id`, RLS, route keys, or historical health-check rows.

- [ ] **Step 4: Run the database test to verify it passes**

Run: `npm run test --workspace @aigc-flow/db -- ai-plugin-packages.test.ts`

Expected: PASS when `DATABASE_URL` is available; otherwise the suite reports its existing infrastructure skip.

- [ ] **Step 5: Commit the migration**

```bash
git add packages/db/migrations/000031_ai_model_configuration_revisions.sql packages/db/test/ai-plugin-packages.test.ts
git commit -m "feat: track AI route configuration revisions"
```

## Task 2: Define the Draft and Publish Contracts

**Files:**
- Create: `apps/api/src/modules/ai-model-configurations/ai-model-configurations.schemas.ts`
- Create: `apps/api/test/ai-model-configurations.schemas.test.ts`

- [ ] **Step 1: Write failing schema tests**

Cover built-in template drafts, custom compatible drafts, credential creation, credential selection, and ambiguous credential input:

```ts
expect(() => saveModelConfigurationDraftSchema.parse({
  packageKey: "pixellelabs.nano-banana-pro",
  connection: { mode: "create", name: "Primary", baseUrl: "https://api.example.com" },
  credential: {
    mode: "create",
    name: "Primary key",
    secret: "secret",
    credentialId: "00000000-0000-4000-8000-000000000001",
  },
  route: { routeLabel: "线路一", upstreamModel: "gemini-3-pro-image-preview" },
  pricing: { unitCredits: 10, minChargeCredits: 10 },
})).toThrow();
```

Also assert `publishModelConfigurationSchema` requires UUID `routeId` and positive integer `expectedRevision`.

- [ ] **Step 2: Run schema tests to verify they fail**

Run: `npm run test --workspace @aigc-flow/api -- ai-model-configurations.schemas.test.ts`

Expected: FAIL because the schemas do not exist.

- [ ] **Step 3: Implement discriminated request schemas**

Define these exported schemas and inferred types:

```ts
const credentialChoiceSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("create"),
    name: z.string().trim().min(1).max(255),
    secret: z.string().trim().min(1).max(4000),
  }),
  z.object({
    mode: z.literal("existing"),
    credentialId: z.string().uuid(),
  }),
]);

const connectionChoiceSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("create"),
    name: z.string().trim().min(1).max(255),
    baseUrl: z.string().trim().url(),
    environment: z.string().trim().min(1).max(64).default("production"),
  }),
  z.object({ mode: z.literal("existing"), connectionId: z.string().uuid() }),
]);
```

Export `saveModelConfigurationDraftSchema`, `publishModelConfigurationSchema`, `SaveModelConfigurationDraftInput`, and `PublishModelConfigurationInput`. The draft schema must accept exactly one of `packageKey` or a `custom` provider/model definition, positive pricing, friendly route label, upstream model, optional advanced fields, and optional `expectedRevision` for updates.

- [ ] **Step 4: Run schema tests to verify they pass**

Run: `npm run test --workspace @aigc-flow/api -- ai-model-configurations.schemas.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the contracts**

```bash
git add apps/api/src/modules/ai-model-configurations/ai-model-configurations.schemas.ts apps/api/test/ai-model-configurations.schemas.test.ts
git commit -m "feat: define model configuration draft contracts"
```

## Task 3: Implement Transactional Draft Saving

**Files:**
- Create: `apps/api/src/modules/ai-model-configurations/ai-model-configurations.service.ts`
- Create: `apps/api/test/ai-model-configurations.test.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/fastify.d.ts`

- [ ] **Step 1: Write failing database-backed service tests**

Test these concrete behaviors through a constructed service:

```ts
const draft = await service.saveDraft(context, {
  packageKey: "pixellelabs.nano-banana-pro",
  connection: { mode: "create", name: "Pixelle primary", baseUrl: "https://api.pixellelabs.com" },
  credential: { mode: "create", name: "Line one key", secret: "line-one-secret" },
  route: { routeLabel: "线路一", upstreamModel: "gemini-3-pro-image-preview" },
  pricing: { unitCredits: 24, minChargeCredits: 24 },
});

expect(draft.route.status).toBe("inactive");
expect(draft.route.configurationRevision).toBe(1);
expect(draft.credential).toMatchObject({ name: "Line one key" });
expect(JSON.stringify(draft)).not.toContain("line-one-secret");
```

Add cases proving a second route for the same provider can create a different credential, two routes can explicitly select the same credential, a provider-mismatched credential is rejected, invalid pricing creates no partial rows, and an `expectedRevision` mismatch returns `MODEL_CONFIGURATION_CONFLICT`.

- [ ] **Step 2: Run the service test to verify it fails**

Run: `npm run test --workspace @aigc-flow/api -- ai-model-configurations.test.ts`

Expected: FAIL because `AiModelConfigurationsService` does not exist.

- [ ] **Step 3: Implement a focused orchestration service**

Create `AiModelConfigurationsService` with injected `pool`, `vault`, and `pluginRegistry`. Its public draft method must have this boundary:

```ts
async saveDraft(
  context: TenantContext,
  input: SaveModelConfigurationDraftInput,
): Promise<ModelConfigurationDraftView>
```

Inside one `withTenantTransaction` callback:

1. Resolve the built-in manifest with `pluginRegistry.require(input.packageKey)` or normalize the custom OpenAI-compatible definition.
2. Upsert provider/model/package/install/catalog records in the existing platform/tenant scope used by current system-admin configuration APIs.
3. Resolve or create the connection and verify its provider/scope.
4. Create an encrypted credential with `CredentialVault` or load the selected credential; verify provider, scope, and active status.
5. Create or update an inactive route with explicit `credential_id`, normalized connection fields, positive pricing, `configuration_revision = previous + 1`, and `tested_revision = NULL` when runtime-relevant fields change.
6. Upsert the corresponding `model_pricing` row as inactive until publication.
7. Return only sanitized view fields.

Use a specific API error class with codes `MODEL_CONFIGURATION_CONFLICT`, `CONFIGURATION_CREDENTIAL_PROVIDER_MISMATCH`, `CONFIGURATION_SCOPE_MISMATCH`, and `CONFIGURATION_PRICING_REQUIRED`. Never put `input.credential.secret` into error metadata.

- [ ] **Step 4: Wire service construction without adding routes yet**

In `app.ts`, construct the service beside the current AI services:

```ts
const aiModelConfigurationsService = new AiModelConfigurationsService({
  pluginRegistry: builtinAiPluginRegistry,
  pool,
  vault: credentialVault,
});
app.decorate("aiModelConfigurationsService", aiModelConfigurationsService);
```

Add the corresponding `FastifyInstance` declaration in `fastify.d.ts`.

- [ ] **Step 5: Run service and API type checks**

Run: `npm run test --workspace @aigc-flow/api -- ai-model-configurations.test.ts`

Expected: PASS.

Run: `npm run build --workspace @aigc-flow/api`

Expected: PASS.

- [ ] **Step 6: Commit draft orchestration**

```bash
git add apps/api/src/modules/ai-model-configurations/ai-model-configurations.service.ts apps/api/test/ai-model-configurations.test.ts apps/api/src/app.ts apps/api/src/fastify.d.ts
git commit -m "feat: save AI model configuration drafts"
```

## Task 4: Guard Testing, Publication, and Credential Deletion

**Files:**
- Modify: `apps/api/src/modules/ai-gateway/ai-gateway.service.ts`
- Modify: `apps/api/src/modules/ai-model-configurations/ai-model-configurations.service.ts`
- Modify: `apps/api/test/ai-model-configurations.test.ts`
- Modify: `apps/api/test/ai-gateway.service.test.ts`

- [ ] **Step 1: Write failing publication and deletion tests**

Add cases that assert:

```ts
await expect(service.publish(context, {
  routeId: draft.route.id,
  expectedRevision: draft.route.configurationRevision,
})).rejects.toMatchObject({ code: "MODEL_CONFIGURATION_TEST_REQUIRED" });
```

After a successful route test, publication succeeds. After any runtime-relevant route update increments `configuration_revision`, publication fails until retested. Also assert deleting a credential referenced by any non-deleted route returns `CREDENTIAL_IN_USE` with sanitized route IDs/labels.

- [ ] **Step 2: Run focused tests to verify they fail**

Run: `npm run test --workspace @aigc-flow/api -- ai-model-configurations.test.ts ai-gateway.service.test.ts`

Expected: FAIL because tested revisions are not recorded and credential deletion is not guarded.

- [ ] **Step 3: Record successful tested revisions**

In the existing successful route-test transaction, add:

```sql
UPDATE ai_routes
SET tested_revision = configuration_revision,
    health_status = 'ok',
    last_health_checked_at = now(),
    updated_at = now()
WHERE id = $1::uuid
```

On failed tests, retain the previous `tested_revision` only if it already equals the unchanged `configuration_revision`; set health to failed. Any update to connection, credential, upstream model, API mode, path, request config, base URL, or pricing must increment `configuration_revision` and clear `tested_revision`.

- [ ] **Step 4: Implement guarded publication**

Add this public service boundary:

```ts
async publish(
  context: TenantContext,
  input: PublishModelConfigurationInput,
): Promise<ModelConfigurationDraftView>
```

Within one transaction, lock the route with `FOR UPDATE`, verify `configuration_revision = expectedRevision`, verify `tested_revision = configuration_revision`, verify credential and connection are active, verify upstream model and positive active pricing exist, activate the route/catalog/pricing/install, and apply the default route state. Return `MODEL_CONFIGURATION_CONFLICT`, `MODEL_CONFIGURATION_TEST_REQUIRED`, or `MODEL_CONFIGURATION_INCOMPLETE` as appropriate.

- [ ] **Step 5: Block deletion of referenced credentials**

Before the existing credential delete statement, query:

```sql
SELECT id::text, route_key, route_label
FROM ai_routes
WHERE credential_id = $1::uuid
  AND deleted_at IS NULL
ORDER BY route_key
LIMIT 20
```

If rows exist, throw `CREDENTIAL_IN_USE`; do not include secrets, request config, or Authorization data.

- [ ] **Step 6: Run focused tests and API build**

Run: `npm run test --workspace @aigc-flow/api -- ai-model-configurations.test.ts ai-gateway.service.test.ts`

Expected: PASS.

Run: `npm run build --workspace @aigc-flow/api`

Expected: PASS.

- [ ] **Step 7: Commit publication guards**

```bash
git add apps/api/src/modules/ai-gateway/ai-gateway.service.ts apps/api/src/modules/ai-model-configurations/ai-model-configurations.service.ts apps/api/test/ai-model-configurations.test.ts apps/api/test/ai-gateway.service.test.ts
git commit -m "feat: require tested AI configuration revisions"
```

## Task 5: Expose Sanitized Admin Endpoints

**Files:**
- Create: `apps/api/src/modules/ai-model-configurations/ai-model-configurations.routes.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/test/ai-model-configurations.test.ts`

- [ ] **Step 1: Write failing HTTP tests**

Test `POST /api/v2/admin/ai/model-configurations/draft` and `POST /api/v2/admin/ai/model-configurations/publish`. Assert anonymous and non-admin users are rejected, drafts return `201`, publication returns `200`, validation failures are structured, and response bodies never contain the submitted API key.

```ts
expect(saveResponse.statusCode).toBe(201);
expect(saveResponse.json().route.status).toBe("inactive");
expect(saveResponse.body).not.toContain("line-one-secret");
```

- [ ] **Step 2: Run HTTP tests to verify they fail**

Run: `npm run test --workspace @aigc-flow/api -- ai-model-configurations.test.ts`

Expected: FAIL with route not found.

- [ ] **Step 3: Register the endpoints**

Use `[requireAuth, requireTenant, requirePermission("admin:system")]`, the schemas from Task 2, and the new service. Map known configuration errors without including input bodies:

```ts
app.post("/api/v2/admin/ai/model-configurations/draft", { preHandler }, async (request, reply) => {
  const body = saveModelConfigurationDraftSchema.parse(request.body);
  return reply.code(201).send(
    await app.aiModelConfigurationsService.saveDraft(getTenantContext(request), body),
  );
});
```

Register `registerAiModelConfigurationRoutes(app)` in `app.ts` after the existing AI admin routes.

- [ ] **Step 4: Run HTTP tests and API build**

Run: `npm run test --workspace @aigc-flow/api -- ai-model-configurations.test.ts`

Expected: PASS.

Run: `npm run build --workspace @aigc-flow/api`

Expected: PASS.

- [ ] **Step 5: Commit the HTTP surface**

```bash
git add apps/api/src/modules/ai-model-configurations/ai-model-configurations.routes.ts apps/api/src/app.ts apps/api/test/ai-model-configurations.test.ts
git commit -m "feat: expose model configuration workflow API"
```

## Task 6: Add the Frontend API and Pure Wizard State

**Files:**
- Create: `src/services/v2AiModelConfigurationsApi.ts`
- Create: `src/services/v2AiModelConfigurationsApi.test.ts`
- Create: `src/account/ai-settings/modelConfigurationWizardState.ts`
- Create: `src/account/ai-settings/modelConfigurationWizardState.test.ts`

- [ ] **Step 1: Write failing client and state tests**

Assert the client posts to the exact draft/publish paths. Assert step validation blocks missing model, connection, credential choice, upstream model, and price. Assert duplicate-route initialization clears credential confirmation:

```ts
expect(createBackupRouteWizardState(existingRoute).credential).toEqual({
  mode: "unconfirmed",
});
expect(validateWizardStep(state, "pricing")).toContain("pricing.unitCredits");
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/services/v2AiModelConfigurationsApi.test.ts src/account/ai-settings/modelConfigurationWizardState.test.ts`

Expected: FAIL because both modules are missing.

- [ ] **Step 3: Implement sanitized API contracts**

Export `saveModelConfigurationDraft(input)` and `publishModelConfiguration(input)`. Model the credential input as:

```ts
export type CredentialChoice =
  | { mode: "create"; name: string; secret: string }
  | { mode: "existing"; credentialId: string };
```

The response credential type must contain only `id`, `name`, `status`, `maskedSecret`, and `secretFingerprint`. Do not define a response property for plaintext or encrypted secret fields.

- [ ] **Step 4: Implement pure wizard state and validation**

Define five named steps, default state factories for built-in/custom models, `validateWizardStep`, `buildDraftPayload`, `applySavedDraft`, and `createBackupRouteWizardState`. Keep API key only in component memory and clear it immediately after a successful draft response.

- [ ] **Step 5: Run focused frontend tests**

Run: `npm test -- src/services/v2AiModelConfigurationsApi.test.ts src/account/ai-settings/modelConfigurationWizardState.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit client and state modules**

```bash
git add src/services/v2AiModelConfigurationsApi.ts src/services/v2AiModelConfigurationsApi.test.ts src/account/ai-settings/modelConfigurationWizardState.ts src/account/ai-settings/modelConfigurationWizardState.test.ts
git commit -m "feat: add model configuration wizard state"
```

## Task 7: Build the Five-Step Wizard

**Files:**
- Create: `src/account/ai-settings/ModelConfigurationWizard.tsx`
- Create: `src/account/ai-settings/ModelConfigurationWizardSteps.tsx`
- Create: `src/account/ai-settings/ModelConfigurationWizard.test.tsx`

- [ ] **Step 1: Write failing interaction tests**

Mock plugin templates, providers, connections, credentials, draft saving, route testing, and publication. Cover:

- Built-in template selection preloads endpoint/upstream/pricing defaults.
- Custom OpenAI-compatible selection exposes Base URL and advanced fields.
- Credential mode is a segmented choice between new and existing.
- Existing credentials are filtered to the selected provider and display sanitized metadata.
- Save draft clears the API key field from component state.
- Test failure preserves the draft and returns to the relevant step.
- Publish stays disabled until the saved revision tests successfully.
- Closing dirty state asks for confirmation.
- Backup-route mode starts with credential unconfirmed.

Use accessible assertions such as:

```ts
expect(screen.getByRole("button", { name: "测试并启用" })).toBeDisabled();
fireEvent.click(screen.getByRole("button", { name: "新建密钥" }));
expect(screen.getByLabelText("API Key")).toHaveAttribute("type", "password");
```

- [ ] **Step 2: Run the component test to verify it fails**

Run: `npm test -- src/account/ai-settings/ModelConfigurationWizard.test.tsx`

Expected: FAIL because the wizard does not exist.

- [ ] **Step 3: Implement the dialog shell and stable layout**

Use a fixed five-step progress header, a scrollable body, and a stable footer. Keep the dialog at `max-w-3xl`, constrain height with `max-h-[min(860px,calc(100vh-32px))]`, and avoid nested cards. Footer commands are `上一步`, `保存草稿`, and context-specific `继续`/`测试并启用`.

Use Lucide icons, shared `MenuSelect` for option sets, and `useDismissibleLayer` for dismiss behavior. Do not use native `<select>`.

- [ ] **Step 4: Implement focused step renderers**

In `ModelConfigurationWizardSteps.tsx`, export renderers for model, connection, route/credential, pricing, and test/publish. Use shared menu density tokens for all menus. Put route key, API mode, paths, timeout, request config, priority, weight, and fallback group in a collapsed `高级配置` section.

Do not render help copy describing obvious controls. Use concise labels and inline validation only.

- [ ] **Step 5: Implement save, test, and publish orchestration**

The shell must:

1. Validate before changing steps.
2. Call `saveModelConfigurationDraft` once on save.
3. Replace local secret input with sanitized credential metadata after save.
4. Call existing `testAiRoute(saved.route.id)` outside the draft request.
5. Enable publish only when `test.status === "ok"` and the returned/saved tested revision equals configuration revision.
6. Call `publishModelConfiguration` with route ID and expected revision.
7. Call `onPublished(result)` and close only after successful publication.

- [ ] **Step 6: Run component tests**

Run: `npm test -- src/account/ai-settings/ModelConfigurationWizard.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit the wizard**

```bash
git add src/account/ai-settings/ModelConfigurationWizard.tsx src/account/ai-settings/ModelConfigurationWizardSteps.tsx src/account/ai-settings/ModelConfigurationWizard.test.tsx
git commit -m "feat: add guided model configuration wizard"
```

## Task 8: Integrate Model Center and Backup Route Entry

**Files:**
- Modify: `src/account/ai-settings/AiSettingsPage.tsx`
- Modify: `src/account/ai-settings/AiSettingsPage.test.tsx`

- [ ] **Step 1: Write failing Model Center integration tests**

Assert an authorized administrator sees one primary `配置新模型` button, clicking opens the wizard, successful publication reloads catalog/routes/admin data, and `添加备用线路` opens backup mode with the selected route but no credential confirmation.

Also assert Provider Connections and Template Library appear under a secondary `高级设置` menu rather than as required flow steps.

- [ ] **Step 2: Run the page test to verify it fails**

Run: `npm test -- src/account/ai-settings/AiSettingsPage.test.tsx`

Expected: FAIL because the wizard entry is absent.

- [ ] **Step 3: Integrate without expanding the existing editor logic**

Add only modal state, selected backup route state, the primary button, callbacks, and data reload wiring to `AiSettingsPage.tsx`:

```tsx
<ModelConfigurationWizard
  backupFromRoute={wizardBackupRoute}
  onClose={() => setWizardOpen(false)}
  onPublished={async () => {
    setWizardOpen(false);
    await loadData();
  }}
  open={wizardOpen}
/>
```

Do not move the existing advanced route editor into the wizard. Preserve existing route keys and edit commands.

- [ ] **Step 4: Run page and wizard tests**

Run: `npm test -- src/account/ai-settings/AiSettingsPage.test.tsx src/account/ai-settings/ModelConfigurationWizard.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit Model Center integration**

```bash
git add src/account/ai-settings/AiSettingsPage.tsx src/account/ai-settings/AiSettingsPage.test.tsx
git commit -m "feat: make Model Center the configuration entry"
```

## Task 9: End-to-End Regression and Project Record

**Files:**
- Modify: `PROJECT_RECORD.md`
- Modify as required by failures: only files introduced or touched in Tasks 1-8

- [ ] **Step 1: Run focused frontend tests**

Run:

```bash
npm test -- \
  src/services/v2AiModelConfigurationsApi.test.ts \
  src/account/ai-settings/modelConfigurationWizardState.test.ts \
  src/account/ai-settings/ModelConfigurationWizard.test.tsx \
  src/account/ai-settings/AiSettingsPage.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run backend and core tests**

Run:

```bash
npm run test --workspace @aigc-flow/api
npm run test --workspace @aigc-flow/ai-gateway-core
npm run test --workspace @aigc-flow/db
```

Expected: PASS. If database infrastructure is unavailable, record the exact skipped/failed suite and still run schema/unit tests that do not require Postgres.

- [ ] **Step 3: Run the required production build**

Run: `npm run build`

Expected: PASS and a Vite production bundle is generated.

- [ ] **Step 4: Perform browser QA at desktop and mobile widths**

Start the existing frontend/API development services, then use Playwright to verify:

- Desktop `1440x900`: dialog fits without overlap, progress and footer remain visible, menus render above the dialog, and all five steps complete.
- Mobile `390x844`: labels wrap without clipping, footer commands remain reachable, and no horizontal overflow occurs.
- Create-new and choose-existing credential flows both work.
- A failed test leaves a recoverable draft.
- A successful test and publication makes the model visible in the canvas model picker.

Capture screenshots as temporary verification artifacts outside tracked source unless the user requests them committed.

- [ ] **Step 5: Update the project record**

Add a dated entry to `PROJECT_RECORD.md` containing:

```markdown
### 2026-07-11 - AI model configuration wizard

- Made Model Center the primary model setup entry with a five-step guided flow.
- Added transactional configuration drafts, explicit per-route credential binding, tested-revision publication guards, and fail-closed pricing validation.
- Preserved tenant isolation, existing route keys, advanced Provider Connections, and Template Library workflows.
- Validation: list the exact build, API, core, DB, frontend, and browser QA results.
```

- [ ] **Step 6: Review the final diff for secrets and scope**

Run:

```bash
git diff --check
git diff --stat
git status --short
rg -n "line-one-secret|Authorization: Bearer|encrypted_secret|auth_tag|nonce" \
  src/account/ai-settings \
  src/services/v2AiModelConfigurationsApi.ts \
  apps/api/src/modules/ai-model-configurations
```

Expected: no committed test secret outside explicitly synthetic test fixtures, no secret response fields, no whitespace errors, and no unrelated dirty files staged.

- [ ] **Step 7: Commit validation records and final fixes**

```bash
git add PROJECT_RECORD.md
git commit -m "docs: record AI model wizard completion"
```

If final verification required a code fix, stage only the exact Task 1-8 files changed by that fix and commit them with a task-specific `fix:` commit before committing `PROJECT_RECORD.md`.

## Completion Checklist

- [ ] Model Center is the only required page for initial configuration.
- [ ] Built-in templates and custom OpenAI-compatible configuration both work.
- [ ] Each route explicitly creates or selects a credential.
- [ ] Same-provider routes can bind different credentials.
- [ ] Multiple routes can deliberately share a credential.
- [ ] Backup-route duplication requires credential reconfirmation.
- [ ] Missing credential, upstream model, or pricing blocks activation.
- [ ] Only a successful test of the current revision permits publication.
- [ ] API keys are absent from responses, logs, audit metadata, URLs, and persisted frontend state.
- [ ] Existing route keys, tenant isolation, runtime selection, and advanced administration remain compatible.
- [ ] `npm run build` and relevant test suites pass or infrastructure failures are documented exactly.
- [ ] `PROJECT_RECORD.md` contains the completed work and verification evidence.
