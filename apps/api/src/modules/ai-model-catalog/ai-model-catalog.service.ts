import type { Pool } from "pg";

import { createPgPool, withTenantTransaction } from "@aigc-flow/db";

import type {
  ModelCatalogBundleQuery,
  ModelCatalogQuery,
  ModelCatalogRoutesQuery,
} from "./ai-model-catalog.schemas.js";

type TenantContext = {
  tenantId: string;
  userId: string | null;
};

const KNOWN_IMAGE_GENERATION_MODES = new Set([
  "standard",
  "panorama_360",
  "wraparound_270",
  "subject_orbit_270",
]);
const KNOWN_VIDEO_WORKFLOWS = new Set([
  "video_editor_export",
  "video_generation",
]);
const KNOWN_VIDEO_GENERATION_MODES = new Set([
  "text_to_video",
  "all_reference",
  "image_to_video",
  "first_last_frame",
  "image_reference",
]);
const KNOWN_VIDEO_ASPECT_RATIOS = new Set([
  "auto",
  "16:9",
  "4:3",
  "1:1",
  "3:4",
  "9:16",
  "21:9",
]);
const KNOWN_VIDEO_RESOLUTIONS = new Set(["480P", "720P", "1080P", "4K"]);
const KNOWN_VIDEO_AUDIO_CONTROL_MODES = new Set(["toggle", "always_on_implicit", "unsupported"]);
const KNOWN_VIDEO_REFERENCE_SEMANTICS = new Set([
  "style_images_and_source_video",
  "mixed_reference_media",
  "ordered_first_last_frames",
]);
const VIDEO_MODE_CONSTRAINT_NUMBER_FIELDS = new Set([
  "maxAudios",
  "maxImages",
  "maxTotal",
  "maxVideos",
  "minAudios",
  "minImages",
  "minVideos",
]);
const VIDEO_MODE_CONSTRAINT_BOOLEAN_FIELDS = new Set([
  "requiresVideoOrAudio",
  "requiresVisualWithAudio",
]);

type ModelCatalogRecord = {
  capabilities: Record<string, unknown>;
  default_route_key: string | null;
  display_name: string;
  id: string;
  modality: string;
  model_family: string;
  model_id: string | null;
  model_key: string;
  sort_order: number;
  status: string;
  ui_schema: Record<string, unknown>;
};

type ModelRouteRecord = {
  model_capabilities: Record<string, unknown>;
  estimated_credits: string | null;
  min_charge_credits: string | null;
  modality: string;
  model_family: string | null;
  model_key: string | null;
  pricing_unit: string | null;
  pricing_metadata: Record<string, unknown> | null;
  pricing_fallback_level: number | null;
  provider_key: string;
  provider_name: string;
  request_config: Record<string, unknown>;
  route_id: string;
  route_key: string;
  route_label: string | null;
};

export type ModelCatalogItemView = {
  capabilities: Record<string, unknown>;
  defaultRouteKey: string | null;
  displayName: string;
  id: string;
  modality: string;
  modelFamily: string;
  modelId: string | null;
  modelKey: string;
  sortOrder: number;
  status: string;
  uiSchema: Record<string, unknown>;
};

export type ModelCatalogBundleView = {
  models: ModelCatalogItemView[];
  routesByModelKey: Record<string, ModelCatalogRouteView[]>;
};

export type ModelCatalogRouteView = {
  capabilities: {
    aspectRatios?: string[];
    confirmedByRoute?: boolean;
    description?: string;
    durationStepSeconds?: number;
    estimatedDurationLabel?: string;
    maxCount?: number;
    maxAudios?: number;
    maxDurationSeconds?: number;
    maxImages?: number;
    maxPromptLength?: number | null;
    maxTotal?: number;
    maxVideos?: number;
    minDurationSeconds?: number;
    modeConstraints?: Record<string, Record<string, number | boolean>>;
    audioControlMode?: "toggle" | "always_on_implicit" | "unsupported";
    defaults?: Record<string, unknown>;
    referenceSemantics?: "style_images_and_source_video" | "mixed_reference_media" | "ordered_first_last_frames";
    resolutions?: string[];
    supportedDurations?: number[];
    supportedGenerationModes: string[];
    supportedModes?: string[];
    supportedVideoWorkflows: string[];
    supportsAudio?: boolean;
    supportsHumanReview?: boolean;
    supportsImageInput?: boolean;
    supportedImageMimeTypes?: string[];
  };
  estimatedCredits: number | null;
  minChargeCredits: number | null;
  modality: string;
  modelFamily: string | null;
  modelKey: string | null;
  pricingUnit: string | null;
  pricing: { billingBasis: "duration_second" | null; exact: boolean; minChargeCredits: number; unit: string; unitCredits: number } | null;
  providerKey: string;
  providerName: string;
  routeId: string;
  routeKey: string;
  routeLabel: string | null;
};

