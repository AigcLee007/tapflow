import type { VideoReferenceInputV2 } from "../video/videoTypes";

export type CanvasInputKind = "text" | "image" | "video" | "audio";
export type CanvasInputRole = VideoReferenceInputV2["role"];
export type CanvasInputPreviewState = "loading" | "ready" | "error" | "unavailable";

export type CanvasInputSeed = {
  inputKey: string;
  source: "upstream" | "asset";
  kind: CanvasInputKind;
  title: string;
  edgeId?: string;
  sourceNodeId?: string;
  assetId?: string;
  role?: CanvasInputRole;
  textExcerpt?: string;
  previewUrl?: string;
  durationMs?: number;
  sourceRevision?: string;
  previewState: CanvasInputPreviewState;
};

export type CanvasInputItem = CanvasInputSeed & {
  order: number;
};

export function toUpstreamInputKey(sourceNodeId: string): string {
  return `upstream:${sourceNodeId}`;
}

export function toAssetInputKey(assetId: string): string {
  return `asset:${assetId}`;
}

export function resolveCanvasInputItems({
  inputOrder,
  seeds,
}: {
  inputOrder?: string[];
  seeds: CanvasInputSeed[];
}): CanvasInputItem[] {
  const seedsByKey = new Map<string, CanvasInputSeed>();
  for (const seed of seeds) {
    if (!seedsByKey.has(seed.inputKey)) {
      seedsByKey.set(seed.inputKey, seed);
    }
  }

  const orderedSeeds: CanvasInputSeed[] = [];
  const includedKeys = new Set<string>();
  for (const inputKey of inputOrder ?? []) {
    const seed = seedsByKey.get(inputKey);
    if (seed && !includedKeys.has(inputKey)) {
      orderedSeeds.push(seed);
      includedKeys.add(inputKey);
    }
  }

  for (const seed of seeds) {
    if (!includedKeys.has(seed.inputKey)) {
      orderedSeeds.push(seed);
      includedKeys.add(seed.inputKey);
    }
  }

  return orderedSeeds.map((seed, order) => ({ ...seed, order }));
}

export function buildCanvasInputSignature({
  items,
  localPrompt,
  targetNodeId,
}: {
  items: CanvasInputItem[];
  localPrompt: string;
  targetNodeId: string;
}): string {
  const promptHash = fnv1a(localPrompt.trim());
  const safePayload = JSON.stringify({
    targetNodeId,
    promptHash,
    items: items.map((item) => ({
      inputKey: item.inputKey,
      kind: item.kind,
      assetId: item.assetId ?? null,
      role: item.role ?? null,
      sourceRevision: item.kind === "text" ? item.sourceRevision ?? null : null,
    })),
  });

  return `input-v1:${fnv1a(safePayload)}`;
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
