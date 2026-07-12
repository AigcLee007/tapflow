#!/usr/bin/env node

import { CredentialVault } from "@aigc-flow/ai-gateway-core";
import { createPgPool, withTenantTransaction } from "@aigc-flow/db";

import { AiRouteTestService } from "../apps/api/dist/modules/ai-route-tests/ai-route-tests.service.js";

import {
  buildImportPlan,
  parseRouteImportCommand,
  readRequiredSecrets,
  summarizePlan,
} from "./import-gpt-image-2-routes-lib.mjs";

const PROVIDER_KEY = "openai-compatible";
const MODEL_KEY = "gpt-image-2";
const MODEL_FAMILY = "gpt-image-2";
const MODALITY = "image";

function printUsage() {
  console.log(`Usage: node scripts/import-gpt-image-2-routes.mjs [--apply | --test | --publish <default-route-key>]

Default mode validates the existing GPT-Image-2 catalog and prints the pending routes.
--apply creates two inactive platform routes and their encrypted credentials.
--test runs provider tests for both imported routes and records their tested revisions.
--publish activates both imported routes only after their current revisions have passed a route test.

Required only with --apply:
  MOUXIHUB_GPT_IMAGE_2_API_KEY
  PIXELLELABS_GPT_IMAGE_2_API_KEY
  CREDENTIAL_MASTER_KEY

Optional actor context (required together when automatic resolution is ambiguous):
  TAPFLOW_IMPORT_TENANT_ID
  TAPFLOW_IMPORT_USER_ID`);
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function readExplicitContext(environment) {
  const tenantId = environment.TAPFLOW_IMPORT_TENANT_ID?.trim() ?? "";
  const userId = environment.TAPFLOW_IMPORT_USER_ID?.trim() ?? "";
  if (!tenantId && !userId) return null;
  if (!tenantId || !userId) {
    throw new Error("TAPFLOW_IMPORT_TENANT_ID and TAPFLOW_IMPORT_USER_ID must be provided together");
  }
  if (!isUuid(tenantId) || !isUuid(userId)) {
    throw new Error("TAPFLOW_IMPORT_TENANT_ID and TAPFLOW_IMPORT_USER_ID must be UUIDs");
  }
  return { tenantId, userId };
}

function parseAdminEmails(value) {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

async function resolveImportContext(pool, environment) {
  const explicit = readExplicitContext(environment);
  if (explicit) return explicit;

  const adminEmails = parseAdminEmails(environment.ADMIN_EMAILS);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.is_system_admin', 'true', true)");
    const result = await client.query(
      `
        SELECT DISTINCT
          membership.tenant_id::text AS "tenantId",
          membership.user_id::text AS "userId"
        FROM tenant_memberships AS membership
        JOIN users AS app_user ON app_user.id = membership.user_id
        WHERE membership.status = 'active'
          AND (
            membership.role_key = 'system_admin'
            OR lower(app_user.email) = ANY($1::text[])
          )
        ORDER BY "tenantId", "userId"
      `,
      [adminEmails],
    );
    await client.query("COMMIT");

    if (result.rows.length === 1) {
      return result.rows[0];
    }
    if (result.rows.length === 0) {
      throw new Error("Unable to resolve an active system administrator. Set TAPFLOW_IMPORT_TENANT_ID and TAPFLOW_IMPORT_USER_ID.");
    }
    throw new Error("Multiple administrator contexts found. Set TAPFLOW_IMPORT_TENANT_ID and TAPFLOW_IMPORT_USER_ID.");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function assertActorMembership(client, context) {
  const adminEmails = parseAdminEmails(process.env.ADMIN_EMAILS);
  await client.query("SELECT set_config('app.is_system_admin', 'true', true)");
  const result = await client.query(
    `
      SELECT 1
      FROM tenant_memberships AS membership
      JOIN users AS app_user ON app_user.id = membership.user_id
      WHERE membership.tenant_id = $1::uuid
        AND membership.user_id = $2::uuid
        AND membership.status = 'active'
        AND (
          membership.role_key = 'system_admin'
          OR lower(app_user.email) = ANY($3::text[])
        )
      LIMIT 1
    `,
    [context.tenantId, context.userId, adminEmails],
  );
  if (!result.rows[0]) {
    throw new Error("The import actor must be an active system administrator or an ADMIN_EMAILS member");
  }
}

async function readExistingIdentity(client) {
  const providerResult = await client.query(
    `SELECT id::text AS id FROM ai_providers WHERE key = $1 AND status = 'active' FOR KEY SHARE`,
    [PROVIDER_KEY],
  );
  if (providerResult.rows.length !== 1) {
    throw new Error(`Expected exactly one active provider with key ${PROVIDER_KEY}`);
  }

  const providerId = providerResult.rows[0].id;
  const modelResult = await client.query(
    `
      SELECT id::text AS id
      FROM ai_models
      WHERE provider_id = $1::uuid
        AND model_key = $2
        AND modality = $3
        AND status = 'active'
      FOR KEY SHARE
    `,
    [providerId, MODEL_KEY, MODALITY],
  );
  if (modelResult.rows.length !== 1) {
    throw new Error(`Expected exactly one active ${MODEL_KEY} image model for provider ${PROVIDER_KEY}`);
  }

  const modelId = modelResult.rows[0].id;
  const catalogResult = await client.query(
    `
      SELECT id::text AS id
      FROM ai_model_catalog
      WHERE tenant_id IS NULL
        AND model_id = $1::uuid
        AND modality = $2
        AND model_family = $3
        AND status = 'active'
      FOR KEY SHARE
    `,
    [modelId, MODALITY, MODEL_FAMILY],
  );
  if (catalogResult.rows.length !== 1) {
    throw new Error(`Expected exactly one active platform catalog entry for ${MODEL_KEY}`);
  }

  return {
    catalogId: catalogResult.rows[0].id,
    modelId,
    providerId,
  };
}

async function assertNamesAndRouteKeysAvailable(client, plan) {
  const routeKeys = plan.map((route) => route.routeKey);
  const connectionNames = plan.map((route) => route.connectionName);
  const credentialNames = plan.map((route) => route.credentialName);
  const routes = await client.query(
    `SELECT route_key FROM ai_routes WHERE tenant_id IS NULL AND route_key = ANY($1::text[])`,
    [routeKeys],
  );
  const connections = await client.query(
    `SELECT name FROM ai_provider_connections WHERE tenant_id IS NULL AND name = ANY($1::text[])`,
    [connectionNames],
  );
  const credentials = await client.query(
    `SELECT name FROM api_credentials WHERE tenant_id IS NULL AND name = ANY($1::text[])`,
    [credentialNames],
  );

  const collisions = [
    ...routes.rows.map((row) => `route:${row.route_key}`),
    ...connections.rows.map((row) => `connection:${row.name}`),
    ...credentials.rows.map((row) => `credential:${row.name}`),
  ];
  if (collisions.length > 0) {
    throw new Error(`Import identifiers already exist: ${collisions.join(", ")}`);
  }
}

async function preflight(pool, context, plan) {
  return withTenantTransaction(context, async (client) => {
    await assertActorMembership(client, context);
    const identity = await readExistingIdentity(client);
    await assertNamesAndRouteKeysAvailable(client, plan);
    return identity;
  }, pool);
}

function buildStoredRequestConfig(route, connectionId) {
  return {
    ...route.requestConfig,
    apiMode: route.apiMode,
    connectionId,
    model: route.upstreamModel,
    path: route.requestPath,
  };
}

async function importRoutes(pool, context, plan, secrets, vault) {
  return withTenantTransaction(context, async (client) => {
    await assertActorMembership(client, context);
    const identity = await readExistingIdentity(client);
    await assertNamesAndRouteKeysAvailable(client, plan);
    const imported = [];

    for (const [index, route] of plan.entries()) {
      const encrypted = vault.createCredential(secrets[index]);
      const credentialResult = await client.query(
        `
          INSERT INTO api_credentials (
            tenant_id, provider_id, name, encrypted_secret, nonce, auth_tag,
            key_version, secret_fingerprint, status, created_by, updated_at
          )
          VALUES (NULL, $1::uuid, $2, $3::bytea, $4::bytea, $5::bytea, $6, $7, 'active', $8::uuid, now())
          RETURNING id::text AS id
        `,
        [
          identity.providerId,
          route.credentialName,
          encrypted.encryptedSecret,
          encrypted.nonce,
          encrypted.authTag,
          encrypted.keyVersion,
          encrypted.secretFingerprint,
          context.userId,
        ],
      );
      const credentialId = credentialResult.rows[0].id;
      const connectionResult = await client.query(
        `
          INSERT INTO ai_provider_connections (
            tenant_id, provider_id, credential_id, name, adapter_kind, base_url,
            environment, status, metadata, created_by, updated_at
          )
          VALUES (NULL, $1::uuid, $2::uuid, $3, 'openai-compatible', $4, 'production', 'active', $5::jsonb, $6::uuid, now())
          RETURNING id::text AS id
        `,
        [
          identity.providerId,
          credentialId,
          route.connectionName,
          route.baseUrl,
          JSON.stringify({ importedBy: "gpt-image-2-route-import" }),
          context.userId,
        ],
      );
      const connectionId = connectionResult.rows[0].id;
      const requestConfig = buildStoredRequestConfig(route, connectionId);
      const routeResult = await client.query(
        `
          INSERT INTO ai_routes (
            tenant_id, provider_id, model_id, model_family, credential_id, connection_id,
            route_key, route_label, modality, environment, priority, weight,
            upstream_model, api_mode, request_path, internal_label, is_default,
            request_config, pricing, rate_limit, status, updated_at
          )
          VALUES (
            NULL, $1::uuid, $2::uuid, $3, $4::uuid, $5::uuid,
            $6, $7, $8, 'production', 100, 100,
            $9, $10, $11, $12, false,
            $13::jsonb, $14::jsonb, '{}'::jsonb, 'inactive', now()
          )
          RETURNING id::text AS id, configuration_revision
        `,
        [
          identity.providerId,
          identity.modelId,
          MODEL_FAMILY,
          credentialId,
          connectionId,
          route.routeKey,
          route.label,
          MODALITY,
          route.upstreamModel,
          route.apiMode,
          route.requestPath,
          route.connectionName,
          JSON.stringify(requestConfig),
          JSON.stringify({
            minChargeCredits: route.credits,
            unit: "image_generation",
            unitCredits: route.credits,
          }),
        ],
      );
      const importedRoute = routeResult.rows[0];
      await client.query(
        `
          INSERT INTO model_pricing (provider, model, route, unit, unit_credits, min_charge_credits, metadata, active)
          VALUES ($1, $2, $3, 'image_generation', $4, $4, $5::jsonb, false)
          ON CONFLICT (provider, model, route, unit) DO UPDATE SET
            unit_credits = EXCLUDED.unit_credits,
            min_charge_credits = EXCLUDED.min_charge_credits,
            metadata = EXCLUDED.metadata,
            active = false
        `,
        [
          PROVIDER_KEY,
          route.upstreamModel,
          route.routeKey,
          route.credits,
          JSON.stringify({ importedBy: "gpt-image-2-route-import" }),
        ],
      );
      imported.push({
        configurationRevision: importedRoute.configuration_revision,
        connectionId,
        credentialId,
        routeId: importedRoute.id,
        routeKey: route.routeKey,
        secretFingerprint: encrypted.secretFingerprint,
      });
    }

    await client.query(
      `
        INSERT INTO audit_logs (tenant_id, actor_user_id, actor_type, action, resource_type, metadata)
        VALUES ($1::uuid, $2::uuid, 'system', 'ai.gpt_image_2.import', 'ai_route_batch', $3::jsonb)
      `,
      [
        context.tenantId,
        context.userId,
        JSON.stringify({
          catalogId: identity.catalogId,
          routeKeys: imported.map((route) => route.routeKey),
        }),
      ],
    );
    return { identity, imported };
  }, pool);
}

async function publishRoutes(pool, context, plan, defaultRouteKey) {
  if (!plan.some((route) => route.routeKey === defaultRouteKey)) {
    throw new Error("--publish must name one of the GPT-Image-2 routes managed by this importer");
  }

  return withTenantTransaction(context, async (client) => {
    await assertActorMembership(client, context);
    const identity = await readExistingIdentity(client);
    const routeKeys = plan.map((route) => route.routeKey);
    const result = await client.query(
      `
        SELECT
          route.id::text AS id,
          route.route_key,
          route.status,
          route.configuration_revision,
          route.tested_revision,
          credential.id::text AS credential_id,
          credential.status AS credential_status,
          credential.provider_id::text AS credential_provider_id,
          credential.tenant_id::text AS credential_tenant_id,
          connection.id::text AS connection_id,
          connection.status AS connection_status,
          connection.provider_id::text AS connection_provider_id,
          connection.tenant_id::text AS connection_tenant_id,
          connection.environment AS connection_environment,
          pricing.id::text AS pricing_id
        FROM ai_routes AS route
        JOIN ai_providers AS provider ON provider.id = route.provider_id
        LEFT JOIN api_credentials AS credential ON credential.id = route.credential_id
        LEFT JOIN ai_provider_connections AS connection ON connection.id = route.connection_id
        LEFT JOIN model_pricing AS pricing
          ON pricing.provider = provider.key
          AND pricing.model = route.upstream_model
          AND pricing.route = route.route_key
          AND pricing.unit = 'image_generation'
        WHERE route.tenant_id IS NULL
          AND route.deleted_at IS NULL
          AND route.provider_id = $1::uuid
          AND route.model_id = $2::uuid
          AND route.route_key = ANY($3::text[])
        FOR UPDATE OF route
      `,
      [identity.providerId, identity.modelId, routeKeys],
    );
    if (result.rows.length !== plan.length) {
      throw new Error("Both imported GPT-Image-2 routes must exist before publication");
    }

    for (const route of result.rows) {
      if (route.status !== "inactive" && route.status !== "active") {
        throw new Error(`Route ${route.route_key} is not publishable in its current status`);
      }
      if (route.tested_revision !== route.configuration_revision) {
        throw new Error(`Route ${route.route_key} must pass a test for its current configuration before publication`);
      }
      if (
        !route.credential_id ||
        route.credential_status !== "active" ||
        route.credential_provider_id !== identity.providerId ||
        route.credential_tenant_id !== null
      ) {
        throw new Error(`Route ${route.route_key} does not have an active compatible credential`);
      }
      if (
        !route.connection_id ||
        route.connection_status !== "active" ||
        route.connection_provider_id !== identity.providerId ||
        route.connection_tenant_id !== null ||
        route.connection_environment !== "production"
      ) {
        throw new Error(`Route ${route.route_key} does not have an active compatible connection`);
      }
      if (!route.pricing_id) {
        throw new Error(`Route ${route.route_key} does not have image generation pricing`);
      }
    }

    await client.query(
      `
        UPDATE ai_routes
        SET
          status = CASE WHEN route_key = ANY($1::text[]) THEN 'active' ELSE status END,
          is_default = route_key = $2::text,
          updated_at = now()
        WHERE tenant_id IS NULL
          AND modality = $3
          AND model_family = $4
          AND environment = 'production'
          AND provider_id = $5::uuid
          AND model_id = $6::uuid
          AND deleted_at IS NULL
      `,
      [routeKeys, defaultRouteKey, MODALITY, MODEL_FAMILY, identity.providerId, identity.modelId],
    );
    await client.query(
      `
        UPDATE model_pricing
        SET active = true
        WHERE provider = $1
          AND model = $2
          AND route = ANY($3::text[])
          AND unit = 'image_generation'
      `,
      [PROVIDER_KEY, MODEL_KEY, routeKeys],
    );
    await client.query(
      `UPDATE ai_model_catalog SET default_route_key = $2, updated_at = now() WHERE id = $1::uuid`,
      [identity.catalogId, defaultRouteKey],
    );
    await client.query(
      `
        INSERT INTO audit_logs (tenant_id, actor_user_id, actor_type, action, resource_type, metadata)
        VALUES ($1::uuid, $2::uuid, 'system', 'ai.gpt_image_2.publish', 'ai_route_batch', $3::jsonb)
      `,
      [
        context.tenantId,
        context.userId,
        JSON.stringify({ defaultRouteKey, routeKeys }),
      ],
    );

    return {
      defaultRouteKey,
      routeKeys,
    };
  }, pool);
}

async function loadImportedRoutes(pool, context, plan) {
  return withTenantTransaction(context, async (client) => {
    await assertActorMembership(client, context);
    const identity = await readExistingIdentity(client);
    const routeKeys = plan.map((route) => route.routeKey);
    const result = await client.query(
      `
        SELECT id::text AS id, route_key
        FROM ai_routes
        WHERE tenant_id IS NULL
          AND deleted_at IS NULL
          AND provider_id = $1::uuid
          AND model_id = $2::uuid
          AND route_key = ANY($3::text[])
          AND status IN ('inactive', 'active')
        ORDER BY route_key
      `,
      [identity.providerId, identity.modelId, routeKeys],
    );
    if (result.rows.length !== plan.length) {
      throw new Error("Both imported GPT-Image-2 routes must exist before testing");
    }
    return result.rows;
  }, pool);
}

function summarizeRouteTest(result) {
  const error = result.error && typeof result.error === "object"
    ? {
        code: typeof result.error.code === "string" ? result.error.code : "ROUTE_TEST_FAILED",
        message: typeof result.error.message === "string" ? result.error.message : "Route test failed",
      }
    : null;
  return {
    checkedAt: result.checkedAt,
    error,
    latencyMs: result.latencyMs,
    routeKey: result.routeKey,
    status: result.status,
  };
}

async function testImportedRoutes(pool, context, plan, vault) {
  const routes = await loadImportedRoutes(pool, context, plan);
  const routeTestService = new AiRouteTestService({ credentialVault: vault, pool });
  const results = [];

  for (const route of routes) {
    try {
      results.push(summarizeRouteTest(await routeTestService.testAdminDraftRoute(context, route.id, {})));
    } catch (error) {
      results.push({
        checkedAt: null,
        error: {
          code: "ROUTE_TEST_EXECUTION_ERROR",
          message: error instanceof Error ? error.message : "Route test could not run",
        },
        latencyMs: null,
        routeKey: route.route_key,
        status: "failed",
      });
    }
  }

  return results;
}

async function main() {
  const options = parseRouteImportCommand(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  const plan = buildImportPlan();
  const pool = createPgPool();
  try {
    const context = await resolveImportContext(pool, process.env);
    if (options.test) {
      const vault = new CredentialVault({
        keyVersion: process.env.CREDENTIAL_KEY_VERSION?.trim() || "v1",
        masterKey: process.env.CREDENTIAL_MASTER_KEY ?? "",
      });
      const results = await testImportedRoutes(pool, context, plan, vault);
      console.log(JSON.stringify({ mode: "tested", routes: results }, null, 2));
      if (results.some((result) => result.status !== "ok")) {
        process.exitCode = 1;
      }
      return;
    }
    if (options.publishDefaultRouteKey) {
      const result = await publishRoutes(pool, context, plan, options.publishDefaultRouteKey);
      console.log(JSON.stringify({
        defaultRouteKey: result.defaultRouteKey,
        mode: "published",
        routeKeys: result.routeKeys,
        status: "active",
      }, null, 2));
      return;
    }
    const identity = await preflight(pool, context, plan);
    if (!options.apply) {
      console.log(JSON.stringify({
        catalogId: identity.catalogId,
        mode: "dry-run",
        modelId: identity.modelId,
        providerId: identity.providerId,
        routes: summarizePlan(plan),
      }, null, 2));
      return;
    }

    const secrets = readRequiredSecrets(plan);
    const vault = new CredentialVault({
      keyVersion: process.env.CREDENTIAL_KEY_VERSION?.trim() || "v1",
      masterKey: process.env.CREDENTIAL_MASTER_KEY ?? "",
    });
    const result = await importRoutes(pool, context, plan, secrets, vault);
    console.log(JSON.stringify({
      catalogId: result.identity.catalogId,
      mode: "applied",
      routes: result.imported,
      status: "inactive",
    }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`GPT-Image-2 route import failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
});