export class AiModelCatalogApiError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "AiModelCatalogApiError";
    this.statusCode = statusCode;
  }
}

export class AiModelCatalogService {
  readonly pool: Pool;

  constructor(options?: { pool?: Pool }) {
    this.pool = options?.pool ?? createPgPool();
  }

  async listBundle(
    context: TenantContext,
    query: ModelCatalogBundleQuery,
  ): Promise<ModelCatalogBundleView> {
    return withTenantTransaction(context, async (client) => {
      const modelsResult = await client.query<ModelCatalogRecord>(
        `
          SELECT DISTINCT ON (catalog.model_family)
            catalog.id::text AS id,
            catalog.model_id::text AS model_id,
            catalog.model_key,
            catalog.display_name,
            catalog.modality,
            catalog.model_family,
            catalog.default_route_key,
            catalog.ui_schema,
            catalog.capabilities,
            catalog.sort_order,
            catalog.status
          FROM ai_model_catalog AS catalog
          LEFT JOIN tenant_ai_plugin_installs AS install ON install.id = catalog.plugin_install_id
          WHERE (catalog.tenant_id = $1::uuid OR catalog.tenant_id IS NULL)
            AND catalog.status = 'active'
            AND catalog.modality = $2::text
            AND (catalog.plugin_install_id IS NULL OR install.status = 'published')
            AND EXISTS (
              SELECT 1 FROM ai_routes AS available_route
              JOIN ai_providers AS available_provider ON available_provider.id = available_route.provider_id
              LEFT JOIN ai_models AS available_model ON available_model.id = available_route.model_id
              LEFT JOIN tenant_ai_plugin_installs AS available_install ON available_install.id = available_route.plugin_install_id
              WHERE (available_route.tenant_id = catalog.tenant_id OR available_route.tenant_id IS NULL)
                AND available_route.status = 'active'
                AND available_route.modality = catalog.modality
                AND available_route.model_family = catalog.model_family
                AND available_route.environment = $3::text
                AND available_provider.status = 'active'
                AND (available_route.model_id IS NULL OR available_model.status = 'active')
                AND (available_route.plugin_install_id IS NULL OR available_install.status = 'published')
            )
          ORDER BY catalog.model_family ASC,
            CASE WHEN catalog.tenant_id = $1::uuid THEN 0 ELSE 1 END ASC,
            catalog.sort_order ASC, catalog.display_name ASC, catalog.model_key ASC
        `,
        [context.tenantId, query.modality, query.environment],
      );
      const routesResult = await client.query<ModelRouteRecord>(
        `
          SELECT DISTINCT ON (route.route_key)
            route.id::text AS route_id,
            route.route_key,
            route.route_label,
            route.modality,
            route.model_family,
            provider.key AS provider_key,
            provider.name AS provider_name,
            model.model_key,
            COALESCE(model.capabilities, '{}'::jsonb) AS model_capabilities,
            COALESCE(route.request_config, '{}'::jsonb) AS request_config,
            pricing.min_charge_credits::text AS min_charge_credits,
            pricing.unit_credits::text AS estimated_credits,
            pricing.unit AS pricing_unit,
            pricing.metadata AS pricing_metadata,
            pricing.pricing_fallback_level
          FROM ai_routes AS route
          JOIN ai_providers AS provider ON provider.id = route.provider_id
          LEFT JOIN ai_models AS model ON model.id = route.model_id
          LEFT JOIN tenant_ai_plugin_installs AS route_install ON route_install.id = route.plugin_install_id
          LEFT JOIN LATERAL (
            SELECT mp.min_charge_credits, mp.unit_credits, mp.unit, mp.metadata,
              CASE
                WHEN mp.provider = provider.key AND mp.model = COALESCE(model.model_key, route.model_family) AND mp.route = route.route_key THEN 1
                WHEN mp.provider = provider.key AND mp.model = COALESCE(model.model_key, route.model_family) AND mp.route = 'default' THEN 2
                WHEN mp.provider = provider.key AND mp.model = 'default' AND mp.route = 'default' THEN 3
                ELSE 4
              END AS pricing_fallback_level
            FROM model_pricing AS mp
            WHERE mp.active = true
              AND mp.unit = CASE route.modality WHEN 'image' THEN 'image_generation' WHEN 'video' THEN 'video_generation' WHEN 'text' THEN 'text_generation' ELSE route.modality || '_generation' END
              AND ((mp.provider = provider.key AND mp.model = COALESCE(model.model_key, route.model_family) AND mp.route = route.route_key)
                OR (mp.provider = provider.key AND mp.model = COALESCE(model.model_key, route.model_family) AND mp.route = 'default')
                OR (mp.provider = provider.key AND mp.model = 'default' AND mp.route = 'default')
                OR (mp.provider = 'default' AND mp.model = 'default' AND mp.route = 'default'))
            ORDER BY pricing_fallback_level ASC
            LIMIT 1
          ) AS pricing ON true
          WHERE (route.tenant_id = $1::uuid OR route.tenant_id IS NULL)
            AND route.status = 'active'
            AND route.modality = $2::text
            AND route.environment = $3::text
            AND provider.status = 'active'
            AND (route.model_id IS NULL OR model.status = 'active')
            AND (route.plugin_install_id IS NULL OR route_install.status = 'published')
          ORDER BY route.route_key ASC,
            CASE WHEN route.tenant_id = $1::uuid THEN 0 ELSE 1 END ASC,
            route.priority ASC, route.weight DESC, route.updated_at DESC, route.id ASC
        `,
        [context.tenantId, query.modality, query.environment],
      );
      const models = modelsResult.rows.map(mapModelCatalogItem);
      const routesByModelKey: Record<string, ModelCatalogRouteView[]> = {};
      for (const row of routesResult.rows) {
        const route = mapModelCatalogRoute(row);
        const key = route.modelKey || route.modelFamily;
        if (key) (routesByModelKey[key] ??= []).push(route);
      }
      return { models, routesByModelKey };
    }, this.pool);
  }

