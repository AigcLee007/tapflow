import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, test } from "vitest";

import { createPgPool, withTenantTransaction } from "../src/index.js";
import { runMigrations } from "../src/migrator.js";
import { hasDatabaseEnv, withAppContextTransaction, withDatabase } from "./helpers.js";

const originalDatabaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = hasDatabaseEnv() ? describe : describe.skip;

afterAll(() => {
  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
});

describeWithDatabase("ai plugin package migration and RLS", () => {
  test("creates AI plugin tables and extends AI routes", async () => {
    await withDatabase(async ({ databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const pool = createPgPool();

      try {
        await runMigrations(pool);

        const tables = await pool.query<{ table_name: string }>(
          `
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name IN (
                'ai_plugin_packages',
                'tenant_ai_plugin_installs',
                'ai_model_catalog',
                'ai_route_health_checks'
              )
            ORDER BY table_name ASC
          `,
        );
        expect(tables.rows.map((row) => row.table_name)).toEqual([
          "ai_model_catalog",
          "ai_plugin_packages",
          "ai_route_health_checks",
          "tenant_ai_plugin_installs",
        ]);

        const routeColumns = await pool.query<{ column_name: string }>(
          `
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'ai_routes'
              AND column_name IN (
                'plugin_install_id',
                'model_family',
                'route_label',
                'environment'
              )
            ORDER BY column_name ASC
          `,
        );
        expect(routeColumns.rows.map((row) => row.column_name)).toEqual([
          "environment",
          "model_family",
          "plugin_install_id",
          "route_label",
        ]);
      } finally {
        await pool.end();
      }
    });
  });

  test("tenant RLS isolates plugin installs, catalog models, and route health checks", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();

      const tenantA = randomUUID();
      const tenantB = randomUUID();
      const userA = randomUUID();
      const userB = randomUUID();
      const packageId = randomUUID();
      const providerId = randomUUID();
      const modelId = randomUUID();
      const tenantAInstallId = randomUUID();
      const tenantBInstallId = randomUUID();
      const tenantARouteId = randomUUID();
      const tenantBRouteId = randomUUID();

      try {
        await runMigrations(adminPool);
        appPool = createPgPool({
          connectionString: await createAppDatabaseUrl(),
        });

        await adminPool.query(
          `
            INSERT INTO ai_plugin_packages (
              id,
              package_key,
              display_name,
              provider_key,
              adapter_kind,
              modality,
              version,
              manifest_json
            )
            VALUES (
              $1::uuid,
              'visionary.nano-banana',
              'Nano Banana Pro',
              'visionary',
              'visionary-nano-banana',
              'image',
              '1.0.0',
              '{"packageKey":"visionary.nano-banana"}'::jsonb
            )
          `,
          [packageId],
        );
        await adminPool.query(
          `
            INSERT INTO ai_providers (id, key, name, kind, default_base_url)
            VALUES ($1::uuid, 'visionary', 'Visionary', 'visionary-nano-banana', 'https://visionary.beer')
          `,
          [providerId],
        );
        await adminPool.query(
          `
            INSERT INTO ai_models (
              id,
              provider_id,
              model_key,
              display_name,
              modality
            )
            VALUES (
              $1::uuid,
              $2::uuid,
              'nano-banana-pro',
              'Nano Banana Pro',
              'image'
            )
          `,
          [modelId, providerId],
        );
        await adminPool.query(
          `
            INSERT INTO ai_model_catalog (
              tenant_id,
              model_id,
              model_key,
              display_name,
              modality,
              model_family,
              default_route_key
            )
            VALUES (
              NULL,
              $1::uuid,
              'system-image-model',
              'System Image Model',
              'image',
              'system-image',
              'image.system'
            )
          `,
          [modelId],
        );

        for (const [tenantId, userId, installId, routeId, email, slug, routeKey] of [
          [
            tenantA,
            userA,
            tenantAInstallId,
            tenantARouteId,
            "plugin-a@example.com",
            "plugin-a",
            "image.nano-a",
          ],
          [
            tenantB,
            userB,
            tenantBInstallId,
            tenantBRouteId,
            "plugin-b@example.com",
            "plugin-b",
            "image.nano-b",
          ],
        ] as const) {
          await withTenantTransaction({ tenantId, userId }, async (client) => {
            await client.query(
              `
                INSERT INTO users (id, email, display_name)
                VALUES ($1::uuid, $2, $3)
              `,
              [userId, email, slug],
            );
            await client.query(
              `
                INSERT INTO tenants (id, name, slug, updated_at)
                VALUES ($1::uuid, $2, $3, now())
              `,
              [tenantId, slug, slug],
            );
            await client.query(
              `
                INSERT INTO tenant_memberships (tenant_id, user_id, role_key, status, joined_at, updated_at)
                VALUES ($1::uuid, $2::uuid, 'tenant_owner', 'active', now(), now())
              `,
              [tenantId, userId],
            );
            await client.query(
              `
                INSERT INTO tenant_ai_plugin_installs (
                  id,
                  tenant_id,
                  package_id,
                  installed_version,
                  status,
                  provider_id,
                  installed_by
                )
                VALUES (
                  $1::uuid,
                  $2::uuid,
                  $3::uuid,
                  '1.0.0',
                  'published',
                  $4::uuid,
                  $5::uuid
                )
              `,
              [installId, tenantId, packageId, providerId, userId],
            );
            await client.query(
              `
                INSERT INTO ai_routes (
                  id,
                  tenant_id,
                  provider_id,
                  model_id,
                  plugin_install_id,
                  route_key,
                  route_label,
                  modality,
                  model_family,
                  environment
                )
                VALUES (
                  $1::uuid,
                  $2::uuid,
                  $3::uuid,
                  $4::uuid,
                  $5::uuid,
                  $6,
                  $7,
                  'image',
                  'nano-banana-pro',
                  'staging'
                )
              `,
              [
                routeId,
                tenantId,
                providerId,
                modelId,
                installId,
                routeKey,
                `${slug} route`,
              ],
            );
            await client.query(
              `
                INSERT INTO ai_model_catalog (
                  tenant_id,
                  plugin_install_id,
                  model_id,
                  model_key,
                  display_name,
                  modality,
                  model_family,
                  default_route_key
                )
                VALUES (
                  $1::uuid,
                  $2::uuid,
                  $3::uuid,
                  $4,
                  $5,
                  'image',
                  'nano-banana-pro',
                  $6
                )
              `,
              [
                tenantId,
                installId,
                modelId,
                `${slug}-model`,
                `${slug} Model`,
                routeKey,
              ],
            );
            await client.query(
              `
                INSERT INTO ai_route_health_checks (
                  tenant_id,
                  route_id,
                  status,
                  latency_ms,
                  checked_by
                )
                VALUES (
                  $1::uuid,
                  $2::uuid,
                  'ok',
                  123,
                  $3::uuid
                )
              `,
              [tenantId, routeId, userId],
            );
          }, adminPool);
        }

        const tenantAView = await withAppContextTransaction(
          appPool,
          { tenantId: tenantA, userId: userA },
          async (client) => {
            const installs = await client.query<{ status: string }>(
              "SELECT status FROM tenant_ai_plugin_installs ORDER BY created_at ASC",
            );
            const catalog = await client.query<{ model_key: string; tenant_id: string | null }>(
              "SELECT model_key, tenant_id::text AS tenant_id FROM ai_model_catalog ORDER BY model_key ASC",
            );
            const health = await client.query<{ total: number }>(
              "SELECT COUNT(*)::int AS total FROM ai_route_health_checks",
            );
            const routes = await client.query<{
              environment: string;
              model_family: string | null;
              route_key: string;
              route_label: string | null;
            }>(
              `
                SELECT route_key, route_label, model_family, environment
                FROM ai_routes
                ORDER BY route_key ASC
              `,
            );

            return {
              catalog: catalog.rows,
              healthChecks: health.rows[0]?.total ?? 0,
              installs: installs.rows.map((row) => row.status),
              routes: routes.rows,
            };
          },
        );

        expect(tenantAView).toEqual({
          catalog: [
            { model_key: "plugin-a-model", tenant_id: tenantA },
            { model_key: "system-image-model", tenant_id: null },
          ],
          healthChecks: 1,
          installs: ["published"],
          routes: [
            {
              environment: "staging",
              model_family: "nano-banana-pro",
              route_key: "image.nano-a",
              route_label: "plugin-a route",
            },
          ],
        });

        const tenantBView = await withAppContextTransaction(
          appPool,
          { tenantId: tenantB, userId: userB },
          async (client) => {
            const installs = await client.query<{ status: string }>(
              "SELECT status FROM tenant_ai_plugin_installs ORDER BY created_at ASC",
            );
            const catalog = await client.query<{ model_key: string; tenant_id: string | null }>(
              "SELECT model_key, tenant_id::text AS tenant_id FROM ai_model_catalog ORDER BY model_key ASC",
            );
            const health = await client.query<{ total: number }>(
              "SELECT COUNT(*)::int AS total FROM ai_route_health_checks",
            );
            const routes = await client.query<{ route_key: string }>(
              "SELECT route_key FROM ai_routes ORDER BY route_key ASC",
            );

            return {
              catalog: catalog.rows,
              healthChecks: health.rows[0]?.total ?? 0,
              installs: installs.rows.map((row) => row.status),
              routes: routes.rows.map((row) => row.route_key),
            };
          },
        );

        expect(tenantBView).toEqual({
          catalog: [
            { model_key: "plugin-b-model", tenant_id: tenantB },
            { model_key: "system-image-model", tenant_id: null },
          ],
          healthChecks: 1,
          installs: ["published"],
          routes: ["image.nano-b"],
        });

        await expect(
          withAppContextTransaction(
            appPool,
            { tenantId: tenantA, userId: userA },
            async (client) => {
              await client.query(
                `
                  INSERT INTO ai_model_catalog (
                    tenant_id,
                    model_key,
                    display_name,
                    modality,
                    model_family
                  )
                  VALUES (
                    NULL,
                    'forbidden-system-model',
                    'Forbidden System Model',
                    'image',
                    'forbidden'
                  )
                `,
              );
            },
          ),
        ).rejects.toMatchObject({
          code: "42501",
        });
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });
});
