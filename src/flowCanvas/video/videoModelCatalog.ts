import type { AiModelCatalogItem, AiModelCatalogRoute } from "../../services/v2AiModelCatalogApi";
import { mergeVideoCapabilities } from "./videoGenerationCapabilities";
import type { VideoModelOption } from "./videoTypes";
import { isSafeChineseCreatorText } from "./videoUiCopy";

const isGenerationRoute = (route: AiModelCatalogRoute) =>
  Array.isArray(route.capabilities?.supportedVideoWorkflows)
  && route.capabilities.supportedVideoWorkflows.includes("video_generation");

export function toVideoModelOptions(
  catalog: AiModelCatalogItem[],
  routesByModelKey: Record<string, AiModelCatalogRoute[]>,
): VideoModelOption[] {
  const eligibleModels = [...catalog]
    .filter((model) => model.modality === "video" && model.status === "active")
    .sort((left, right) => left.sortOrder - right.sortOrder || left.displayName.localeCompare(right.displayName))
    .map((model) => ({ model, route: routesByModelKey[model.modelKey]?.find(isGenerationRoute) }))
    .filter((entry): entry is { model: AiModelCatalogItem; route: AiModelCatalogRoute } => Boolean(entry.route));

  return eligibleModels
    .map(({ model, route }, index) => {
      const capabilities = mergeVideoCapabilities(model.capabilities, route.capabilities, { confirmedByRoute: true });
      const estimatedCredits = positiveNumber(route.estimatedCredits) ?? positiveNumber(route.minChargeCredits);
      const minChargeCredits = positiveNumber(route.minChargeCredits) ?? positiveNumber(route.estimatedCredits);
      const description = readUiDescription(model.uiSchema) ?? capabilities.description;
      return {
        blocker: estimatedCredits == null && minChargeCredits == null ? "PRICING_NOT_FOUND" : null,
        capabilities,
        ...(description ? { description } : {}),
        estimatedCredits,
        ...(capabilities.estimatedDurationLabel ? { estimatedDurationLabel: capabilities.estimatedDurationLabel } : {}),
        id: model.id,
        label: getCreatorModelLabel(model, index + 1),
        minChargeCredits,
      };
    });
}

function getCreatorModelLabel(model: AiModelCatalogItem, ordinal: number): string {
  const explicitChineseLabel = ["creatorLabelZh", "labelZh", "displayNameZh"]
    .map((key) => model.uiSchema[key])
    .find(isSafeChineseCreatorText);
  if (explicitChineseLabel) return explicitChineseLabel.trim();
  if (isSafeChineseCreatorText(model.displayName)) return model.displayName.trim();
  return `视频模型 ${ordinal}`;
}

function positiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function readUiDescription(schema: Record<string, unknown>): string | undefined {
  const value = schema.description;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