  async listModels(
    context: TenantContext,
    query: ModelCatalogQuery,
  ): Promise<ModelCatalogItemView[]> {
    return withTenantTransaction(context, async (client) => {
      const result = await client.query<ModelCatalogRecord>(
        `
          SELECT DISTINCT ON (catalog.model_family)
            catalog.id::text AS id,
            catalog.model_id::text AS model_id,
            catalog.model_key,
            catalog.display_name,
            catalog.modality,
            catalog.model_family,
            catalog.default_route_key,
            catalog.ui_schema,
            catalog.capabilities,
            catalog.sort_order,
            catalog.status
          FROM ai_model_catalog AS catalog
          LEFT JOIN tenant_ai_plugin_installs AS install
            ON install.id = catalog.plugin_install_id
          WHERE (catalog.tenant_id = $1::uuid OR catalog.tenant_id IS NULL)
            AND catalog.status = 'active'
            AND ($2::text IS NULL OR catalog.modality = $2::text)
            AND (
              catalog.plugin_install_id IS NULL
              OR install.status = 'published'
            )
            AND EXISTS (
              SELECT 1
              FROM ai_routes AS route
              JOIN ai_providers AS provider
                ON provider.id = route.provider_id
              LEFT JOIN ai_models AS model
                ON model.id = route.model_id
              WHERE (route.tenant_id = catalog.tenant_id OR route.tenant_id IS NULL)
                AND route.status = 'active'
                AND route.modality = catalog.modality
                AND route.model_family = catalog.model_family
                AND route.environment = $3::text
                AND provider.status = 'active'
                AND (route.model_id IS NULL OR model.status = 'active')
            )
          ORDER BY
            catalog.model_family ASC,
            CASE WHEN catalog.tenant_id IS NULL THEN 0 ELSE 1 END ASC,
            catalog.sort_order ASC,
            catalog.display_name ASC,
            catalog.model_key ASC
        `,
        [context.tenantId, query.modality ?? null, query.environment?.trim() || "production"],
      );

      return result.rows.map(mapModelCatalogItem);
    }, this.pool);
  }

