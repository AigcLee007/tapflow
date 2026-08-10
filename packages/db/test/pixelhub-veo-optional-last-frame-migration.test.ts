import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { afterAll, describe, expect, test } from "vitest";

import { createPgPool } from "../src/index.js";
import { runMigrations } from "../src/migrator.js";
import { hasDatabaseEnv, withDatabase } from "./helpers.js";

const migrationFile = "000062_pixelhub_veo_optional_last_frame.sql";
const originalDatabaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = hasDatabaseEnv() ? describe : describe.skip;

afterAll(() => {
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
});

describe("PixelHub Veo optional-last-frame migration", () => {
  test("targets only the stable platform Veo route while preserving its request configuration", async () => {
    const sql = await readFile(path.resolve(import.meta.dirname, `../migrations/${migrationFile}`), "utf8");

    expect(sql).toContain("video.pixelhub.veo31-fast");
    expect(sql).toContain("route.tenant_id IS NULL");
    expect(sql).toContain("UPDATE ai_models AS model");
    expect(sql).toContain("{capabilities,modeConstraints,first_last_frame,minImages}");
    expect(sql).toContain("route.request_config");
    expect(sql).not.toContain("pricing =");
    expect(sql).not.toContain("credential_id =");
    expect(sql).not.toContain("connection_id =");
  });
});

