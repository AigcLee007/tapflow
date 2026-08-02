import type { BillingSummary, BillingUsageEvent } from "./billingApi";

export function getAvailableCredits(summary: BillingSummary | null): number | null {
  return summary ? Math.max(summary.availableCredits, 0) : null;
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
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

export function formatUsageEventLabel(item: BillingUsageEvent): string {
  const event = item.eventType.toLowerCase();
  if (item.modality === "text" || event.includes("text")) return "文本生成";
  if (item.modality === "image" || event.includes("image")) return "图片生成";
  if (item.modality === "video" || event.includes("video")) return "视频生成";
  if (item.modality === "audio" || event.includes("audio")) return "音频生成";
  if (event.includes("agent")) return "Agent";
  return "生成任务";
}

export function formatUsageStatus(status: string): string {
  if (status === "settled") return "已结算";
  if (status === "refunded") return "已退款";
  if (status === "reserved" || status === "pending") return "处理中";
  if (status === "failed") return "失败";
  return status;
}

export function formatUsageModel(item: BillingUsageEvent): string {
  return readMetadataString(item.metadata, [
    "productModelLabel",
    "modelLabel",
    "modelDisplayName",
    "productModelId",
    "modelId",
  ]) ?? item.modelId ?? "-";
}

export function formatUsageParameters(item: BillingUsageEvent): string {
  const metadata = item.metadata;
  const direct = readMetadataString(metadata, ["parameterLabel", "paramsLabel", "sizeLabel"]);
  if (direct) return direct;
  const aspect = readMetadataString(metadata, ["aspectRatio", "aspect_ratio"]);
  const size = readMetadataString(metadata, ["imageSize", "image_size", "size"]);
  return [aspect, size?.toUpperCase()].filter(Boolean).join(" - ") || "-";
}

export function formatUsageQuantity(item: BillingUsageEvent): string {
  const quantity = readMetadataNumber(item.metadata, ["quantity", "requestedCount", "pricingQuantity"]);
  if (quantity !== null) return String(quantity);
  if (item.units && Number.isFinite(Number(item.units))) return String(Number(item.units));
  return "-";
}
