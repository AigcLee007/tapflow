import { createHash } from "node:crypto";

import { CredentialVault } from "@aigc-flow/ai-gateway-core";
import { createPgPool, withTenantTransaction } from "@aigc-flow/db";

type Args = {
  email: string | null;
  mockCredentialSecret: string;
  openAiApiKey: string | null;
  openAiBaseUrl: string | null;
  openAiImageModel: string;
  tenantId: string | null;
  userId: string | null;
};

type SeedTarget = {
  email: string | null;
  tenantId: string;
  userId: string;
};

const DEV_CREDENTIAL_KEY_VERSION = "v1";
const DEV_CREDENTIAL_MASTER_KEY = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
const PROVIDER_KEY = "mock-local-dev";
const OPENAI_PROVIDER_KEY = "openai-compatible";
const IMAGE_MODEL_KEY = "mock-image-v1";
const VIDEO_MODEL_KEY = "mock-video-v1";
const DEFAULT_OPENAI_IMAGE_MODEL_KEY = "gpt-image-1";
const IMAGE_ROUTE_KEY = "image.default";
const IMAGE_FAIL_ROUTE_KEY = "image.fail";
const VIDEO_ROUTE_KEY = "video.default";
const OPENAI_IMAGE_ROUTE_KEY = "image.openai";

function parseArgs(argv: string[]): Args {
  const args: Args = {
    email: null,
    mockCredentialSecret: "mock-local-dev-secret",
    openAiApiKey: process.env.OPENAI_API_KEY?.trim() || null,
    openAiBaseUrl:
      process.env.OPENAI_COMPAT_BASE_URL?.trim() ||
      process.env.OPENAI_BASE_URL?.trim() ||
      null,
    openAiImageModel: DEFAULT_OPENAI_IMAGE_MODEL_KEY,
    tenantId: null,
    userId: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    const next = argv[index + 1];
    if (!value.startsWith("--")) continue;

    switch (value) {
      case "--email":
        args.email = next ?? null;
        index += 1;
        break;
      case "--tenant-id":
        args.tenantId = next ?? null;
        index += 1;
        break;
      case "--user-id":
        args.userId = next ?? null;
        index += 1;
        break;
      case "--mock-secret":
        args.mockCredentialSecret = next?.trim() || args.mockCredentialSecret;
        index += 1;
        break;
      case "--openai-api-key":
        args.openAiApiKey = next?.trim() || null;
        index += 1;
        break;
      case "--openai-base-url":
        args.openAiBaseUrl = next?.trim() || null;
        index += 1;
        break;
      case "--openai-image-model":
        args.openAiImageModel = next?.trim() || DEFAULT_OPENAI_IMAGE_MODEL_KEY;
        index += 1;
        break;
      default:
        break;
    }
  }

  return args;
}

function ensureSeedGuard() {
  if (process.env.NODE_ENV === "development" || process.env.DEV_SEED_ENABLED === "true") {
    return;
  }

  throw new Error(
    "AI seed is only allowed in development. Set NODE_ENV=development or DEV_SEED_ENABLED=true.",
  );
}

function createVault(): CredentialVault {
  return new CredentialVault({
    keyVersion: process.env.CREDENTIAL_KEY_VERSION?.trim() || DEV_CREDENTIAL_KEY_VERSION,
    masterKey: process.env.CREDENTIAL_MASTER_KEY?.trim() || DEV_CREDENTIAL_MASTER_KEY,
  });
}

async function resolveTarget(pool: ReturnType<typeof createPgPool>, args: Args): Promise<SeedTarget> {
  if (args.tenantId && args.userId) {
    return {
      email: args.email,
      tenantId: args.tenantId,
      userId: args.userId,
    };
  }

  if (!args.email) {
    throw new Error("Provide --email or both --tenant-id and --user-id.");
  }

  const result = await pool.query<{
    email: string;
    tenant_id: string;
    user_id: string;
  }>(
    `
      SELECT
        users.email,
        tenant_memberships.tenant_id::text AS tenant_id,
        users.id::text AS user_id
      FROM users
      JOIN tenant_memberships
        ON tenant_memberships.user_id = users.id
      JOIN tenants
        ON tenants.id = tenant_memberships.tenant_id
      WHERE lower(users.email) = lower($1)
        AND tenant_memberships.status = 'active'
        AND tenants.status = 'active'
      ORDER BY tenant_memberships.created_at ASC, tenant_memberships.tenant_id ASC
      LIMIT 1
    `,
    [args.email],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error(`Unable to find an active tenant membership for ${args.email}.`);
  }

  return {
    email: row.email,
    tenantId: row.tenant_id,
    userId: row.user_id,
  };
}

