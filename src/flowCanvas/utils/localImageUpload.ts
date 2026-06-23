import {
  getAssetDownloadUrl,
  getAssetVariantUrl,
  uploadAssetFile,
  type AssetItem,
} from "../../assets/assetApi";
import { uploadReferenceImageFile, type ReferenceUploadView } from "../../services/referenceUploadsApi";
import type { FlowNodeData } from "../types";
import { buildAssetBackedNodeData } from "./assetNodeData";
import { getImageNaturalSize } from "./imageUtils";
import { FLOW_NODE_DEFAULT_SIZES, fitMediaNodeToShortSide } from "./nodeSizing";
import { cacheReferenceImagePreview } from "./referenceImageLocalCache";

type LocalImageUploadInput = {
  file: File;
  projectId?: string | null;
  source: string;
  title?: string;
};

type LocalReferenceUploadInput = Omit<LocalImageUploadInput, "projectId"> & {
  localPreviewUrl?: string | null;
};

type ImmediateLocalImageInput = Omit<LocalImageUploadInput, "projectId"> & {
  objectUrl: string;
};

export function createImmediateLocalImageNodeData(input: ImmediateLocalImageInput): {
  localObjectUrl: string;
  nodeData: Partial<FlowNodeData>;
} {
  const fallback = FLOW_NODE_DEFAULT_SIZES.image;
  const title = input.title || input.file.name.replace(/\.[^.]+$/, "") || "图片";

  return {
    localObjectUrl: input.objectUrl,
    nodeData: {
      title,
      thumbnailUrl: input.objectUrl,
      originalImageUrl: input.objectUrl,
      width: fallback.width,
      height: fallback.height,
      editHistory: [],
      imageFolderIds: [],
      status: "success",
      generationStatus: "done",
      uploadStatus: "uploading",
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

export function buildLocalUploadFailureNodeData(error: unknown): Partial<FlowNodeData> {
  return {
    errorMessage: undefined,
    generationStatus: "done",
    status: "success",
    uploadErrorMessage: error instanceof Error ? error.message : "图片上传失败",
    uploadStatus: "failed",
  };
}

export async function measureLocalImageNodeData(objectUrl: string): Promise<Partial<FlowNodeData>> {
  const natural = await getImageNaturalSize(objectUrl);
  const fitted = fitMediaNodeToShortSide(natural.w, natural.h);

  return {
    width: fitted.width,
    height: fitted.height,
    naturalWidth: natural.w,
    naturalHeight: natural.h,
    aspectRatio: natural.w / natural.h,
  };
}

export async function createLocalPreviewObjectUrl(file: File): Promise<string | null> {
  if (!file.type.startsWith("image/")) return null;
  if (typeof createImageBitmap !== "function") return null;

  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const maxSide = 1024;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/webp", 0.82);
    });
    return blob ? URL.createObjectURL(blob) : null;
  } finally {
    bitmap.close();
  }
}

export function revokeUnusedLocalPreviewUrls(input: {
  activePreviewUrl?: string | null;
  persistedPreviewUrl?: string | null;
  sourceUrl?: string | null;
}) {
  const urls = [input.sourceUrl, input.activePreviewUrl]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.startsWith("blob:"));
  const persisted = typeof input.persistedPreviewUrl === "string" ? input.persistedPreviewUrl.trim() : "";
  const keep = persisted.startsWith("blob:") ? persisted : "";

  Array.from(new Set(urls))
    .filter((url) => url && url !== keep)
    .forEach((url) => {
      URL.revokeObjectURL(url);
    });
}

export async function uploadLocalImageAndBuildAssetNodeData(
  input: LocalImageUploadInput & {
    natural?: { h: number; w: number } | null;
  },
): Promise<{
  asset: AssetItem;
  nodeData: ReturnType<typeof buildAssetBackedNodeData>;
}> {
  const asset = await uploadAssetFile({
    file: input.file,
    kind: "image",
    projectId: input.projectId ?? null,
  });
  const assetPreviewUrl = await resolveUploadedAssetPreviewUrl(asset.id);
  const naturalWidth = input.natural?.w ?? asset.width ?? null;
  const naturalHeight = input.natural?.h ?? asset.height ?? null;

  return {
    asset,
    nodeData: buildAssetBackedNodeData(asset, {
      naturalHeight,
      naturalWidth,
      previewUrl: assetPreviewUrl,
      source: input.source,
      title: input.title || input.file.name.replace(/\.[^.]+$/, "") || asset.title || "图片",
    }),
  };
}

export async function uploadLocalImageAndBuildReferenceNodeData(
  input: LocalReferenceUploadInput & {
    natural?: { h: number; w: number } | null;
  },
): Promise<{
  nodeData: Partial<FlowNodeData>;
  upload: ReferenceUploadView;
}> {
  const upload = await uploadReferenceImageFile({
    file: input.file,
    height: input.natural?.h ?? null,
    localPreviewUrl: input.localPreviewUrl ?? null,
    width: input.natural?.w ?? null,
  });
  void cacheReferenceImagePreview({
    blob: input.file,
    expiresAt: upload.expiresAt,
    mimeType: upload.mimeType,
    referenceUploadId: upload.id,
  }).catch(() => undefined);
  const previewUrl = input.localPreviewUrl || upload.previewUrl || undefined;
  const naturalWidth = input.natural?.w ?? upload.width ?? null;
  const naturalHeight = input.natural?.h ?? upload.height ?? null;
  const fittedSize =
    naturalWidth && naturalHeight
      ? fitMediaNodeToShortSide(naturalWidth, naturalHeight)
      : null;

  return {
    upload,
    nodeData: {
      activeResultIndex: undefined,
      assetId: undefined,
      assetIds: undefined,
      coverResultId: undefined,
      errorMessage: undefined,
      favoriteResultIds: undefined,
      generatedResults: undefined,
      generationStatus: "done",
      lastGenerationSnapshot: undefined,
      mimeType: upload.mimeType || input.file.type || "image/*",
      ...(previewUrl ? { originalImageUrl: previewUrl, thumbnailUrl: previewUrl } : {}),
      referenceUploadExpiresAt: upload.expiresAt,
      referenceUploadId: upload.id,
      source: input.source,
      status: "success",
      title: input.title || input.file.name.replace(/\.[^.]+$/, "") || upload.originalFilename || "图片",
      uploadErrorMessage: undefined,
      uploadStatus: "done",
      ...(naturalWidth ? { naturalWidth } : {}),
      ...(naturalHeight ? { naturalHeight } : {}),
      ...(naturalWidth && naturalHeight ? { aspectRatio: naturalWidth / naturalHeight } : {}),
      ...(fittedSize ? { width: fittedSize.width, height: fittedSize.height } : {}),
    },
  };
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
