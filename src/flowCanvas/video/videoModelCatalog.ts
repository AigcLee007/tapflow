import type { AiModelCatalogItem, AiModelCatalogRoute } from "../../services/v2AiModelCatalogApi";
import { mergeVideoCapabilities } from "./videoGenerationCapabilities";
import {
  isSafeCreatorLabel,
  sanitizeVideoModelDescription,
  sanitizeVideoModelEstimatedDuration,
} from "./videoPresentationSanitizers";
import type { VideoModelOption } from "./videoTypes";

const isGenerationRoute = (route: AiModelCatalogRoute) =>
  route.modality === "video"
  && route.capabilities?.confirmedByRoute === true
  && Array.isArray(route.capabilities?.supportedVideoWorkflows)
  && route.capabilities.supportedVideoWorkflows.includes("video_generation");

export function resolveDefaultVideoModel(models: VideoModelOption[]): VideoModelOption | null {
  const eligible = (option: VideoModelOption) => option.blocker === null;
  return models.find((option) => option.modelKey === "gemini-omni-flash" && eligible(option))
    ?? models.find(eligible)
    ?? null;
}

export function toVideoModelOptions(
  catalog: AiModelCatalogItem[],
  routesByModelKey: Record<string, AiModelCatalogRoute[]>,
): VideoModelOption[] {
  return [...catalog]
    .filter((model) => model.modality === "video" && model.status === "active")
    .sort((left, right) => left.sortOrder - right.sortOrder || left.displayName.localeCompare(right.displayName))
    .map((model) => ({ model, route: routesByModelKey[model.modelKey]?.find(isGenerationRoute) }))
    .filter((entry): entry is { model: AiModelCatalogItem; route: AiModelCatalogRoute } => Boolean(entry.route))
    .flatMap(({ model, route }) => {
      const label = getCreatorModelLabel(model);
      if (!label) return [];

      const rawCapabilities = constrainKnownVideoModelCapabilities(
        model.modelKey,
        mergeVideoCapabilities(model.capabilities, route.capabilities, { confirmedByRoute: true }),
      );
      const description = sanitizeVideoModelDescription(readUiDescription(model.uiSchema) ?? rawCapabilities.description);
      const estimatedDurationLabel = sanitizeVideoModelEstimatedDuration(rawCapabilities.estimatedDurationLabel);
      const capabilities = {
        ...rawCapabilities,
        description,
        ...(estimatedDurationLabel ? { estimatedDurationLabel } : {}),
      };
      if (!estimatedDurationLabel) delete capabilities.estimatedDurationLabel;

      const pricing = route.pricing?.exact === true
        && route.pricing.billingBasis === "duration_second"
        && route.pricing.unit === "video_generation"
        ? route.pricing as { billingBasis: "duration_second"; exact: true; minChargeCredits: number; unit: "video_generation"; unitCredits: number }
        : null;
      const estimatedCredits = pricing?.unitCredits ?? positiveNumber(route.estimatedCredits);
      const minChargeCredits = pricing?.minChargeCredits ?? positiveNumber(route.minChargeCredits);

      return [{
        blocker: pricing ? null : "PRICING_NOT_FOUND",
        capabilities,
        description,
        estimatedCredits,
        ...(estimatedDurationLabel ? { estimatedDurationLabel } : {}),
        id: model.id,
        label,
        modelKey: model.modelKey,
        minChargeCredits,
        pricing,
        routeLabel: route.routeLabel,
        routeKey: route.routeKey,
      }];
    });
}

function getCreatorModelLabel(model: AiModelCatalogItem): string | null {
  const explicitCreatorLabel = model.uiSchema.creatorLabel;
  if (isSafeCreatorLabel(explicitCreatorLabel)) return explicitCreatorLabel.trim();
  if (isSafeCreatorLabel(model.displayName)) return model.displayName.trim();
  return null;
}

function positiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function readUiDescription(schema: Record<string, unknown>): string | undefined {
  const value = schema.description;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function constrainKnownVideoModelCapabilities(
  modelKey: string,
  capabilities: VideoModelOption["capabilities"],
): VideoModelOption["capabilities"] {
  if (modelKey.trim().toLowerCase() !== "h3video-2k") return capabilities;
  return {
    ...capabilities,
    confirmedByRoute: true,
    defaults: { ...capabilities.defaults, resolution: "2K" },
    resolutions: ["2K"],
  };
}
