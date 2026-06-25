import type { Pool } from "pg";

import { createPgPool, withTenantTransaction } from "@aigc-flow/db";

import type {
  GenerateImageBatchToolArgs,
  GenerateImageToolArgs,
} from "./agent-tool-schemas.js";

type TenantContext = {
  tenantId: string;
  userId?: string | null;
};

export type AgentImageRoutePricing = {
  modelDisplayName: string | null;
  modelKey: string | null;
  pricingMetadata: Record<string, unknown>;
  providerKey: string;
  routeKey: string;
  routeLabel: string | null;
  status: string;
  unit: string;
  unitCredits: number;
};

export type AgentCostEstimateItem = {
  credits: number;
  label: string;
  quantity: number;
};

export type AgentGenerationCostEstimate = {
  items: AgentCostEstimateItem[];
  route: Pick<AgentImageRoutePricing, "modelKey" | "providerKey" | "routeKey">;
  totalCredits: number;
  unit: string;
};

type RoutePricingQuery = {
  modelDisplayName?: string | null;
  routeKey?: string | null;
  routeLabel?: string | null;
  tenantId: string;
};

type AgentCostEstimatorRepository = {
  findImageRoutePricing(input: RoutePricingQuery): Promise<AgentImageRoutePricing | null>;
};

export class AgentCostEstimatorError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "AgentCostEstimatorError";
    this.statusCode = statusCode;
  }
}

export class DatabaseAgentCostEstimatorRepository implements AgentCostEstimatorRepository {
  readonly pool: Pool;

  constructor(options?: { pool?: Pool }) {
    this.pool = options?.pool ?? createPgPool();
  }

  async findImageRoutePricing(input: RoutePricingQuery): Promise<AgentImageRoutePricing | null> {
    return withTenantTransaction({ tenantId: input.tenantId, userId: null }, async (client) => {
      const result = await client.query<{
        display_name: string | null;
        metadata: Record<string, unknown> | null;
        model_key: string | null;
        provider_key: string;
        route_key: string;
        route_label: string | null;
        status: string;
        unit: string | null;
        unit_credits: string | null;
      }>(
        `
          SELECT DISTINCT ON (route.route_key)
            catalog.display_name,
            route.route_key,
            route.route_label,
            route.status,
            provider.key AS provider_key,
            model.model_key,
            pricing.unit,
            pricing.unit_credits::text AS unit_credits,
            pricing.metadata
          FROM ai_routes AS route
          JOIN ai_providers AS provider
            ON provider.id = route.provider_id
          LEFT JOIN ai_models AS model
            ON model.id = route.model_id
          LEFT JOIN ai_model_catalog AS catalog
            ON (catalog.tenant_id = route.tenant_id OR catalog.tenant_id IS NULL)
           AND catalog.model_family = route.model_family
           AND catalog.modality = route.modality
          LEFT JOIN LATERAL (
            SELECT mp.unit, mp.unit_credits, mp.metadata
            FROM model_pricing AS mp
            WHERE mp.active = true
              AND mp.unit = 'image_generation'
              AND (
                (mp.provider = provider.key AND mp.model = COALESCE(model.model_key, 'default') AND mp.route = route.route_key)
                OR (mp.provider = provider.key AND mp.model = COALESCE(model.model_key, 'default') AND mp.route = 'default')
                OR (mp.provider = provider.key AND mp.model = 'default' AND mp.route = 'default')
                OR (mp.provider = 'default' AND mp.model = 'default' AND mp.route = 'default')
              )
            ORDER BY
              CASE
                WHEN mp.provider = provider.key AND mp.model = COALESCE(model.model_key, 'default') AND mp.route = route.route_key THEN 1
                WHEN mp.provider = provider.key AND mp.model = COALESCE(model.model_key, 'default') AND mp.route = 'default' THEN 2
                WHEN mp.provider = provider.key AND mp.model = 'default' AND mp.route = 'default' THEN 3
                ELSE 4
              END ASC
            LIMIT 1
          ) AS pricing ON true
          WHERE (route.tenant_id = $1::uuid OR route.tenant_id IS NULL)
            AND route.modality = 'image'
            AND ($2::text IS NULL OR route.route_key = $2::text)
            AND ($3::text IS NULL OR route.route_label = $3::text)
            AND ($4::text IS NULL OR catalog.display_name = $4::text)
          ORDER BY
            route.route_key ASC,
            CASE WHEN route.tenant_id = $1::uuid THEN 0 ELSE 1 END ASC,
            route.priority ASC,
            route.updated_at DESC
          LIMIT 1
        `,
        [
          input.tenantId,
          input.routeKey?.trim() || null,
          input.routeLabel?.trim() || null,
          input.modelDisplayName?.trim() || null,
        ],
      );

      const row = result.rows[0];
      if (!row) return null;
      if (row.unit_credits === null || row.unit === null) {
        return null;
      }

      return {
        modelDisplayName: row.display_name,
        modelKey: row.model_key,
        pricingMetadata: row.metadata ?? {},
        providerKey: row.provider_key,
        routeKey: row.route_key,
        routeLabel: row.route_label,
        status: row.status,
        unit: row.unit,
        unitCredits: Number(row.unit_credits),
      };
    }, this.pool);
  }
}