async function upsertProviderAndModels(pool: ReturnType<typeof createPgPool>) {
  const providerResult = await pool.query<{
    id: string;
  }>(
    `
      INSERT INTO ai_providers (
        key,
        name,
        kind,
        status,
        default_base_url,
        capabilities,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        'active',
        $4,
        $5::jsonb,
        now()
      )
      ON CONFLICT (key) DO UPDATE
      SET
        name = EXCLUDED.name,
        kind = EXCLUDED.kind,
        status = 'active',
        default_base_url = EXCLUDED.default_base_url,
        capabilities = EXCLUDED.capabilities,
        updated_at = now()
      RETURNING id::text AS id
    `,
    [
      PROVIDER_KEY,
      "Mock Local Dev Provider",
      "mock",
      "mock://local",
      JSON.stringify({
        localDevOnly: true,
        supportsFailureSimulation: true,
      }),
    ],
  );
  const providerId = providerResult.rows[0]?.id;
  if (!providerId) {
    throw new Error("Failed to seed mock provider.");
  }

  const imageModelResult = await pool.query<{ id: string }>(
    `
      INSERT INTO ai_models (
        provider_id,
        model_key,
        display_name,
        modality,
        capabilities,
        context_window,
        status,
        updated_at
      )
      VALUES (
        $1::uuid,
        $2,
        $3,
        'image',
        $4::jsonb,
        NULL,
        'active',
        now()
      )
      ON CONFLICT (provider_id, model_key) DO UPDATE
      SET
        display_name = EXCLUDED.display_name,
        modality = EXCLUDED.modality,
        capabilities = EXCLUDED.capabilities,
        status = 'active',
        updated_at = now()
      RETURNING id::text AS id
    `,
    [
      providerId,
      IMAGE_MODEL_KEY,
      "Mock Image v1",
      JSON.stringify({
        localDevOnly: true,
      }),
    ],
  );

  const videoModelResult = await pool.query<{ id: string }>(
    `
      INSERT INTO ai_models (
        provider_id,
        model_key,
        display_name,
        modality,
        capabilities,
        context_window,
        status,
        updated_at
      )
      VALUES (
        $1::uuid,
        $2,
        $3,
        'video',
        $4::jsonb,
        NULL,
        'active',
        now()
      )
      ON CONFLICT (provider_id, model_key) DO UPDATE
      SET
        display_name = EXCLUDED.display_name,
        modality = EXCLUDED.modality,
        capabilities = EXCLUDED.capabilities,
        status = 'active',
        updated_at = now()
      RETURNING id::text AS id
    `,
    [
      providerId,
      VIDEO_MODEL_KEY,
      "Mock Video v1",
      JSON.stringify({
        localDevOnly: true,
      }),
    ],
  );

  return {
    imageModelId: imageModelResult.rows[0]?.id,
    providerId,
    videoModelId: videoModelResult.rows[0]?.id,
  };
}

