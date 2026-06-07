const SIZE_PATTERN = /^\s*(\d+)\s*[xX]\s*(\d+)\s*$/;
const RATIO_PATTERN = /^\s*(\d+(?:\.\d+)?)\s*[:xX]\s*(\d+(?:\.\d+)?)\s*$/;
const SIZE_MULTIPLE = 16;
const MAX_EDGE = 3840;
const MAX_ASPECT_RATIO = 3;
const MIN_PIXELS = 655_360;
const MAX_PIXELS = 8_294_400;
const MAX_RATIO_ERROR = 0.01;

export type ImageSizeTier = "1K" | "2K" | "4K";

const TIER_PIXEL_BUDGET: Record<ImageSizeTier, number> = {
  "1K": 1_572_864,
  "2K": 4_194_304,
  "4K": MAX_PIXELS,
};

function roundToMultiple(value: number, multiple: number): number {
  return Math.max(multiple, Math.round(value / multiple) * multiple);
}

function floorToMultiple(value: number, multiple: number): number {
  return Math.max(multiple, Math.floor(value / multiple) * multiple);
}

function ceilToMultiple(value: number, multiple: number): number {
  return Math.max(multiple, Math.ceil(value / multiple) * multiple);
}

function normalizeDimensions(width: number, height: number): { height: number; width: number } {
  let normalizedWidth = roundToMultiple(width, SIZE_MULTIPLE);
  let normalizedHeight = roundToMultiple(height, SIZE_MULTIPLE);

  const scaleToFit = (scale: number) => {
    normalizedWidth = floorToMultiple(normalizedWidth * scale, SIZE_MULTIPLE);
    normalizedHeight = floorToMultiple(normalizedHeight * scale, SIZE_MULTIPLE);
  };

  const scaleToFill = (scale: number) => {
    normalizedWidth = ceilToMultiple(normalizedWidth * scale, SIZE_MULTIPLE);
    normalizedHeight = ceilToMultiple(normalizedHeight * scale, SIZE_MULTIPLE);
  };

  for (let index = 0; index < 4; index += 1) {
    const maxEdge = Math.max(normalizedWidth, normalizedHeight);
    if (maxEdge > MAX_EDGE) {
      scaleToFit(MAX_EDGE / maxEdge);
    }

    if (normalizedWidth / normalizedHeight > MAX_ASPECT_RATIO) {
      normalizedWidth = floorToMultiple(normalizedHeight * MAX_ASPECT_RATIO, SIZE_MULTIPLE);
    } else if (normalizedHeight / normalizedWidth > MAX_ASPECT_RATIO) {
      normalizedHeight = floorToMultiple(normalizedWidth * MAX_ASPECT_RATIO, SIZE_MULTIPLE);
    }

    const pixels = normalizedWidth * normalizedHeight;
    if (pixels > MAX_PIXELS) {
      scaleToFit(Math.sqrt(MAX_PIXELS / pixels));
    } else if (pixels < MIN_PIXELS) {
      scaleToFill(Math.sqrt(MIN_PIXELS / pixels));
    }
  }

  return { height: normalizedHeight, width: normalizedWidth };
}

function parseRatio(ratio: string): { height: number; width: number } | null {
  const match = ratio.match(RATIO_PATTERN);
  if (!match) return null;

  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  return { height, width };
}

function parseTier(value: string): ImageSizeTier | null {
  const normalized = value.trim().toUpperCase();
  if (normalized === "1K" || normalized === "2K" || normalized === "4K") {
    return normalized;
  }
  return null;
}

export function normalizeOpenAiImagePixelSize(size: string): string | null {
  const match = size.match(SIZE_PATTERN);
  if (!match) return null;

  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  const normalized = normalizeDimensions(width, height);
  return `${normalized.width}x${normalized.height}`;
}

export function calculateOpenAiImageSizeForTier(tier: ImageSizeTier, aspectRatio = "1:1"): string | null {
  const parsed = parseRatio(aspectRatio) ?? parseRatio("1:1");
  if (!parsed) return null;

  const targetRatio = parsed.width / parsed.height;
  const pixelBudget = TIER_PIXEL_BUDGET[tier];
  let bestHeight = 0;
  let bestPixels = 0;
  let bestWidth = 0;

  for (let width = SIZE_MULTIPLE; width <= MAX_EDGE; width += SIZE_MULTIPLE) {
    const idealHeight = width / targetRatio;
    const candidates = [
      Math.floor(idealHeight / SIZE_MULTIPLE) * SIZE_MULTIPLE,
      Math.ceil(idealHeight / SIZE_MULTIPLE) * SIZE_MULTIPLE,
    ];

    for (const height of candidates) {
      if (height < SIZE_MULTIPLE || height > MAX_EDGE) continue;

      const pixels = width * height;
      if (pixels > pixelBudget || pixels < MIN_PIXELS) continue;
      if (Math.max(width / height, height / width) > MAX_ASPECT_RATIO) continue;

      const actualRatio = width / height;
      const ratioError = Math.abs(actualRatio - targetRatio) / targetRatio;
      if (ratioError > MAX_RATIO_ERROR) continue;

      if (pixels > bestPixels) {
        bestPixels = pixels;
        bestWidth = width;
        bestHeight = height;
      }
    }
  }

  return bestPixels > 0 ? `${bestWidth}x${bestHeight}` : null;
}

export function normalizeOpenAiCompatibleImageSize(size: string | null, aspectRatio = "1:1"): string | null {
  if (!size) return null;
  const trimmed = size.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase() === "auto") return "auto";

  const explicitSize = normalizeOpenAiImagePixelSize(trimmed);
  if (explicitSize) return explicitSize;

  const tier = parseTier(trimmed);
  if (tier) {
    return calculateOpenAiImageSizeForTier(tier, aspectRatio);
  }

  return null;
}
