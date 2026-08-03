import type { AssetItem } from '../../assets/assetApi';
import type { FlowUpstreamImageRef } from '../store/flowCanvasStore';

type ReferenceOrderItem = string;

type ReferenceAssetItemMap = Record<string, AssetItem | undefined>;

type ResolveReferenceChipsInput = {
  assetItemsById?: ReferenceAssetItemMap;
  referenceAssetPreviewUrlsById?: Record<string, string | undefined>;
  referenceAssetItemIds?: unknown;
  referenceOrder?: unknown;
  upstreamImageRefs?: readonly FlowUpstreamImageRef[];
};

type CanvasReferenceNode = {
  data?: Record<string, unknown>;
  id: string;
  type?: string;
};

type BuildCanvasImageReferenceSourcesInput = {
  currentNodeId?: string | null;
  nodes?: readonly CanvasReferenceNode[];
};

export type ReferenceMediaKind = 'image' | 'video' | 'audio';

type BuildCanvasMediaReferenceSourcesInput = BuildCanvasImageReferenceSourcesInput & {
  allowedKinds: readonly ReferenceMediaKind[];
};

export type CanvasImageReferenceSource = {
  assetId?: string;
  id: string;
  imageUrl: string;
  key: string;
  nodeId: string;
  referenceUploadId?: string;
  source: 'canvas';
  title: string;
};

export type CanvasMediaReferenceSource = {
  assetId?: string;
  id: string;
  key: string;
  mediaKind: ReferenceMediaKind;
  nodeId: string;
  previewUrl?: string;
  referenceUploadId?: string;
  source: 'canvas';
  title: string;
};

export type CanvasReferenceSelection = {
  edgeId?: string;
  imageUrl: string;
  key: string;
  nodeId: string;
  referenceUploadId?: string;
  source: 'canvas' | 'upstream';
  title: string;
};

export type ResolvedReferenceChip = {
  assetId?: string;
  edgeId?: string;
  id: string;
  imageUrl: string;
  key: string;
  mentionLabel: string;
  nodeId?: string;
  referenceUploadId?: string;
  source: 'asset' | 'upstream';
  title: string;
};

function readCleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readNumeric(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isImageNode(node: CanvasReferenceNode | undefined | null): boolean {
  if (!node) return false;
  return node.type === 'image' || node.data?.kind === 'image';
}

function getNodeReferenceImageUrl(node: CanvasReferenceNode | undefined | null): string {
  if (!isImageNode(node)) return '';
  const data = node?.data || {};

  const thumbnailUrl = readCleanString(data.thumbnailUrl);
  if (thumbnailUrl) return thumbnailUrl;

  const originalImageUrl = readCleanString(data.originalImageUrl);
  if (originalImageUrl) return originalImageUrl;

  const generatedResults = Array.isArray(data.generatedResults)
    ? (data.generatedResults as Array<{ url?: unknown; id?: unknown }>)
    : [];
  const coverResultId = readCleanString(data.coverResultId);
  const activeResultIndex = Math.max(0, Math.floor(readNumeric(data.activeResultIndex)));
  const covered = generatedResults.find((item) => readCleanString(item?.id) === coverResultId);
  const active = generatedResults[activeResultIndex];
  const first = generatedResults[0];
  const generatedUrl = readCleanString(covered?.url) || readCleanString(active?.url) || readCleanString(first?.url);
  if (generatedUrl) return generatedUrl;

  return '';
}

function getNodeReferenceTitle(node: CanvasReferenceNode | undefined | null): string {
  if (!node) return '图片';
  const title = readCleanString(node.data?.title);
  if (title) return title;
  return node.type === 'image' || node.data?.kind === 'image' ? '图片' : '节点';
}

function getNodeSortValue(node: CanvasReferenceNode | undefined | null, index: number): number {
  if (!node) return index;
  const updatedAt = readNumeric(node.data?.updatedAt);
  if (updatedAt > 0) return updatedAt;
  const createdAt = readNumeric(node.data?.createdAt);
  if (createdAt > 0) return createdAt;
  return index;
}

function getNodeReferenceMediaKind(node: CanvasReferenceNode | undefined | null): ReferenceMediaKind | null {
  if (!node) return null;
  const nodeKind = readCleanString(node.data?.kind || node.type).toLowerCase();
  if (nodeKind === 'image' || nodeKind === 'video' || nodeKind === 'audio') return nodeKind;
  const mimeType = readCleanString(node.data?.mimeType).toLowerCase();
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return null;
}

function getNodeReferencePreviewUrl(node: CanvasReferenceNode | undefined | null, mediaKind: ReferenceMediaKind): string {
  if (!node) return '';
  if (mediaKind === 'image') return getNodeReferenceImageUrl(node);
  const data = node.data || {};
  const candidates = mediaKind === 'video'
    ? [data.posterUrl, data.thumbnailUrl, data.previewUrl, data.videoUrl, data.originalVideoUrl]
    : [data.previewUrl, data.thumbnailUrl, data.audioUrl, data.originalAudioUrl];
  return candidates.map(readCleanString).find(Boolean) || '';
}

function getNodeMediaReferenceTitle(node: CanvasReferenceNode | undefined | null, mediaKind: ReferenceMediaKind): string {
  const title = readCleanString(node?.data?.title);
  if (title) return title;
  if (mediaKind === 'video') return '视频';
  if (mediaKind === 'audio') return '音频';
  return '图片';
}

export function buildCanvasMediaReferenceSources(
  input: BuildCanvasMediaReferenceSourcesInput,
): CanvasMediaReferenceSource[] {
  const currentNodeId = readCleanString(input.currentNodeId);
  const allowedKinds = new Set(input.allowedKinds);
  const nodes = Array.isArray(input.nodes) ? [...input.nodes] : [];

  return nodes
    .map((node, index) => {
      const nodeId = readCleanString(node.id);
      const mediaKind = getNodeReferenceMediaKind(node);
      if (!nodeId || nodeId === currentNodeId || !mediaKind || !allowedKinds.has(mediaKind)) return null;
      const previewUrl = getNodeReferencePreviewUrl(node, mediaKind);
      const assetId = readCleanString(node.data?.assetId) || undefined;
      const referenceUploadId = readCleanString(node.data?.referenceUploadId) || undefined;
      return {
        ...(assetId ? { assetId } : {}),
        id: nodeId,
        key: `canvas:${nodeId}`,
        mediaKind,
        nodeId,
        ...(previewUrl ? { previewUrl } : {}),
        ...(referenceUploadId ? { referenceUploadId } : {}),
        source: 'canvas' as const,
        sortValue: getNodeSortValue(node, index),
        title: getNodeMediaReferenceTitle(node, mediaKind),
      };
    })
    .filter((item): item is CanvasMediaReferenceSource & { sortValue: number } => Boolean(item))
    .sort((a, b) => b.sortValue - a.sortValue || a.title.localeCompare(b.title))
    .map(({ sortValue, ...item }) => item);
}

export function buildCanvasImageReferenceSources(
  input: BuildCanvasImageReferenceSourcesInput,
): CanvasImageReferenceSource[] {
  return buildCanvasMediaReferenceSources({ ...input, allowedKinds: ['image'] })
    .flatMap((source) => source.previewUrl ? [{
      ...(source.assetId ? { assetId: source.assetId } : {}),
      id: source.id,
      imageUrl: source.previewUrl,
      key: source.key,
      nodeId: source.nodeId,
      ...(source.referenceUploadId ? { referenceUploadId: source.referenceUploadId } : {}),
      source: source.source,
      title: source.title,
    }] : []);
}

export function resolveReferenceSourceSelectionByNodeId(
  input: BuildCanvasImageReferenceSourcesInput & {
    nodeId?: string | null;
    upstreamImageRefs?: readonly FlowUpstreamImageRef[];
  },
): CanvasReferenceSelection | null {
  const nodeId = readCleanString(input.nodeId);
  if (!nodeId) return null;

  const upstreamMatch = Array.isArray(input.upstreamImageRefs)
    ? input.upstreamImageRefs.find((item) => readCleanString(item.id) === nodeId)
    : undefined;
  if (upstreamMatch) {
    return {
      edgeId: readCleanString(upstreamMatch.edgeId) || undefined,
      imageUrl: readCleanString(upstreamMatch.imageUrl),
      key: readCleanString(upstreamMatch.key) || `upstream:${nodeId}`,
      nodeId,
      referenceUploadId: readCleanString(upstreamMatch.referenceUploadId) || undefined,
      source: 'upstream',
      title: readCleanString(upstreamMatch.title) || '图片',
    };
  }

  const canvasMatch = buildCanvasImageReferenceSources(input).find((item) => item.nodeId === nodeId);
  if (!canvasMatch) return null;
  return {
    edgeId: undefined,
    imageUrl: canvasMatch.imageUrl,
    key: `upstream:${canvasMatch.nodeId}`,
    nodeId: canvasMatch.nodeId,
    referenceUploadId: canvasMatch.referenceUploadId,
    source: 'canvas',
    title: canvasMatch.title,
  };
}

export function resolveReferenceChips(
  input: ResolveReferenceChipsInput,
): ResolvedReferenceChip[] {
  const assetItemsById = input.assetItemsById || {};
  const referenceAssetPreviewUrlsById = input.referenceAssetPreviewUrlsById || {};
  const referenceOrder = Array.isArray(input.referenceOrder)
    ? input.referenceOrder.map((item) => readCleanString(item)).filter(Boolean)
    : [];
  const orderIndex = new Map<ReferenceOrderItem, number>(referenceOrder.map((item, index) => [item, index]));
  const upstreamImageRefs = Array.isArray(input.upstreamImageRefs) ? input.upstreamImageRefs : [];
  const referenceAssetItemIds = Array.isArray(input.referenceAssetItemIds)
    ? input.referenceAssetItemIds.map((item) => readCleanString(item)).filter(Boolean)
    : [];

  const rawItems: Array<ResolvedReferenceChip & { orderIndex: number; sourceIndex: number }> = [];

  upstreamImageRefs.forEach((item, sourceIndex) => {
    const key = readCleanString(item.key) || `upstream:${readCleanString(item.id)}`;
    if (!key) return;
    rawItems.push({
      assetId: readCleanString(item.assetId) || undefined,
      edgeId: readCleanString(item.edgeId) || undefined,
      id: readCleanString(item.id) || key,
      imageUrl: readCleanString(item.imageUrl),
      key,
      mentionLabel: '',
      nodeId: readCleanString(item.id) || undefined,
      referenceUploadId: readCleanString(item.referenceUploadId) || undefined,
      source: 'upstream',
      sourceIndex,
      title: readCleanString(item.title) || '图片',
      orderIndex: orderIndex.get(key) ?? Number.MAX_SAFE_INTEGER,
    });
  });

  referenceAssetItemIds.forEach((assetId, sourceIndex) => {
    const asset = assetItemsById[assetId];
    const key = `asset:${assetId}`;
    const imageUrl = readCleanString(asset?.previewUrl) || readCleanString(referenceAssetPreviewUrlsById[assetId]);
    if (!asset || !imageUrl) return;
    rawItems.push({
      assetId,
      edgeId: undefined,
      id: assetId,
      imageUrl,
      key,
      mentionLabel: '',
      nodeId: undefined,
      referenceUploadId: undefined,
      source: 'asset',
      sourceIndex,
      title: readCleanString(asset.title) || readCleanString(asset.originalFilename) || '素材',
      orderIndex: orderIndex.get(key) ?? Number.MAX_SAFE_INTEGER,
    });
  });

  const seen = new Set<string>();
  return rawItems
    .filter((item) => {
      if (seen.has(item.key)) return false;
      seen.add(item.key);
      return true;
    })
    .sort((a, b) => a.orderIndex - b.orderIndex || a.sourceIndex - b.sourceIndex)
    .map((item, index) => ({
      assetId: item.assetId,
      edgeId: item.edgeId,
      id: item.id,
      imageUrl: item.imageUrl,
      key: item.key,
      mentionLabel: `Image ${index + 1}`,
      nodeId: item.nodeId,
      referenceUploadId: item.referenceUploadId,
      source: item.source,
      title: item.title,
    }));
}