async function upsertOpenAiProviderAndModel(
  pool: ReturnType<typeof createPgPool>,
  input: {
    baseUrl: string;
    modelKey: string;
  },
) {
  const providerResult = await pool.query<{ id: string }>(
    `
      INSERT INTO ai_providers (
        key,
        name,
        kind,
        status,
        default_base_url,
        capabilities,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        'active',
        $4,
        $5::jsonb,
        now()
      )
      ON CONFLICT (key) DO UPDATE
      SET
        name = EXCLUDED.name,
        kind = EXCLUDED.kind,
        status = 'active',
        default_base_url = EXCLUDED.default_base_url,
        capabilities = EXCLUDED.capabilities,
        updated_at = now()
      RETURNING id::text AS id
    `,
    [
      OPENAI_PROVIDER_KEY,
      "OpenAI-compatible",
      "openai-compatible",
      input.baseUrl,
      JSON.stringify({
        localDevOnly: true,
        supportsImageGeneration: true,
      }),
    ],
  );
  const providerId = providerResult.rows[0]?.id;
  if (!providerId) {
    throw new Error("Failed to seed OpenAI provider.");
  }

  const imageModelResult = await pool.query<{ id: string }>(
    `
      INSERT INTO ai_models (
        provider_id,
        model_key,
        display_name,
        modality,
        capabilities,
        context_window,
        status,
        updated_at
      )
      VALUES (
        $1::uuid,
        $2,
        $3,
        'image',
        $4::jsonb,
        NULL,
        'active',
        now()
      )
      ON CONFLICT (provider_id, model_key) DO UPDATE
      SET
        display_name = EXCLUDED.display_name,
        modality = EXCLUDED.modality,
        capabilities = EXCLUDED.capabilities,
        status = 'active',
        updated_at = now()
      RETURNING id::text AS id
    `,
    [
      providerId,
      input.modelKey,
      `OpenAI-compatible ${input.modelKey}`,
      JSON.stringify({
        localDevOnly: true,
      }),
    ],
  );

  return {
    imageModelId: imageModelResult.rows[0]?.id,
    providerId,
  };
}

async function upsertTenantCredentialAndRoutes(
  pool: ReturnType<typeof createPgPool>,
  target: SeedTarget,
  input: {
    imageModelId: string;
    providerId: string;
    videoModelId: string;
  },
  vault: CredentialVault,
  secret: string,
) {
  return withTenantTransaction(
    { tenantId: target.tenantId, userId: target.userId },
    async (client) => {
      const encrypted = vault.createCredential(secret);

      const credentialResult = await client.query<{ id: string }>(
        `
          INSERT INTO api_credentials (
            tenant_id,
            provider_id,
            name,
            encrypted_secret,
            nonce,
            auth_tag,
            key_version,
            secret_fingerprint,
            status,
            created_by,
            updated_at
          )
          VALUES (
            $1::uuid,
            $2::uuid,
            $3,
            $4::bytea,
            $5::bytea,
            $6::bytea,
            $7,
            $8,
            'active',
            $9::uuid,
            now()
          )
          ON CONFLICT (tenant_id, provider_id, name)
          WHERE tenant_id IS NOT NULL
          DO UPDATE
          SET
            encrypted_secret = EXCLUDED.encrypted_secret,
            nonce = EXCLUDED.nonce,
            auth_tag = EXCLUDED.auth_tag,
            key_version = EXCLUDED.key_version,
            secret_fingerprint = EXCLUDED.secret_fingerprint,
            status = 'active',
            created_by = EXCLUDED.created_by,
            updated_at = now()
          RETURNING id::text AS id
        `,
        [
          target.tenantId,
          input.providerId,
          "mock-local-dev-credential",
          encrypted.encryptedSecret,
          encrypted.nonce,
          encrypted.authTag,
          encrypted.keyVersion,
          encrypted.secretFingerprint,
          target.userId,
        ],
      );

      const credentialId = credentialResult.rows[0]?.id;
      if (!credentialId) {
        throw new Error("Failed to seed mock credential.");
      }

      const upsertRoute = async (params: {
        modelId: string;
        modality: "image" | "video";
        mockMode: "success" | "fail";
        routeKey: string;
      }) => {
        await client.query(
          `
            INSERT INTO ai_routes (
              tenant_id,
              provider_id,
              model_id,
              credential_id,
              route_key,
              modality,
              priority,
              weight,
              base_url_override,
              request_config,
              pricing,
              rate_limit,
              status,
              updated_at
            )
            VALUES (
              $1::uuid,
              $2::uuid,
              $3::uuid,
              $4::uuid,
              $5,
              $6,
              10,
              100,
              'mock://local',
              $7::jsonb,
              '{}'::jsonb,
              '{}'::jsonb,
              'active',
              now()
            )
            ON CONFLICT (tenant_id, route_key)
            WHERE tenant_id IS NOT NULL
            DO UPDATE
            SET
              provider_id = EXCLUDED.provider_id,
              model_id = EXCLUDED.model_id,
              credential_id = EXCLUDED.credential_id,
              modality = EXCLUDED.modality,
              priority = EXCLUDED.priority,
              weight = EXCLUDED.weight,
              base_url_override = EXCLUDED.base_url_override,
              request_config = EXCLUDED.request_config,
              pricing = EXCLUDED.pricing,
              rate_limit = EXCLUDED.rate_limit,
              status = 'active',
              updated_at = now()
          `,
          [
            target.tenantId,
            input.providerId,
            params.modelId,
            credentialId,
            params.routeKey,
            params.modality,
            JSON.stringify({
              localDevOnly: true,
              mockMode: params.mockMode,
            }),
          ],
        );
      };

      await upsertRoute({
        mockMode: "success",
        modality: "image",
        modelId: input.imageModelId,
        routeKey: IMAGE_ROUTE_KEY,
      });
      await upsertRoute({
        mockMode: "fail",
        modality: "image",
        modelId: input.imageModelId,
        routeKey: IMAGE_FAIL_ROUTE_KEY,
      });
      await upsertRoute({
        mockMode: "success",
        modality: "video",
        modelId: input.videoModelId,
        routeKey: VIDEO_ROUTE_KEY,
      });

      return {
        credentialId,
      };
    },
    pool,
  );
}