  async listRoutesForModel(
    context: TenantContext,
    modelKey: string,
    query: ModelCatalogRoutesQuery,
  ): Promise<ModelCatalogRouteView[]> {
    return withTenantTransaction(context, async (client) => {
      const catalog = await client.query<{
        id: string;
        modality: string;
        model_family: string;
        model_id: string | null;
        model_key: string;
      }>(
        `
          SELECT
            catalog.id::text AS id,
            catalog.model_id::text AS model_id,
            catalog.model_key,
            catalog.modality,
            catalog.model_family
          FROM ai_model_catalog AS catalog
          LEFT JOIN tenant_ai_plugin_installs AS install
            ON install.id = catalog.plugin_install_id
          WHERE (catalog.tenant_id = $1::uuid OR catalog.tenant_id IS NULL)
            AND (
              catalog.model_key = $2::text
              OR catalog.model_family = $2::text
            )
            AND catalog.status = 'active'
            AND (
              catalog.plugin_install_id IS NULL
              OR install.status = 'published'
            )
          ORDER BY CASE WHEN catalog.tenant_id = $1::uuid THEN 0 ELSE 1 END ASC
          LIMIT 1
        `,
        [context.tenantId, modelKey.trim()],
      );

      const selectedModel = catalog.rows[0];
      if (!selectedModel) {
        throw new AiModelCatalogApiError(404, "MODEL_NOT_FOUND", "Model catalog entry not found");
      }

      const result = await client.query<ModelRouteRecord>(
        `
          SELECT DISTINCT ON (route.route_key)
            route.id::text AS route_id,
            route.route_key,
            route.route_label,
            route.modality,
            route.model_family,
            provider.key AS provider_key,
            provider.name AS provider_name,
            model.model_key,
            COALESCE(model.capabilities, '{}'::jsonb) AS model_capabilities,
            COALESCE(route.request_config, '{}'::jsonb) AS request_config,
            pricing.min_charge_credits::text AS min_charge_credits,
            pricing.unit_credits::text AS estimated_credits,
            pricing.unit AS pricing_unit,
            pricing.metadata AS pricing_metadata,
            pricing.pricing_fallback_level
          FROM ai_routes AS route
          JOIN ai_providers AS provider
            ON provider.id = route.provider_id
          LEFT JOIN ai_models AS model
            ON model.id = route.model_id
          LEFT JOIN LATERAL (
            SELECT mp.min_charge_credits, mp.unit_credits, mp.unit, mp.metadata,
              CASE
                WHEN mp.provider = provider.key AND mp.model = COALESCE(model.model_key, $2::text) AND mp.route = route.route_key THEN 1
                WHEN mp.provider = provider.key AND mp.model = COALESCE(model.model_key, $2::text) AND mp.route = 'default' THEN 2
                WHEN mp.provider = provider.key AND mp.model = 'default' AND mp.route = 'default' THEN 3
                ELSE 4
              END AS pricing_fallback_level
            FROM model_pricing AS mp
            WHERE mp.active = true
              AND mp.unit = CASE route.modality
                WHEN 'image' THEN 'image_generation'
                WHEN 'video' THEN 'video_generation'
                WHEN 'text' THEN 'text_generation'
                ELSE route.modality || '_generation'
              END
              AND (
                (mp.provider = provider.key AND mp.model = COALESCE(model.model_key, $2::text) AND mp.route = route.route_key)
                OR (mp.provider = provider.key AND mp.model = COALESCE(model.model_key, $2::text) AND mp.route = 'default')
                OR (mp.provider = provider.key AND mp.model = 'default' AND mp.route = 'default')
                OR (mp.provider = 'default' AND mp.model = 'default' AND mp.route = 'default')
              )
            ORDER BY
              CASE
                WHEN mp.provider = provider.key AND mp.model = COALESCE(model.model_key, $2::text) AND mp.route = route.route_key THEN 1
                WHEN mp.provider = provider.key AND mp.model = COALESCE(model.model_key, $2::text) AND mp.route = 'default' THEN 2
                WHEN mp.provider = provider.key AND mp.model = 'default' AND mp.route = 'default' THEN 3
                ELSE 4
              END ASC
            LIMIT 1
          ) AS pricing ON true
          WHERE (route.tenant_id = $1::uuid OR route.tenant_id IS NULL)
            AND route.status = 'active'
            AND route.modality = $3::text
            AND route.model_family = $4::text
            AND route.environment = $5::text
            AND provider.status = 'active'
            AND (route.model_id IS NULL OR model.status = 'active')
            AND (
              route.model_id IS NULL
              OR route.model_id = $6::uuid
              OR model.model_key = $2::text
            )
          ORDER BY
            route.route_key ASC,
            CASE WHEN route.tenant_id = $1::uuid THEN 0 ELSE 1 END ASC,
            route.priority ASC,
            route.weight DESC,
            route.updated_at DESC,
            route.id ASC
        `,
        [
          context.tenantId,
          selectedModel.model_key,
          selectedModel.modality,
          selectedModel.model_family,
          query.environment?.trim() || "production",
          selectedModel.model_id,
        ],
      );

      return result.rows.map(mapModelCatalogRoute);
    }, this.pool);
  }
}