export class AgentCostEstimator {
  constructor(private readonly repository: AgentCostEstimatorRepository) {}

  async estimateGenerateImage(input: TenantContext & GenerateImageToolArgs & { routeKey?: string }): Promise<AgentGenerationCostEstimate> {
    const route = await this.requireActivePricing({
      modelDisplayName: input.modelDisplayName,
      routeKey: input.routeKey,
      routeLabel: input.routeLabel,
      tenantId: input.tenantId,
    });
    const credits = getCreditsForSize(route, input.size);
    const quantity = readPositiveQuantity(input.n);
    return {
      items: [buildEstimateItem(route, input.size, credits, quantity)],
      route: {
        modelKey: route.modelKey,
        providerKey: route.providerKey,
        routeKey: route.routeKey,
      },
      totalCredits: roundCredits(credits * quantity),
      unit: route.unit,
    };
  }

  async estimateGenerateImageBatch(input: TenantContext & GenerateImageBatchToolArgs & {
    modelDisplayName?: string;
    routeKey?: string;
    routeLabel?: string;
  }): Promise<AgentGenerationCostEstimate> {
    const estimates = await Promise.all(input.images.map(async (image) => {
      const route = await this.requireActivePricing({
        modelDisplayName: image.modelDisplayName ?? input.modelDisplayName,
        routeKey: image.routeKey ?? input.routeKey,
        routeLabel: image.routeLabel ?? input.routeLabel,
        tenantId: input.tenantId,
      });
      const credits = getCreditsForSize(route, image.size);
      return {
        item: buildEstimateItem(route, image.size, credits, readPositiveQuantity(image.n)),
        route,
      };
    }));
    const items = estimates.map((estimate) => estimate.item);
    const firstRoute = estimates[0]!.route;

    return {
      items,
      route: {
        modelKey: firstRoute.modelKey,
        providerKey: firstRoute.providerKey,
        routeKey: firstRoute.routeKey,
      },
      totalCredits: roundCredits(items.reduce((sum, item) => sum + item.credits * item.quantity, 0)),
      unit: firstRoute.unit,
    };
  }

  private async requireActivePricing(input: RoutePricingQuery): Promise<AgentImageRoutePricing> {
    const route = await this.repository.findImageRoutePricing(input);
    if (!route) {
      throw new AgentCostEstimatorError(400, "PRICING_NOT_FOUND", "The selected Agent generation route does not have pricing configured.");
    }
    if (route.status !== "active") {
      throw new AgentCostEstimatorError(404, "AGENT_ROUTE_NOT_ACTIVE", "The selected Agent generation route is not active.");
    }
    if (!Number.isFinite(route.unitCredits) || route.unitCredits < 0) {
      throw new AgentCostEstimatorError(400, "PRICING_NOT_FOUND", "The selected Agent generation route has invalid pricing.");
    }
    return route;
  }
}

function buildEstimateItem(route: AgentImageRoutePricing, size: string | undefined, credits: number, quantity = 1): AgentCostEstimateItem {
  return {
    credits,
    label: [
      route.modelDisplayName?.trim() || route.modelKey || "Image model",
      route.routeLabel?.trim() || "Line",
      size ?? "default",
    ].join(" "),
    quantity,
  };
}

function getCreditsForSize(route: AgentImageRoutePricing, size: string | undefined): number {
  const sizeTiers = route.pricingMetadata.sizeTiers;
  if (size && isRecord(sizeTiers)) {
    const value = sizeTiers[size];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return route.unitCredits;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readPositiveQuantity(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 1;
}

function roundCredits(value: number): number {
  return Number(value.toFixed(4));
}
