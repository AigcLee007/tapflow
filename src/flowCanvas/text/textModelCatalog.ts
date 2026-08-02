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
  logoKey: string | null;
  manufacturer: string;
  modelFamily: string;
  modelKey: string;
  routes: TextRouteOption[];
};

export type TextModelGroup = {
  manufacturer: string;
  models: TextModelOption[];
};

const TEXT_MANUFACTURER_ORDER = ["Gemini", "GPT", "Claude"] as const;

function readUiSchemaString(uiSchema: Record<string, unknown>, key: string): string | null {
  const value = uiSchema[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeManufacturer(value: string | null): string {
  return TEXT_MANUFACTURER_ORDER.includes(value as typeof TEXT_MANUFACTURER_ORDER[number])
    ? value!
    : "其他";
}

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
        logoKey: readUiSchemaString(model.uiSchema, "logoKey"),
        manufacturer: normalizeManufacturer(readUiSchemaString(model.uiSchema, "manufacturer")),
        modelFamily: model.modelFamily,
        modelKey: model.modelKey,
        routes,
      };
    })
    .filter((model): model is TextModelOption => model !== null);
}

export function groupTextModelOptions(options: TextModelOption[]): TextModelGroup[] {
  const groups = new Map<string, TextModelOption[]>();
  for (const option of options) {
    const manufacturer = normalizeManufacturer(
      typeof option.manufacturer === "string" ? option.manufacturer : null,
    );
    const models = groups.get(manufacturer) ?? [];
    models.push(option);
    groups.set(manufacturer, models);
  }
  return [...TEXT_MANUFACTURER_ORDER, "其他"]
    .map((manufacturer) => ({ manufacturer, models: groups.get(manufacturer) ?? [] }))
    .filter((group) => group.models.length > 0);
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
