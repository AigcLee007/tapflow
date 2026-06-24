import type { AgentCostEstimator } from "./agent-cost-estimator.js";
import type { AiModelCatalogService, ModelCatalogItemView, ModelCatalogRouteView } from "../ai-model-catalog/ai-model-catalog.service.js";

type TenantContext = {
  tenantId: string;
  userId: string | null;
};

export type AgentImageRunSettingsEstimate = {
  estimatedCredits: number;
  routeKey: string;
  size: "1K" | "2K" | "4K";
};

export type AgentImageRunSettingsResponse = {
  models: AgentImageRunSettingsModel[];
};

export type AgentImageRunSettingsModel = {
  aspectRatios: string[];
  defaultRouteKey: string | null;
  displayName: string;
  modelFamily: string;
  modelKey: string;
  qualityOptions: string[];
  quantityOptions: number[];
  routes: AgentImageRunSettingsRoute[];
  sizes: Array<"1K" | "2K" | "4K">;
};

export type AgentImageRunSettingsRoute = {
  estimatedCredits: number;
  routeKey: string;
  routeLabel: string;
  sizes: Array<{
    credits: number;
    size: "1K" | "2K" | "4K";
  }>;
};

const IMAGE_SIZES: Array<"1K" | "2K" | "4K"> = ["1K", "2K", "4K"];
const DEFAULT_ASPECT_RATIOS = ["1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16"];

export class AgentRunSettingsService {
  constructor(private readonly options: {
    catalogService: Pick<AiModelCatalogService, "listModels" | "listRoutesForModel">;
    costEstimator: Pick<AgentCostEstimator, "estimateGenerateImage">;
  }) {}

  async listImageRunSettings(context: TenantContext): Promise<AgentImageRunSettingsResponse> {
    const models = await this.options.catalogService.listModels(context, {
      environment: "production",
      modality: "image",
    });

    const imageModels = await Promise.all(
      models.map(async (model) => this.buildImageModel(context, model)),
    );

    return {
      models: imageModels.filter((model): model is AgentImageRunSettingsModel => model !== null),
    };
  }

  async estimateImageRunSettings(
    context: TenantContext,
    input: {
      routeKey: string;
      size: "1K" | "2K" | "4K";
    },
  ): Promise<AgentImageRunSettingsEstimate> {
    const estimate = await this.options.costEstimator.estimateGenerateImage({
      prompt: "Agent run settings estimate",
      routeKey: input.routeKey,
      size: input.size,
      tenantId: context.tenantId,
      userId: context.userId,
    });

    return {
      estimatedCredits: estimate.totalCredits,
      routeKey: input.routeKey,
      size: input.size,
    };
  }

  private async buildImageModel(
    context: TenantContext,
    model: ModelCatalogItemView,
  ): Promise<AgentImageRunSettingsModel | null> {
    const routes = await this.options.catalogService.listRoutesForModel(context, model.modelKey, {
      environment: "production",
    });

    const visibleRoutes = await Promise.all(
      routes.map(async (route) => this.buildImageRoute(context, route)),
    );

    const filteredRoutes = visibleRoutes.filter((route): route is AgentImageRunSettingsRoute => route !== null);
    if (filteredRoutes.length === 0) return null;

    return {
      aspectRatios: DEFAULT_ASPECT_RATIOS,
      defaultRouteKey: model.defaultRouteKey,
      displayName: model.displayName,
      modelFamily: model.modelFamily,
      modelKey: model.modelKey,
      qualityOptions: [],
      quantityOptions: [1],
      routes: filteredRoutes,
      sizes: IMAGE_SIZES,
    };
  }

  private async buildImageRoute(
    context: TenantContext,
    route: ModelCatalogRouteView,
  ): Promise<AgentImageRunSettingsRoute | null> {
    const tiers: AgentImageRunSettingsRoute["sizes"] = [];

    for (const size of IMAGE_SIZES) {
      try {
        const estimate = await this.options.costEstimator.estimateGenerateImage({
          prompt: "Agent run settings estimate",
          routeKey: route.routeKey,
          size,
          tenantId: context.tenantId,
          userId: context.userId,
        });
        tiers.push({
          credits: estimate.totalCredits,
          size,
        });
      } catch {
        return null;
      }
    }

    return {
      estimatedCredits: route.estimatedCredits ?? tiers[0]?.credits ?? 0,
      routeKey: route.routeKey,
      routeLabel: route.routeLabel?.trim() || "线路",
      sizes: tiers,
    };
  }
}