function mapModelCatalogItem(row: ModelCatalogRecord): ModelCatalogItemView {
  return {
    capabilities: projectModelCatalogCapabilities(row.capabilities),
    defaultRouteKey: row.default_route_key,
    displayName: row.display_name,
    id: row.id,
    modality: row.modality,
    modelFamily: row.model_family,
    modelId: row.model_id,
    modelKey: row.model_key,
    sortOrder: row.sort_order,
    status: row.status,
    uiSchema: row.ui_schema ?? {},
  };
}

function projectModelCatalogCapabilities(source: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const supportedGenerationModes = readSupportedGenerationModes(source);
  const supportedVideoWorkflows = readSupportedVideoWorkflows(source);

  return {
    ...projectSafeImageCatalogCapabilities(source),
    ...projectSafeTextImageCatalogCapabilities(source),
    ...(supportedGenerationModes.length ? { supportedGenerationModes } : {}),
    ...(supportedVideoWorkflows.length ? { supportedVideoWorkflows } : {}),
    ...mergeSafeVideoCapabilities(source),
  };
}

function projectSafeTextImageCatalogCapabilities(source: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (readBoolean(source, "supportsImageInput") !== true) return {};
  const maxImages = readPositiveInteger(source, "maxImages");
  const supportedImageMimeTypes = readSupportedImageMimeTypes(source);
  if (!maxImages || !supportedImageMimeTypes.length) return {};
  return { maxImages: Math.min(3, maxImages), supportedImageMimeTypes, supportsImageInput: true };
}

function mapModelCatalogRoute(row: ModelRouteRecord): ModelCatalogRouteView {
  return {
    capabilities: mergeModelRouteCapabilities({
      modelCapabilities: row.model_capabilities,
      requestConfig: row.request_config,
    }),
    estimatedCredits: row.estimated_credits === null ? null : Number(row.estimated_credits),
    minChargeCredits: row.min_charge_credits === null ? null : Number(row.min_charge_credits),
    modality: row.modality,
    modelFamily: row.model_family,
    modelKey: row.model_key,
    pricingUnit: row.pricing_unit,
    pricing: projectPricing(row),
    providerKey: row.provider_key,
    providerName: row.provider_name,
    routeId: row.route_id,
    routeKey: row.route_key,
    routeLabel: row.route_label,
  };
}