async function upsertOpenAiTenantRoute(
  pool: ReturnType<typeof createPgPool>,
  target: SeedTarget,
  input: {
    baseUrl: string;
    imageModelId: string;
    providerId: string;
  },
  vault: CredentialVault,
  secret: string,
) {
  return withTenantTransaction(
    { tenantId: target.tenantId, userId: target.userId },
    async (client) => {
      const encrypted = vault.createCredential(secret);

      const credentialResult = await client.query<{ id: string }>(
        `
          INSERT INTO api_credentials (
            tenant_id,
            provider_id,
            name,
            encrypted_secret,
            nonce,
            auth_tag,
            key_version,
            secret_fingerprint,
            status,
            created_by,
            updated_at
          )
          VALUES (
            $1::uuid,
            $2::uuid,
            $3,
            $4::bytea,
            $5::bytea,
            $6::bytea,
            $7,
            $8,
            'active',
            $9::uuid,
            now()
          )
          ON CONFLICT (tenant_id, provider_id, name)
          WHERE tenant_id IS NOT NULL
          DO UPDATE
          SET
            encrypted_secret = EXCLUDED.encrypted_secret,
            nonce = EXCLUDED.nonce,
            auth_tag = EXCLUDED.auth_tag,
            key_version = EXCLUDED.key_version,
            secret_fingerprint = EXCLUDED.secret_fingerprint,
            status = 'active',
            created_by = EXCLUDED.created_by,
            updated_at = now()
          RETURNING id::text AS id
        `,
        [
          target.tenantId,
          input.providerId,
          "openai-image-dev-credential",
          encrypted.encryptedSecret,
          encrypted.nonce,
          encrypted.authTag,
          encrypted.keyVersion,
          encrypted.secretFingerprint,
          target.userId,
        ],
      );

      const credentialId = credentialResult.rows[0]?.id;
      if (!credentialId) {
        throw new Error("Failed to seed OpenAI credential.");
      }

      await client.query(
        `
          INSERT INTO ai_routes (
            tenant_id,
            provider_id,
            model_id,
            credential_id,
            route_key,
            modality,
            priority,
            weight,
            base_url_override,
            request_config,
            pricing,
            rate_limit,
            status,
            updated_at
          )
          VALUES (
            $1::uuid,
            $2::uuid,
            $3::uuid,
            $4::uuid,
            $5::text,
            'image',
            20,
            100,
            $6::text,
            $7::jsonb,
            '{}'::jsonb,
            '{}'::jsonb,
            'active',
            now()
          )
          ON CONFLICT (tenant_id, route_key)
          WHERE tenant_id IS NOT NULL
          DO UPDATE
          SET
            provider_id = EXCLUDED.provider_id,
            model_id = EXCLUDED.model_id,
            credential_id = EXCLUDED.credential_id,
            modality = EXCLUDED.modality,
            priority = EXCLUDED.priority,
            weight = EXCLUDED.weight,
            base_url_override = EXCLUDED.base_url_override,
            request_config = EXCLUDED.request_config,
            pricing = EXCLUDED.pricing,
            rate_limit = EXCLUDED.rate_limit,
            status = 'active',
            updated_at = now()
        `,
        [
          target.tenantId,
          input.providerId,
          input.imageModelId,
          credentialId,
          OPENAI_IMAGE_ROUTE_KEY,
          input.baseUrl,
          JSON.stringify({
            localDevOnly: true,
            n: 1,
            outputFormat: "png",
            quality: "high",
            size: "1024x1024",
            timeoutMs: 120000,
          }),
        ],
      );

      return {
        credentialId,
      };
    },
    pool,
  );
}

