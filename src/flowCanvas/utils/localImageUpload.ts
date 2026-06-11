import {
  getAssetDownloadUrl,
  getAssetVariantUrl,
  uploadAssetFile,
  type AssetItem,
} from "../../assets/assetApi";
import { buildAssetBackedNodeData } from "./assetNodeData";
import { getImageNaturalSize } from "./imageUtils";
import { fitMediaNodeToShortSide } from "./nodeSizing";
import type { FlowNodeData } from "../types";

type PrepareUploadedImageNodeDataInput = {
  file: File;
  projectId?: string | null;
  source: string;
  title?: string;
};

export async function prepareLocalImageNodeData(input: PrepareUploadedImageNodeDataInput): Promise<{
  localObjectUrl: string;
  natural: { h: number; w: number };
  nodeData: Partial<FlowNodeData>;
}> {
  const localObjectUrl = URL.createObjectURL(input.file);
  const natural = await getImageNaturalSize(localObjectUrl);
  const fitted = fitMediaNodeToShortSide(natural.w, natural.h);

  return {
    localObjectUrl,
    natural,
    nodeData: {
      title: input.title || input.file.name.replace(/\.[^.]+$/, "") || "图片",
      thumbnailUrl: localObjectUrl,
      originalImageUrl: localObjectUrl,
      width: fitted.width,
      height: fitted.height,
      naturalWidth: natural.w,
      naturalHeight: natural.h,
      aspectRatio: natural.w / natural.h,
      editHistory: [],
      imageFolderIds: [],
      status: "running",
      generationStatus: "generating",
      generatedResults: undefined,
      activeResultIndex: undefined,
      coverResultId: undefined,
      favoriteResultIds: undefined,
      lastGenerationSnapshot: undefined,
      errorMessage: undefined,
      source: input.source,
      mimeType: input.file.type || "image/*",
    },
  };
}

export async function prepareUploadedImageNodeData(input: PrepareUploadedImageNodeDataInput): Promise<{
  asset: AssetItem;
  natural: { h: number; w: number };
  nodeData: ReturnType<typeof buildAssetBackedNodeData>;
}> {
  const local = await prepareLocalImageNodeData(input);

  try {
    const asset = await uploadAssetFile({
      file: input.file,
      kind: "image",
      projectId: input.projectId ?? null,
    });
    const assetPreviewUrl = await resolveUploadedAssetPreviewUrl(asset.id);

    return {
      asset,
      natural: local.natural,
      nodeData: buildAssetBackedNodeData(asset, {
        naturalHeight: local.natural.h,
        naturalWidth: local.natural.w,
        previewUrl: assetPreviewUrl,
        source: input.source,
        title: input.title || input.file.name.replace(/\.[^.]+$/, "") || asset.title || "图片",
      }),
    };
  } finally {
    URL.revokeObjectURL(local.localObjectUrl);
  }
}

async function resolveUploadedAssetPreviewUrl(assetId: string): Promise<string | undefined> {
  try {
    const preview = await getAssetVariantUrl(assetId, "preview");
    return preview.url;
  } catch {
    try {
      const fallback = await getAssetDownloadUrl(assetId);
      return fallback.url;
    } catch {
      return undefined;
    }
  }
}
