const SIZE_TIER_PRICING: Record<string, Record<string, number>> = {
  "image.gpt-image-2": {
    "1k": 2.5,
    "2k": 3,
    "4k": 3.5,
  },
  "image.gpt-image-2.line2": {
    "1k": 3,
    "2k": 3.5,
    "4k": 4,
  },
  "image.gpt-image-2.line3": {
    "1k": 1,
    "2k": 2,
    "4k": 3,
  },
  "image.gpt-image-2.line4": {
    "1k": 3,
    "2k": 4,
    "4k": 5,
  },
  "image.gpt-image-2.mouxihub-official": {
    "1k": 12,
    "2k": 12,
    "4k": 12,
  },
  "image.gpt-image-2.pixellelabs-stable": {
    "1k": 3,
    "2k": 3,
    "4k": 3,
  },
  "image.mouxihub.nano-banana-pro.t3": {
    "1k": 6,
    "2k": 8,
    "4k": 12,
  },
  "image.pixellelabs.nano-banana-2": {
    "1k": 2.5,
    "2k": 3,
    "4k": 3.5,
  },
  "image.pixellelabs.nano-banana-pro": {
    "1k": 4,
    "2k": 4.5,
    "4k": 5,
  },
};

export function normalizeImagePricingSize(value: unknown): string {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "1k" || normalized === "2k" || normalized === "4k" ? normalized : "1k";
}

export function getOfficialImageRouteSizeCredits(routeKey: unknown, size: unknown): number | null {
  const routePricing = SIZE_TIER_PRICING[String(routeKey || "").trim()];
  if (!routePricing) return null;
  return routePricing[normalizeImagePricingSize(size)] ?? null;
}

export function getDisplayImageCredits(unitCredits: number | null | undefined, batchCount: unknown): number | null {
  if (typeof unitCredits !== "number" || !Number.isFinite(unitCredits)) return null;
  const normalizedBatchCount = Math.max(1, Number(batchCount) || 1);
  return unitCredits * normalizedBatchCount;
}

export function formatImageCredits(value: number): string {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
}