function projectPricing(row: ModelRouteRecord): ModelCatalogRouteView["pricing"] {
  const unitCredits = row.estimated_credits === null ? null : Number(row.estimated_credits);
  const minChargeCredits = row.min_charge_credits === null ? null : Number(row.min_charge_credits);
  if (!row.pricing_unit || !Number.isFinite(unitCredits) || !Number.isFinite(minChargeCredits)) return null;
  const billingBasis = row.pricing_metadata?.billingBasis === "duration_second" ? "duration_second" : null;
  return { billingBasis, exact: row.pricing_fallback_level === 1, minChargeCredits: minChargeCredits!, unit: row.pricing_unit, unitCredits: unitCredits! };
}

function readSupportedGenerationModes(source: unknown): string[] {
  const direct = source && typeof source === "object"
    ? (source as { supportedGenerationModes?: unknown }).supportedGenerationModes
    : undefined;
  return (Array.isArray(direct) ? direct : [])
    .map((item) => String(item || "").trim())
    .filter((item) => KNOWN_IMAGE_GENERATION_MODES.has(item))
    .filter(Boolean);
}

function readSupportedVideoWorkflows(source: unknown): string[] {
  const direct = source && typeof source === "object"
    ? (source as { supportedVideoWorkflows?: unknown }).supportedVideoWorkflows
    : undefined;
  return (Array.isArray(direct) ? direct : [])
    .map((item) => String(item || "").trim())
    .filter((item) => KNOWN_VIDEO_WORKFLOWS.has(item))
    .filter(Boolean);
}

function readKnownStrings(source: unknown, key: string, known: ReadonlySet<string>): string[] {
  const value = source && typeof source === "object"
    ? (source as Record<string, unknown>)[key]
    : undefined;
  return (Array.isArray(value) ? value : [])
    .map((item) => String(item || "").trim())
    .filter((item) => known.has(item));
}

function readPositiveNumber(source: unknown, key: string): number | undefined {
  const value = source && typeof source === "object"
    ? Number((source as Record<string, unknown>)[key])
    : Number.NaN;
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function readPositiveInteger(source: unknown, key: string): number | undefined {
  const value = readPositiveNumber(source, key);
  return value !== undefined && Number.isInteger(value) ? value : undefined;
}

function readBoolean(source: unknown, key: string): boolean | undefined {
  const value = source && typeof source === "object"
    ? (source as Record<string, unknown>)[key]
    : undefined;
  return typeof value === "boolean" ? value : undefined;
}

function readNonEmptyString(source: unknown, key: string): string | undefined {
  const value = source && typeof source === "object"
    ? (source as Record<string, unknown>)[key]
    : undefined;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readStringArray(source: unknown, key: string): string[] {
  const value = source && typeof source === "object"
    ? (source as Record<string, unknown>)[key]
    : undefined;
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)));
}

function projectSafeImageCatalogCapabilities(source: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of ["supportedAspectRatios", "supportedSizes"] as const) {
    const values = readStringArray(source, key);
    if (values.length) result[key] = values;
  }
  for (const key of ["maxInputImages", "maxPromptLength"] as const) {
    const value = readPositiveNumber(source, key);
    if (value !== undefined) result[key] = value;
  }
  for (const key of ["supportsImageEdit", "supportsReferenceImages", "supportsStreaming"] as const) {
    const value = readBoolean(source, key);
    if (value !== undefined) result[key] = value;
  }
  return result;
}

function mergeModelRouteCapabilities(input: {
  modelCapabilities?: Record<string, unknown> | null;
  requestConfig?: Record<string, unknown> | null;
}): ModelCatalogRouteView["capabilities"] {
  const routeCapabilities = input.requestConfig?.capabilities && typeof input.requestConfig.capabilities === "object"
    ? input.requestConfig.capabilities as Record<string, unknown>
    : {};
  const supportedGenerationModes = Array.from(new Set([
    ...readSupportedGenerationModes(input.modelCapabilities),
    ...readSupportedGenerationModes(routeCapabilities),
  ]));
  const supportedVideoWorkflows = Array.from(new Set([
    ...readSupportedVideoWorkflows(input.modelCapabilities),
    ...readSupportedVideoWorkflows(routeCapabilities),
  ]));
  const videoCapabilities = mergeSafeVideoCapabilities(input.modelCapabilities, routeCapabilities);
  const textImageCapabilities = mergeSafeTextImageCapabilities(input.modelCapabilities, routeCapabilities);

  return {
    supportedGenerationModes: supportedGenerationModes.length > 0 ? supportedGenerationModes : ["standard"],
    supportedVideoWorkflows,
    ...videoCapabilities,
    ...textImageCapabilities,
  };
}

