import type { AssetReferenceInput } from "./types.js";

export const TEXT_IMAGE_INPUT_ERROR_CODES = {
  ASSET_NOT_FOUND: "TEXT_IMAGE_ASSET_NOT_FOUND",
  LIMIT_EXCEEDED: "TEXT_IMAGE_INPUT_LIMIT_EXCEEDED",
  MODEL_UNSUPPORTED: "TEXT_MODEL_IMAGE_INPUT_UNSUPPORTED",
  TYPE_UNSUPPORTED: "TEXT_IMAGE_TYPE_UNSUPPORTED",
  URL_HYDRATION_FAILED: "TEXT_IMAGE_URL_HYDRATION_FAILED",
} as const;

export type TextGenerationCapabilities = {
  maxImages: number;
  supportedImageMimeTypes: string[];
  supportsImageInput: boolean;
};

export type TextImageInputIssue = {
  code: typeof TEXT_IMAGE_INPUT_ERROR_CODES[keyof typeof TEXT_IMAGE_INPUT_ERROR_CODES];
  message: string;
  path: string;
};

const MAX_TEXT_INPUT_IMAGES = 3;
const IMAGE_MIME_TYPE = /^image\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeMimeType(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return IMAGE_MIME_TYPE.test(normalized) ? normalized : null;
}

function readImageMimeTypes(value: unknown): string[] | null | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return null;
  const mimeTypes = value.map(normalizeMimeType).filter((mimeType): mimeType is string => mimeType !== null);
  return mimeTypes.length === value.length && mimeTypes.length > 0 ? Array.from(new Set(mimeTypes)) : null;
}

function readCapabilities(value: unknown): { maxImages: number; supportedImageMimeTypes: string[] | null | undefined } | null {
  const maxImages = isRecord(value) ? value.maxImages : null;
  if (
    !isRecord(value) ||
    value.supportsImageInput !== true ||
    typeof maxImages !== "number" ||
    !Number.isInteger(maxImages) ||
    maxImages <= 0
  ) {
    return null;
  }
  return {
    maxImages,
    supportedImageMimeTypes: readImageMimeTypes(value.supportedImageMimeTypes),
  };
}

function issue(
  code: TextImageInputIssue["code"],
  path: string,
  message: string,
): TextImageInputIssue {
  return { code, message, path };
}

export function resolveTextGenerationCapabilities(
  modelCapabilities: unknown,
  routeCapabilities: unknown,
): TextGenerationCapabilities {
  const model = readCapabilities(modelCapabilities);
  const route = readCapabilities(routeCapabilities);
  if (!model || !route) {
    return { maxImages: 0, supportedImageMimeTypes: [], supportsImageInput: false };
  }

  const modelMimeTypes = model.supportedImageMimeTypes;
  const routeMimeTypes = route.supportedImageMimeTypes;
  if (modelMimeTypes === null || routeMimeTypes === null) {
    return { maxImages: 0, supportedImageMimeTypes: [], supportsImageInput: false };
  }
  const supportedImageMimeTypes = modelMimeTypes && routeMimeTypes
    ? modelMimeTypes.filter((mimeType) => routeMimeTypes.includes(mimeType))
    : modelMimeTypes ?? routeMimeTypes ?? [];

  if (supportedImageMimeTypes.length === 0) {
    return { maxImages: 0, supportedImageMimeTypes: [], supportsImageInput: false };
  }

  return {
    maxImages: Math.min(MAX_TEXT_INPUT_IMAGES, model.maxImages, route.maxImages),
    supportedImageMimeTypes,
    supportsImageInput: true,
  };
}

export function validateTextImageInput({
  capabilities,
  inputAssets,
}: {
  capabilities: TextGenerationCapabilities;
  inputAssets: AssetReferenceInput[] | null | undefined;
}): TextImageInputIssue | null {
  const assets = Array.isArray(inputAssets) ? inputAssets : [];
  if (assets.length === 0) return null;
  if (!capabilities.supportsImageInput || capabilities.maxImages <= 0) {
    return issue(TEXT_IMAGE_INPUT_ERROR_CODES.MODEL_UNSUPPORTED, "inputAssets", "This text model route does not support image input.");
  }
  if (assets.length > Math.min(MAX_TEXT_INPUT_IMAGES, capabilities.maxImages)) {
    return issue(TEXT_IMAGE_INPUT_ERROR_CODES.LIMIT_EXCEEDED, "inputAssets", "The selected images exceed the route limit.");
  }

  for (let index = 0; index < assets.length; index += 1) {
    const asset = assets[index];
    const path = `inputAssets.${index}`;
    if (asset.kind?.toLowerCase() !== "image") {
      return issue(TEXT_IMAGE_INPUT_ERROR_CODES.TYPE_UNSUPPORTED, path, "Only image assets are supported.");
    }
    if (typeof asset.assetId !== "string" || asset.assetId.trim().length === 0) {
      return issue(TEXT_IMAGE_INPUT_ERROR_CODES.ASSET_NOT_FOUND, path, "The referenced image asset was not found.");
    }
    const mimeType = normalizeMimeType(asset.mimeType);
    if (!mimeType || !capabilities.supportedImageMimeTypes.includes(mimeType)) {
      return issue(TEXT_IMAGE_INPUT_ERROR_CODES.TYPE_UNSUPPORTED, path, "This image type is not supported by the route.");
    }
  }

  return null;
}
