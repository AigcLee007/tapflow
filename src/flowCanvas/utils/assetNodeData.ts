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

function pickPositiveNumber(...values: Array<number | null | undefined>) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return value;
    }
  }
  return undefined;
}