function mergeSafeTextImageCapabilities(
  modelCapabilities?: Record<string, unknown> | null,
  routeCapabilities?: Record<string, unknown> | null,
): Pick<ModelCatalogRouteView["capabilities"], "maxImages" | "supportedImageMimeTypes" | "supportsImageInput"> {
  if (readBoolean(modelCapabilities, "supportsImageInput") !== true || readBoolean(routeCapabilities, "supportsImageInput") !== true) {
    return {};
  }
  const modelMax = readPositiveInteger(modelCapabilities, "maxImages");
  const routeMax = readPositiveInteger(routeCapabilities, "maxImages");
  const modelMimeTypes = readSupportedImageMimeTypes(modelCapabilities);
  const routeMimeTypes = readSupportedImageMimeTypes(routeCapabilities);
  if (!modelMax || !routeMax || !modelMimeTypes.length || !routeMimeTypes.length) return {};

  const supportedImageMimeTypes = modelMimeTypes.filter((mimeType) => routeMimeTypes.includes(mimeType));
  if (!supportedImageMimeTypes.length) return {};
  return {
    maxImages: Math.min(3, modelMax, routeMax),
    supportedImageMimeTypes,
    supportsImageInput: true,
  };
}

function readSupportedImageMimeTypes(source: unknown): string[] {
  return readStringArray(source, "supportedImageMimeTypes")
    .map((mimeType) => mimeType.toLowerCase())
    .filter((mimeType) => /^image\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i.test(mimeType));
}

function mergeSafeVideoCapabilities(...sources: Array<Record<string, unknown> | null | undefined>) {
  const supportedModes = mergeKnownStringCapability(sources, "supportedModes", KNOWN_VIDEO_GENERATION_MODES);
  const aspectRatios = mergeKnownStringCapability(sources, "aspectRatios", KNOWN_VIDEO_ASPECT_RATIOS);
  const resolutions = mergeKnownStringCapability(sources, "resolutions", KNOWN_VIDEO_RESOLUTIONS);
  const supportedDurations = mergePositiveIntegerCapability(sources, "supportedDurations");
  const result: Omit<ModelCatalogRouteView["capabilities"], "supportedGenerationModes" | "supportedVideoWorkflows"> = {};
  const confirmedByRoute = [...sources].reverse().some((source) => source?.confirmedByRoute === true);
  if (confirmedByRoute) result.confirmedByRoute = true;
  if (supportedModes.length) result.supportedModes = supportedModes;
  if (aspectRatios.length) result.aspectRatios = aspectRatios;
  if (resolutions.length) result.resolutions = resolutions;
  if (supportedDurations.length) result.supportedDurations = supportedDurations;
  for (const key of ["minDurationSeconds", "maxDurationSeconds", "durationStepSeconds", "maxCount"] as const) {
    const value = [...sources].reverse().map((source) => readPositiveNumber(source, key)).find((candidate) => candidate !== undefined);
    if (value !== undefined) result[key] = value;
  }
  for (const key of ["maxImages", "maxVideos", "maxAudios", "maxTotal"] as const) {
    const value = [...sources].reverse().map((source) => readPositiveNumber(source, key)).find((candidate) => candidate !== undefined);
    if (value !== undefined) result[key] = value;
  }
  const maxPromptLength = [...sources].reverse().map((source) => {
    const value = source?.maxPromptLength;
    return value === null || (typeof value === "number" && Number.isFinite(value) && value > 0) ? value : undefined;
  }).find((candidate) => candidate !== undefined);
  if (maxPromptLength !== undefined) result.maxPromptLength = maxPromptLength;
  const audioControlMode = [...sources].reverse().map((source) => source?.audioControlMode).find((value): value is "toggle" | "always_on_implicit" | "unsupported" => typeof value === "string" && KNOWN_VIDEO_AUDIO_CONTROL_MODES.has(value));
  if (audioControlMode) result.audioControlMode = audioControlMode;
  const referenceSemantics = [...sources].reverse().map((source) => source?.referenceSemantics).find((value): value is "style_images_and_source_video" | "mixed_reference_media" | "ordered_first_last_frames" => typeof value === "string" && KNOWN_VIDEO_REFERENCE_SEMANTICS.has(value));
  if (referenceSemantics) result.referenceSemantics = referenceSemantics;
  const defaults = [...sources].reverse().map((source) => readSafeVideoDefaults(source?.defaults)).find((value) => value !== undefined);
  if (defaults) result.defaults = defaults;
  const modeConstraints = [...sources].reverse().map((source) => readSafeVideoModeConstraints(source?.modeConstraints)).find((value) => value !== undefined);
  if (modeConstraints) result.modeConstraints = modeConstraints;
  for (const key of ["supportsAudio", "supportsHumanReview"] as const) {
    const value = [...sources].reverse().map((source) => readBoolean(source, key)).find((candidate) => candidate !== undefined);
    if (value !== undefined) result[key] = value;
  }
  for (const key of ["description", "estimatedDurationLabel"] as const) {
    const value = [...sources].reverse().map((source) => readNonEmptyString(source, key)).find((candidate) => candidate !== undefined);
    if (value !== undefined) result[key] = value;
  }
  return result;
}

