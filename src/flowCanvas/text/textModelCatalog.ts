import type { AiModelCatalogItem, AiModelCatalogRoute } from "../../services/v2AiModelCatalogApi";

export type TextRouteOption = {
  credits: number;
  id: string;
  label: string;
  providerKey: string;
  routeKey: string;
};

export type TextModelOption = {
  defaultRoute: TextRouteOption;
  id: string;
  label: string;
  modelFamily: string;
  modelKey: string;
  routes: TextRouteOption[];
};

export function toTextModelOptions(
  catalog: AiModelCatalogItem[],
  routesByModelKey: Record<string, AiModelCatalogRoute[]>,
): TextModelOption[] {
  return [...catalog]
    .filter((model) => model.modality === "text" && model.status === "active")
    .sort((left, right) => left.sortOrder - right.sortOrder || left.displayName.localeCompare(right.displayName))
    .map((model) => {
      const routes = (routesByModelKey[model.modelKey] ?? [])
        .filter((route) => route.modality === "text")
        .map(toTextRouteOption)
        .filter((route): route is TextRouteOption => route !== null)
        .sort((left, right) => left.routeKey.localeCompare(right.routeKey) || left.label.localeCompare(right.label));
      const defaultRoute = routes.find((route) => route.routeKey === model.defaultRouteKey) ?? routes[0];
      if (!defaultRoute) return null;

      return {
        defaultRoute,
        id: model.modelKey,
        label: model.displayName.trim() || "文本模型",
        modelFamily: model.modelFamily,
        modelKey: model.modelKey,
        routes,
      };
    })
    .filter((model): model is TextModelOption => model !== null);
}

function toTextRouteOption(route: AiModelCatalogRoute): TextRouteOption | null {
  const credits = positiveNumber(route.estimatedCredits) ?? positiveNumber(route.minChargeCredits);
  if (credits === null || !route.routeId.trim() || !route.routeKey.trim()) return null;
  return {
    credits,
    id: route.routeId,
    label: route.routeLabel?.trim() || "默认线路",
    providerKey: route.providerKey,
    routeKey: route.routeKey,
  };
}

function positiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}
