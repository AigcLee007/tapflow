import {
  getAssetDownloadUrl,
  getAssetVariantUrl,
  uploadAssetFile,
  type AssetItem,
} from "../../assets/assetApi";
import { buildAssetBackedNodeData } from "./assetNodeData";
import { getImageNaturalSize } from "./imageUtils";

type PrepareUploadedImageNodeDataInput = {
  file: File;
  projectId?: string | null;
  source: string;
  title?: string;
};

export async function prepareUploadedImageNodeData(input: PrepareUploadedImageNodeDataInput): Promise<{
  asset: AssetItem;
  natural: { h: number; w: number };
  nodeData: ReturnType<typeof buildAssetBackedNodeData>;
}> {
  const previewUrl = URL.createObjectURL(input.file);

  try {
    const natural = await getImageNaturalSize(previewUrl);
    const asset = await uploadAssetFile({
      file: input.file,
      kind: "image",
      projectId: input.projectId ?? null,
    });
    const assetPreviewUrl = await resolveUploadedAssetPreviewUrl(asset.id);

    return {
      asset,
      natural,
      nodeData: buildAssetBackedNodeData(asset, {
        naturalHeight: natural.h,
        naturalWidth: natural.w,
        previewUrl: assetPreviewUrl,
        source: input.source,
        title: input.title || input.file.name.replace(/\.[^.]+$/, "") || asset.title || "图片",
      }),
    };
  } finally {
    URL.revokeObjectURL(previewUrl);
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
