import type { AssetItem } from "../../assets/assetApi";
import type { FlowNodeData } from "../types";
import { fitMediaNodeToShortSide } from "./nodeSizing";

type AssetNodeDataOptions = {
  naturalHeight?: number | null;
  naturalWidth?: number | null;
  previewUrl?: string;
  source?: string;
  title?: string;
};

export function buildAssetBackedNodeData(
  asset: Pick<
    AssetItem,
    "durationMs" | "height" | "id" | "mimeType" | "originalFilename" | "previewUrl" | "source" | "title" | "width"
  >,
  options: AssetNodeDataOptions = {},
): Partial<FlowNodeData> {
  const naturalWidth = pickPositiveNumber(options.naturalWidth, asset.width);
  const naturalHeight = pickPositiveNumber(options.naturalHeight, asset.height);
  const previewUrl = options.previewUrl ?? asset.previewUrl;
  const fittedSize =
    naturalWidth && naturalHeight
      ? fitMediaNodeToShortSide(naturalWidth, naturalHeight)
      : null;

  return {
    activeResultIndex: undefined,
    assetId: asset.id,
    assetIds: [asset.id],
    coverResultId: undefined,
    editHistory: [],
    errorMessage: undefined,
    favoriteResultIds: undefined,
    generatedResults: undefined,
    generationStatus: "done",
    imageFolderIds: [],
    lastGenerationSnapshot: undefined,
    mimeType: asset.mimeType,
    ...(previewUrl ? { originalImageUrl: previewUrl, thumbnailUrl: previewUrl } : {}),
    source: options.source ?? asset.source ?? "asset-library",
    status: "success",
    title: options.title ?? asset.title ?? asset.originalFilename ?? "云端素材",
    ...(asset.durationMs !== null ? { durationMs: asset.durationMs } : {}),
    ...(naturalWidth ? { naturalWidth } : {}),
    ...(naturalHeight ? { naturalHeight } : {}),
    ...(naturalWidth && naturalHeight ? { aspectRatio: naturalWidth / naturalHeight } : {}),
    ...(fittedSize ? { width: fittedSize.width, height: fittedSize.height } : {}),
  };
}

export function buildMeasuredAssetNodePatch(
  asset: Pick<AssetItem, "height" | "width">,
  natural: { h: number; w: number },
): Pick<FlowNodeData, "aspectRatio" | "height" | "naturalHeight" | "naturalWidth" | "width"> | null {
  const storedAspectRatio =
    typeof asset.width === "number" &&
    asset.width > 0 &&
    typeof asset.height === "number" &&
    asset.height > 0
      ? asset.width / asset.height
      : null;
  const naturalAspectRatio = natural.w / natural.h;
  const missingNaturalSize =
    typeof asset.width !== "number" ||
    asset.width <= 0 ||
    typeof asset.height !== "number" ||
    asset.height <= 0;
  const ratioMismatch =
    storedAspectRatio !== null && Math.abs(storedAspectRatio - naturalAspectRatio) > 0.08;

  if (!missingNaturalSize && !ratioMismatch) return null;

  const fitted = fitMediaNodeToShortSide(natural.w, natural.h);
  return {
    aspectRatio: naturalAspectRatio,
    height: fitted.height,
    naturalHeight: natural.h,
    naturalWidth: natural.w,
    width: fitted.width,
  };
}

function pickPositiveNumber(...values: Array<number | null | undefined>) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return value;
    }
  }
  return undefined;
}