async function upsertModelPricing(
  pool: ReturnType<typeof createPgPool>,
  options: {
    openAiImageModelKey: string | null;
    seedOpenAiPricing: boolean;
  },
) {
  const rows: Array<{
    metadata: Record<string, unknown>;
    minChargeCredits: number;
    model: string;
    provider: string;
    route: string;
    unit: string;
    unitCredits: number;
  }> = [
    {
      metadata: { label: "Mock image route pricing (local dev)" },
      minChargeCredits: 10,
      model: IMAGE_MODEL_KEY,
      provider: PROVIDER_KEY,
      route: IMAGE_ROUTE_KEY,
      unit: "image_generation",
      unitCredits: 10,
    },
    {
      metadata: { label: "Mock image failure route pricing (local dev)" },
      minChargeCredits: 10,
      model: IMAGE_MODEL_KEY,
      provider: PROVIDER_KEY,
      route: IMAGE_FAIL_ROUTE_KEY,
      unit: "image_generation",
      unitCredits: 10,
    },
    {
      metadata: { label: "Mock video route pricing (local dev)" },
      minChargeCredits: 50,
      model: VIDEO_MODEL_KEY,
      provider: PROVIDER_KEY,
      route: VIDEO_ROUTE_KEY,
      unit: "video_generation",
      unitCredits: 50,
    },
  ];

  if (options.seedOpenAiPricing && options.openAiImageModelKey) {
    rows.push({
      metadata: { label: "OpenAI-compatible image route pricing (local dev)" },
      minChargeCredits: 100,
      model: options.openAiImageModelKey,
      provider: OPENAI_PROVIDER_KEY,
      route: OPENAI_IMAGE_ROUTE_KEY,
      unit: "image_generation",
      unitCredits: 100,
    });
  }

  for (const row of rows) {
    await pool.query(
      `
        INSERT INTO model_pricing (
          provider,
          model,
          route,
          unit,
          unit_credits,
          min_charge_credits,
          metadata,
          active
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5::bigint,
          $6::bigint,
          $7::jsonb,
          true
        )
        ON CONFLICT (provider, model, route, unit) DO UPDATE
        SET
          unit_credits = EXCLUDED.unit_credits,
          min_charge_credits = EXCLUDED.min_charge_credits,
          metadata = EXCLUDED.metadata,
          active = true
      `,
      [
        row.provider,
        row.model,
        row.route,
        row.unit,
        row.unitCredits,
        row.minChargeCredits,
        JSON.stringify(row.metadata),
      ],
    );
  }
}