function readSafeVideoDefaults(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  if (typeof source.mode === "string" && KNOWN_VIDEO_GENERATION_MODES.has(source.mode)) result.mode = source.mode;
  if (typeof source.aspectRatio === "string" && KNOWN_VIDEO_ASPECT_RATIOS.has(source.aspectRatio)) result.aspectRatio = source.aspectRatio;
  if (typeof source.resolution === "string" && KNOWN_VIDEO_RESOLUTIONS.has(source.resolution)) result.resolution = source.resolution;
  if (typeof source.durationSeconds === "number" && Number.isFinite(source.durationSeconds) && source.durationSeconds > 0) result.durationSeconds = source.durationSeconds;
  if (source.count === 1) result.count = 1;
  if (typeof source.generateAudio === "boolean") result.generateAudio = source.generateAudio;
  return Object.keys(result).length ? result : undefined;
}

function readSafeVideoModeConstraints(value: unknown): Record<string, Record<string, number | boolean>> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const result: Record<string, Record<string, number | boolean>> = {};
  for (const [mode, candidate] of Object.entries(value as Record<string, unknown>)) {
    if (!KNOWN_VIDEO_GENERATION_MODES.has(mode) || !candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const constraint: Record<string, number | boolean> = {};
    for (const [key, item] of Object.entries(candidate as Record<string, unknown>)) {
      if (VIDEO_MODE_CONSTRAINT_NUMBER_FIELDS.has(key) && typeof item === "number" && Number.isFinite(item) && item >= 0 && Number.isInteger(item)) constraint[key] = item;
      if (VIDEO_MODE_CONSTRAINT_BOOLEAN_FIELDS.has(key) && typeof item === "boolean") constraint[key] = item;
    }
    if (Object.keys(constraint).length) result[mode] = constraint;
  }
  return Object.keys(result).length ? result : undefined;
}

function mergeKnownStringCapability(
  sources: Array<Record<string, unknown> | null | undefined>,
  key: string,
  known: ReadonlySet<string>,
): string[] {
  return Array.from(new Set(sources.flatMap((source) => readKnownStrings(source, key, known))));
}

function mergePositiveIntegerCapability(
  sources: Array<Record<string, unknown> | null | undefined>,
  key: string,
): number[] {
  return Array.from(new Set(sources.flatMap((source) => {
    const values = source?.[key];
    return Array.isArray(values)
      ? values.filter((value): value is number => typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value > 0)
      : [];
  })));
}