describeWithDatabase("PixelHub Veo optional-last-frame migration", () => {
  test("upgrades only the installed platform route and is idempotent", async () => {
    await withDatabase(async ({ databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const pool = createPgPool();
      const providerId = randomUUID();
      const modelId = randomUUID();
      const tenantModelId = randomUUID();
      const credentialId = randomUUID();
      const connectionId = randomUUID();
      const packageId = randomUUID();
      const installId = randomUUID();
      const platformRouteId = randomUUID();
      const tenantId = randomUUID();
      const tenantRouteId = randomUUID();

      try {
        await runMigrations(pool);
        await pool.query(
          `
            INSERT INTO ai_providers (id, key, name, kind)
            VALUES ($1::uuid, 'pixelhub-migration-test', 'PixelHub', 'pixelhub-video')
          `,
          [providerId],
        );
        const capabilities = {
          aspectRatios: ["16:9", "9:16"],
          audioControlMode: "always_on_implicit",
          confirmedByRoute: true,
          defaults: { aspectRatio: "16:9", count: 1, durationSeconds: 4, generateAudio: true, mode: "first_last_frame", resolution: "1080P" },
          durationStepSeconds: 2,
          maxAudios: 0,
          maxCount: 1,
          maxDurationSeconds: 8,
          maxImages: 2,
          maxPromptLength: null,
          maxTotal: 2,
          maxVideos: 0,
          minDurationSeconds: 4,
          modeConstraints: {
            first_last_frame: { maxAudios: 0, maxImages: 2, maxTotal: 2, maxVideos: 0, minImages: 2 },
            image_to_video: { maxAudios: 0, maxImages: 1, maxTotal: 1, maxVideos: 0, minImages: 1 },
            text_to_video: { maxAudios: 0, maxImages: 0, maxTotal: 0, maxVideos: 0 },
          },
          preservedModelSetting: "keep-model-setting",
          referenceSemantics: "ordered_first_last_frames",
          resolutions: ["720P", "1080P"],
          supportedDurations: [4, 6, 8],
          supportedModes: ["text_to_video", "image_to_video", "first_last_frame"],
        };
        await pool.query(
          `
            INSERT INTO ai_models (id, provider_id, model_key, display_name, modality, capabilities)
            VALUES ($1::uuid, $2::uuid, 'veo31-fast', 'Veo 3.1 Fast', 'video', $3::jsonb)
          `,
          [modelId, providerId, JSON.stringify(capabilities)],
        );
        await pool.query(
          `
            INSERT INTO ai_models (id, provider_id, model_key, display_name, modality, capabilities)
            VALUES ($1::uuid, $2::uuid, 'tenant-veo31-fast', 'Tenant Veo 3.1 Fast', 'video', $3::jsonb)
          `,
          [tenantModelId, providerId, JSON.stringify(capabilities)],
        );
        await pool.query(
          `
            INSERT INTO api_credentials (id, tenant_id, provider_id, name, encrypted_secret, nonce, auth_tag, key_version, secret_fingerprint)
            VALUES ($1::uuid, NULL, $2::uuid, 'PixelHub Key', decode('01', 'hex'), decode('02', 'hex'), decode('03', 'hex'), 'v1', 'fingerprint')
          `,
          [credentialId, providerId],
        );
        await pool.query(
          `
            INSERT INTO ai_provider_connections (id, tenant_id, provider_id, credential_id, name, adapter_kind)
            VALUES ($1::uuid, NULL, $2::uuid, $3::uuid, 'PixelHub Veo Connection', 'pixelhub-video')
          `,
          [connectionId, providerId, credentialId],
        );
        await pool.query(
          `
            INSERT INTO ai_plugin_packages (id, package_key, display_name, provider_key, adapter_kind, modality, version, manifest_json)
            VALUES ($1::uuid, 'pixelhub.video', 'PixelHub Video', 'pixelhub', 'pixelhub-video', 'video', '1.0.0', '{}'::jsonb)
          `,
          [packageId],
        );
        await pool.query(
          `
            INSERT INTO tenant_ai_plugin_installs (id, tenant_id, package_id, installed_version, status, provider_id, credential_id)
            VALUES ($1::uuid, NULL, $2::uuid, '1.0.0', 'published', $3::uuid, $4::uuid)
          `,
          [installId, packageId, providerId, credentialId],
        );
        await pool.query("INSERT INTO tenants (id, name, slug) VALUES ($1::uuid, 'Migration Tenant', 'pixelhub-migration-tenant')", [tenantId]);

        const requestConfig = {
          capabilities: {
            modeConstraints: {
              first_last_frame: { maxAudios: 0, maxImages: 2, maxTotal: 2, maxVideos: 0, minImages: 2 },
            },
          },
          preservedSetting: "keep-me",
        };
        await pool.query(
          `
            INSERT INTO ai_routes (
              id, tenant_id, provider_id, model_id, credential_id, connection_id, plugin_install_id,
              route_key, modality, request_config, pricing, status
            )
            VALUES ($1::uuid, NULL, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, 'video.pixelhub.veo31-fast', 'video', $7::jsonb, '{"unitCredits":0.5}'::jsonb, 'active')
          `,
          [platformRouteId, providerId, modelId, credentialId, connectionId, installId, JSON.stringify(requestConfig)],
        );
        await pool.query(
          `
            INSERT INTO ai_routes (id, tenant_id, provider_id, model_id, route_key, modality, request_config, pricing, status)
            VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'video.pixelhub.veo31-fast', 'video', $5::jsonb, '{"unitCredits":9}'::jsonb, 'active')
          `,
          [tenantRouteId, tenantId, providerId, tenantModelId, JSON.stringify(requestConfig)],
        );

        await pool.query("DELETE FROM schema_migrations WHERE filename = $1", [migrationFile]);
        expect((await runMigrations(pool)).appliedMigrations).toContain(migrationFile);

        const routes = await pool.query<{
          connection_id: string | null;
          credential_id: string | null;
          min_images: number;
          pricing: Record<string, unknown>;
          preserved_setting: string;
          route_key: string;
          tenant_id: string | null;
        }>(
          `
            SELECT
              tenant_id::text AS tenant_id,
              route_key,
              credential_id::text AS credential_id,
              connection_id::text AS connection_id,
              pricing,
              (request_config #>> '{capabilities,modeConstraints,first_last_frame,minImages}')::int AS min_images,
              request_config->>'preservedSetting' AS preserved_setting
            FROM ai_routes
            WHERE id IN ($1::uuid, $2::uuid)
            ORDER BY tenant_id NULLS FIRST
          `,
          [platformRouteId, tenantRouteId],
        );
        expect(routes.rows).toEqual([
          {
            connection_id: connectionId,
            credential_id: credentialId,
            min_images: 1,
            pricing: { unitCredits: 0.5 },
            preserved_setting: "keep-me",
            route_key: "video.pixelhub.veo31-fast",
            tenant_id: null,
          },
          {
            connection_id: null,
            credential_id: null,
            min_images: 2,
            pricing: { unitCredits: 9 },
            preserved_setting: "keep-me",
            route_key: "video.pixelhub.veo31-fast",
            tenant_id: tenantId,
          },
        ]);

        const models = await pool.query<{
          min_images: number;
          model_key: string;
          preserved_model_setting: string;
        }>(
          `
            SELECT
              model_key,
              (capabilities #>> '{modeConstraints,first_last_frame,minImages}')::int AS min_images,
              capabilities->>'preservedModelSetting' AS preserved_model_setting
            FROM ai_models
            WHERE id IN ($1::uuid, $2::uuid)
            ORDER BY model_key ASC
          `,
          [modelId, tenantModelId],
        );
        expect(models.rows).toEqual([
          { min_images: 2, model_key: "tenant-veo31-fast", preserved_model_setting: "keep-model-setting" },
          { min_images: 1, model_key: "veo31-fast", preserved_model_setting: "keep-model-setting" },
        ]);

        await pool.query("DELETE FROM schema_migrations WHERE filename = $1", [migrationFile]);
        expect((await runMigrations(pool)).appliedMigrations).toContain(migrationFile);
        expect((await pool.query<{ min_images: number }>(
          "SELECT (request_config #>> '{capabilities,modeConstraints,first_last_frame,minImages}')::int AS min_images FROM ai_routes WHERE id = $1::uuid",
          [platformRouteId],
        )).rows).toEqual([{ min_images: 1 }]);
      } finally {
        await pool.end();
      }
    });
  });
});