async function ensureDefaultPricingExists(pool: ReturnType<typeof createPgPool>) {
  const defaults = [
    { minChargeCredits: 1, unit: "text_generation", unitCredits: 1 },
    { minChargeCredits: 10, unit: "image_generation", unitCredits: 10 },
    { minChargeCredits: 50, unit: "video_generation", unitCredits: 50 },
  ];

  for (const item of defaults) {
    await pool.query(
      `
        INSERT INTO model_pricing (
          provider,
          model,
          route,
          unit,
          unit_credits,
          min_charge_credits,
          metadata,
          active
        )
        VALUES (
          'default',
          'default',
          'default',
          $1,
          $2::bigint,
          $3::bigint,
          $4::jsonb,
          true
        )
        ON CONFLICT (provider, model, route, unit) DO UPDATE
        SET
          unit_credits = EXCLUDED.unit_credits,
          min_charge_credits = EXCLUDED.min_charge_credits,
          active = true
      `,
      [
        item.unit,
        item.unitCredits,
        item.minChargeCredits,
        JSON.stringify({
          source: "dev-seed-ai",
          note: "Fallback pricing used by current workflow reserve estimator",
        }),
      ],
    );
  }
}

async function main() {
  ensureSeedGuard();

  const args = parseArgs(process.argv.slice(2));
  const vault = createVault();
  const pool = createPgPool();

  try {
    const target = await resolveTarget(pool, args);
    const seededProvider = await upsertProviderAndModels(pool);

    if (!seededProvider.imageModelId || !seededProvider.videoModelId) {
      throw new Error("Failed to seed mock models.");
    }

    const seededTenant = await upsertTenantCredentialAndRoutes(
      pool,
      target,
      {
        imageModelId: seededProvider.imageModelId,
        providerId: seededProvider.providerId,
        videoModelId: seededProvider.videoModelId,
      },
      vault,
      args.mockCredentialSecret,
    );

    let openAiSeedResult: { credentialId: string } | null = null;
    let openAiModelKey: string | null = null;
    if (args.openAiApiKey) {
      const openAiBaseUrl = args.openAiBaseUrl?.trim();
      if (!openAiBaseUrl) {
        throw new Error(
          "OpenAI-compatible seed requires base URL. Use --openai-base-url or set OPENAI_COMPAT_BASE_URL / OPENAI_BASE_URL.",
        );
      }

      const openAi = await upsertOpenAiProviderAndModel(pool, {
        baseUrl: openAiBaseUrl,
        modelKey: args.openAiImageModel.trim() || DEFAULT_OPENAI_IMAGE_MODEL_KEY,
      });
      if (!openAi.imageModelId) {
        throw new Error("Failed to seed OpenAI image model.");
      }
      openAiModelKey = args.openAiImageModel.trim() || DEFAULT_OPENAI_IMAGE_MODEL_KEY;
      openAiSeedResult = await upsertOpenAiTenantRoute(
        pool,
        target,
        {
          baseUrl: openAiBaseUrl,
          imageModelId: openAi.imageModelId,
          providerId: openAi.providerId,
        },
        vault,
        args.openAiApiKey,
      );
    }

    await upsertModelPricing(pool, {
      openAiImageModelKey: openAiModelKey,
      seedOpenAiPricing: Boolean(args.openAiApiKey),
    });
    await ensureDefaultPricingExists(pool);

    const secretFingerprint = createHash("sha256")
      .update(args.mockCredentialSecret)
      .digest("hex")
      .slice(0, 16);

    console.log(
      JSON.stringify(
        {
          credentialId: seededTenant.credentialId,
          email: target.email,
          note: "Routes seeded for local dev providers. OpenAI-compatible route is included only when API key and base URL are provided.",
          openAiBaseUrl: args.openAiApiKey ? args.openAiBaseUrl : null,
          openAiCredentialId: openAiSeedResult?.credentialId ?? null,
          openAiImageModel: openAiModelKey,
          openAiRouteKey: args.openAiApiKey ? OPENAI_IMAGE_ROUTE_KEY : null,
          providerId: seededProvider.providerId,
          providerKey: PROVIDER_KEY,
          routeKeys: args.openAiApiKey
            ? [IMAGE_ROUTE_KEY, IMAGE_FAIL_ROUTE_KEY, VIDEO_ROUTE_KEY, OPENAI_IMAGE_ROUTE_KEY]
            : [IMAGE_ROUTE_KEY, IMAGE_FAIL_ROUTE_KEY, VIDEO_ROUTE_KEY],
          secretFingerprintPrefix: secretFingerprint,
          tenantId: target.tenantId,
          userId: target.userId,
        },
        null,
        2,
      ),
    );
  } finally {
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
