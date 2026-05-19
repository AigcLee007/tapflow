import { kindFromMimeType, updateAssetMetadata, uploadAssetFile, type AssetItem } from "../../assets/assetApi";
import type { FlowNodeData } from "../types";
import { buildAssetBackedNodeData } from "./assetNodeData";
import { imageUrlToBlob } from "./imageUtils";

export type DerivedImageSourceType =
  | "canvas-upload"
  | "slice"
  | "crop"
  | "annotation"
  | "image-edit"
  | "generated-result"
  | "resize";

type PersistDerivedImageAssetInput = {
  imageUrl: string;
  metadata?: Record<string, unknown>;
  naturalHeight?: number;
  naturalWidth?: number;
  projectId?: string | null;
  source: DerivedImageSourceType;
  sourceAssetId?: string;
  title: string;
};

type PersistDerivedImageAssetResult = {
  asset: AssetItem;
  nodeData: Partial<FlowNodeData>;
};

const MIME_EXTENSION_MAP: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export async function persistDerivedImageAsset(
  input: PersistDerivedImageAssetInput,
): Promise<PersistDerivedImageAssetResult> {
  const blob = await imageUrlToBlob(input.imageUrl);
  const mimeType = blob.type || "image/png";
  const extension = MIME_EXTENSION_MAP[mimeType] || "png";
  const filename = `${normalizeTitle(input.title)}.${extension}`;
  const file = new File([blob], filename, { type: mimeType });

  const uploaded = await uploadAssetFile({
    file,
    kind: kindFromMimeType(mimeType),
    projectId: input.projectId ?? null,
  });

  const metadata = serializeMetadata({
    ...input.metadata,
    sourceAssetId: input.sourceAssetId || undefined,
  });

  const asset = await updateAssetMetadata(uploaded.id, {
    metadata,
    source: input.source,
    title: input.title,
  });

  return {
    asset,
    nodeData: {
      ...buildAssetBackedNodeData(asset, {
        naturalHeight: input.naturalHeight ?? asset.height,
        naturalWidth: input.naturalWidth ?? asset.width,
        source: input.source,
        title: input.title,
      }),
      metadata,
      ...(input.sourceAssetId ? { sourceAssetId: input.sourceAssetId } : {}),
    },
  };
}

function normalizeTitle(title: string) {
  const compact = title.trim().replace(/\s+/g, "-");
  const safe = compact.replace(/[^a-zA-Z0-9-_.]/g, "");
  return safe || `derived-${Date.now()}`;
}

function serializeMetadata(metadata: Record<string, unknown>) {
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string") {
      next[key] = value;
      continue;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      next[key] = String(value);
      continue;
    }
    try {
      next[key] = JSON.stringify(value);
    } catch {
      next[key] = String(value);
    }
  }
  return next;
}
