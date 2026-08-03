import type { AiModelCatalogItem, AiModelCatalogRoute } from "../../services/v2AiModelCatalogApi";
import { mergeVideoCapabilities } from "./videoGenerationCapabilities";
import type { VideoModelOption } from "./videoTypes";
import {
  isSafeChineseCreatorText,
  sanitizeVideoModelDescription,
  sanitizeVideoModelEstimatedDuration,
} from "./videoPresentationSanitizers";

const isGenerationRoute = (route: AiModelCatalogRoute) =>
  route.modality === "video"
  && route.capabilities?.confirmedByRoute === true
  &&
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
      const rawCapabilities = mergeVideoCapabilities(model.capabilities, route.capabilities, { confirmedByRoute: true });
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
      return {
        blocker: pricing ? null : "PRICING_NOT_FOUND",
        capabilities,
        description,
        estimatedCredits,
        ...(estimatedDurationLabel ? { estimatedDurationLabel } : {}),
        id: model.id,
        label: getCreatorModelLabel(model, index + 1),
        modelKey: model.modelKey,
        minChargeCredits,
        pricing,
        routeKey: route.routeKey,
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
