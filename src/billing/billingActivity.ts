import {
  listAiModelCatalog,
  listAiModelRoutes,
  type AiModelCatalogItem,
  type AiModelCatalogRoute,
} from "../services/v2AiModelCatalogApi";
import {
  getProductImageModelLabel,
  mapCatalogRoutesToRuntimeOptions,
} from "../flowCanvas/utils/modelCatalogOptions";
import type { BillingLedgerEntry, BillingUsageEvent } from "./billingApi";

export type BillingDisplayCatalog = {
  modelLabelsByModelFamily: Map<string, string>;
  modelLabelsByModelId: Map<string, string>;
  modelLabelsByModelKey: Map<string, string>;
  routeLabelsByRouteId: Map<string, string>;
  routeLabelsByRouteKey: Map<string, string>;
};

export type BillingActivityRow = {
  credits: number;
  createdAt: string;
  eventLabel: string;
  id: string;
  modelLabel: string;
  parameterLabel: string;
  quantityLabel: string;
  statusLabel: string;
};

const CREDIT_LEDGER_ENTRY_TYPES = new Set(["refund", "redeem", "admin_credit", "payment", "migration_credit"]);
const HIDDEN_LEDGER_ENTRY_TYPES = new Set(["reserve"]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let cachedBillingDisplayCatalog: BillingDisplayCatalog | null = null;
let billingDisplayCatalogRequest: Promise<BillingDisplayCatalog> | null = null;

function createEmptyMapCatalog(): BillingDisplayCatalog {
  return {
    modelLabelsByModelFamily: new Map<string, string>(),
    modelLabelsByModelId: new Map<string, string>(),
    modelLabelsByModelKey: new Map<string, string>(),
    routeLabelsByRouteId: new Map<string, string>(),
    routeLabelsByRouteKey: new Map<string, string>(),
  };
}

function normalizeKey(value: unknown): string {
  return String(value || "").trim();
}

function normalizeLowerKey(value: unknown): string {
  return normalizeKey(value).toLowerCase();
}

function readMetadataString(metadata: Record<string, unknown> | undefined, keys: string[]): string | null {
  for (const key of keys) {
    const value = metadata?.[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function readMetadataNumber(metadata: Record<string, unknown> | undefined, keys: string[]): number | null {
  for (const key of keys) {
    const value = metadata?.[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return null;
}

function isTechnicalIdentifier(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) return false;
  if (UUID_PATTERN.test(normalized)) return true;
  if (normalized.includes(".") && !normalized.includes(" ")) return true;
  return false;
}

function resolveRouteUserFacingLabel(route: AiModelCatalogRoute, modelLabel: string): string {
  if (route.modality === "image") {
    const runtimeOption = mapCatalogRoutesToRuntimeOptions([route])[0];
    if (runtimeOption?.userFacingLabel) {
      return runtimeOption.userFacingLabel;
    }
  }

  const routeLabel = normalizeKey(route.routeLabel);
  if (routeLabel) {
    if (routeLabel.startsWith(modelLabel)) return routeLabel;
    return `${modelLabel} ${routeLabel}`;
  }

  return modelLabel || "-";
}

function resolveCatalogModelLabel(item: AiModelCatalogItem): string {
  const displayName = normalizeKey(item.displayName);
  if (displayName) return displayName;
  const imageLabel = getProductImageModelLabel(item.modelFamily || item.modelKey);
  if (imageLabel) return imageLabel;
  return normalizeKey(item.modelKey) || "-";
}

function getCatalogModelLabelForKey(catalog: BillingDisplayCatalog, key: string | null | undefined): string | null {
  const normalized = normalizeLowerKey(key);
  if (!normalized) return null;
  return (
    catalog.modelLabelsByModelId.get(normalized) ??
    catalog.modelLabelsByModelKey.get(normalized) ??
    catalog.modelLabelsByModelFamily.get(normalized) ??
    null
  );
}

function resolveUsageEventLabel(item: BillingUsageEvent): string {
  const event = item.eventType.toLowerCase();
  if (item.modality === "text" || event.includes("text")) return "\u6587\u672c\u751f\u6210";
  if (item.modality === "image" || event.includes("image")) return "\u56fe\u7247\u751f\u6210";
  if (item.modality === "video" || event.includes("video")) return "\u89c6\u9891\u751f\u6210";
  if (item.modality === "audio" || event.includes("audio")) return "\u97f3\u9891\u751f\u6210";
  if (event.includes("agent")) return "Agent";
  return "\u751f\u6210\u4efb\u52a1";
}

function resolveUsageStatus(status: string): string {
  if (status === "settled") return "\u5df2\u7ed3\u7b97";
  if (status === "refunded") return "\u5df2\u9000\u6b3e";
  if (status === "reserved" || status === "pending") return "\u5904\u7406\u4e2d";
  if (status === "failed") return "\u5931\u8d25";
  return status || "-";
}

function resolveUsageModelLabel(item: BillingUsageEvent, catalog: BillingDisplayCatalog): string {
  const directRouteLabel = readMetadataString(item.metadata, [
    "productRouteLabel",
    "userFacingRouteLabel",
  ]);
  if (directRouteLabel && !isTechnicalIdentifier(directRouteLabel)) {
    return directRouteLabel;
  }

  const routeLabelFromMetadata = readMetadataString(item.metadata, ["routeLabel"]);
  const modelLabelFromMetadata = readMetadataString(item.metadata, [
    "productModelLabel",
    "modelLabel",
    "modelDisplayName",
  ]);
  if (routeLabelFromMetadata && !isTechnicalIdentifier(routeLabelFromMetadata)) {
    if (modelLabelFromMetadata && !isTechnicalIdentifier(modelLabelFromMetadata)) {
      return routeLabelFromMetadata.startsWith(modelLabelFromMetadata)
        ? routeLabelFromMetadata
        : `${modelLabelFromMetadata} ${routeLabelFromMetadata}`;
    }
    return routeLabelFromMetadata;
  }

  if (modelLabelFromMetadata && !isTechnicalIdentifier(modelLabelFromMetadata)) {
    return modelLabelFromMetadata;
  }

  const metadataRouteKey = readMetadataString(item.metadata, ["routeKey"]);
  const metadataRouteLabel = metadataRouteKey
    ? catalog.routeLabelsByRouteKey.get(normalizeLowerKey(metadataRouteKey))
    : null;
  if (metadataRouteLabel) return metadataRouteLabel;

  const routeLabel = item.routeId ? catalog.routeLabelsByRouteId.get(normalizeLowerKey(item.routeId)) : null;
  if (routeLabel) return routeLabel;

  const metadataModelLabel = getCatalogModelLabelForKey(
    catalog,
    readMetadataString(item.metadata, ["productModelId", "modelKey", "modelFamily", "productModelKey"]),
  );
  if (metadataModelLabel) return metadataModelLabel;

  const modelLabel = getCatalogModelLabelForKey(catalog, item.modelId);
  if (modelLabel) return modelLabel;

  const imageFallback = getProductImageModelLabel(
    readMetadataString(item.metadata, ["productModelId", "modelKey", "modelFamily"]) ?? item.modelId ?? "",
  );
  if (imageFallback && !isTechnicalIdentifier(imageFallback)) {
    return imageFallback;
  }

  return "-";
}

function resolveUsageParameters(item: BillingUsageEvent): string {
  const metadata = item.metadata;
  const direct = readMetadataString(metadata, ["parameterLabel", "paramsLabel", "sizeLabel"]);
  if (direct) return direct;
  const aspect = readMetadataString(metadata, ["aspectRatio", "aspect_ratio"]);
  const size = readMetadataString(metadata, ["imageSize", "image_size", "size"]);
  const parts = [aspect, size?.toUpperCase()].filter(Boolean);
  return parts.join(" - ") || "-";
}

function resolveUsageQuantity(item: BillingUsageEvent): string {
  const quantity = readMetadataNumber(item.metadata, ["quantity", "requestedCount", "pricingQuantity"]);
  if (quantity !== null) return String(quantity);
  if (item.units && Number.isFinite(Number(item.units))) return String(Number(item.units));
  return "-";
}

function resolveLedgerEventLabel(entryType: string): string {
  if (entryType === "refund") return "\u9000\u6b3e";
  if (entryType === "redeem") return "\u5151\u6362\u79ef\u5206";
  if (entryType === "admin_credit") return "\u540e\u53f0\u53d1\u653e";
  if (entryType === "payment") return "\u5145\u503c";
  if (entryType === "migration_credit") return "\u5386\u53f2\u4f59\u989d\u8fc1\u79fb";
  if (entryType === "expire") return "\u79ef\u5206\u8fc7\u671f";
  if (entryType === "payment_refund") return "\u5145\u503c\u9000\u6b3e";
  if (entryType === "settle") return "\u79ef\u5206\u7ed3\u7b97";
  if (entryType === "admin_debit") return "\u540e\u53f0\u6263\u51cf";
  return "\u79ef\u5206\u53d8\u52a8";
}

function resolveLedgerStatusLabel(entryType: string): string {
  if (entryType === "admin_debit") return "\u5df2\u6263\u51cf";
  return "\u5df2\u5165\u8d26";
}

function resolveLedgerCredits(entry: BillingLedgerEntry): number {
  return CREDIT_LEDGER_ENTRY_TYPES.has(entry.entryType) ? entry.amountCredits : -entry.amountCredits;
}

export function buildBillingDisplayCatalog(
  models: AiModelCatalogItem[],
  routes: AiModelCatalogRoute[],
): BillingDisplayCatalog {
  const catalog = createEmptyMapCatalog();

  for (const model of models) {
    const label = resolveCatalogModelLabel(model);
    const modelId = normalizeLowerKey(model.modelId);
    const modelKey = normalizeLowerKey(model.modelKey);
    const modelFamily = normalizeLowerKey(model.modelFamily);

    if (modelId) catalog.modelLabelsByModelId.set(modelId, label);
    if (modelKey) catalog.modelLabelsByModelKey.set(modelKey, label);
    if (modelFamily) catalog.modelLabelsByModelFamily.set(modelFamily, label);
  }

  for (const route of routes) {
    const modelLabel =
      getCatalogModelLabelForKey(catalog, route.modelKey) ??
      getCatalogModelLabelForKey(catalog, route.modelFamily) ??
      getProductImageModelLabel(route.modelFamily || route.modelKey || "");
    const label = resolveRouteUserFacingLabel(route, modelLabel || "-");
    const routeId = normalizeLowerKey(route.routeId);
    const routeKey = normalizeLowerKey(route.routeKey);
    if (routeId) catalog.routeLabelsByRouteId.set(routeId, label);
    if (routeKey) catalog.routeLabelsByRouteKey.set(routeKey, label);
  }

  return catalog;
}

export function getEmptyBillingDisplayCatalog(): BillingDisplayCatalog {
  return createEmptyMapCatalog();
}

export function resetBillingDisplayCatalogCache(): void {
  cachedBillingDisplayCatalog = null;
  billingDisplayCatalogRequest = null;
}

export async function loadBillingDisplayCatalog(): Promise<BillingDisplayCatalog> {
  if (cachedBillingDisplayCatalog) return cachedBillingDisplayCatalog;
  if (billingDisplayCatalogRequest) return billingDisplayCatalogRequest;

  billingDisplayCatalogRequest = (async () => {
    const modelGroups = await Promise.all([
      listAiModelCatalog("image").catch(() => []),
      listAiModelCatalog("text").catch(() => []),
      listAiModelCatalog("video").catch(() => []),
    ]);
    const models = modelGroups.flat();
    const routeGroups = await Promise.all(
      models.map((item) => listAiModelRoutes(item.modelKey).catch(() => [])),
    );
    cachedBillingDisplayCatalog = buildBillingDisplayCatalog(models, routeGroups.flat());
    return cachedBillingDisplayCatalog;
  })().finally(() => {
    billingDisplayCatalogRequest = null;
  });

  return billingDisplayCatalogRequest;
}

export function buildBillingActivityRows(
  usage: BillingUsageEvent[],
  ledger: BillingLedgerEntry[],
  catalog: BillingDisplayCatalog,
): BillingActivityRow[] {
  const usageIds = new Set(usage.map((item) => item.id));

  const usageRows = usage.map((item) => ({
    credits: -item.billableCents,
    createdAt: item.createdAt,
    eventLabel: resolveUsageEventLabel(item),
    id: `usage:${item.id}`,
    modelLabel: resolveUsageModelLabel(item, catalog),
    parameterLabel: resolveUsageParameters(item),
    quantityLabel: resolveUsageQuantity(item),
    statusLabel: resolveUsageStatus(item.status),
  }));

  const ledgerRows = ledger
    .filter((entry) => {
      if (HIDDEN_LEDGER_ENTRY_TYPES.has(entry.entryType)) return false;
      if (entry.usageEventId && usageIds.has(entry.usageEventId)) return false;
      return true;
    })
    .map((entry) => ({
      credits: resolveLedgerCredits(entry),
      createdAt: entry.createdAt,
      eventLabel: resolveLedgerEventLabel(entry.entryType),
      id: `ledger:${entry.id}`,
      modelLabel: "-",
      parameterLabel: "-",
      quantityLabel: "-",
      statusLabel: resolveLedgerStatusLabel(entry.entryType),
    }));

  return [...usageRows, ...ledgerRows].sort((left, right) => {
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });
}
