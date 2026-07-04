import type { FlowImageReferenceComparisonSource } from '../types';

type ImageViewerReferenceInput = {
  assetId?: string | null;
  id?: string | null;
  key?: string | null;
  label?: string | null;
  mentionLabel?: string | null;
  nodeId?: string | null;
  source?: string | null;
  title?: string | null;
};

const readCleanString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const parseKeyValue = (key: string, prefix: string) => {
  if (!key.startsWith(prefix)) return '';
  return key.slice(prefix.length).trim();
};

export type ImageViewerRect = {
  height: number;
  left: number;
  top: number;
  width: number;
};

const isPositiveFinite = (value: unknown) => Number.isFinite(Number(value)) && Number(value) > 0;

export function calculateContainedImageRect(input: {
  containerHeight?: number | null;
  containerWidth?: number | null;
  imageNaturalHeight?: number | null;
  imageNaturalWidth?: number | null;
}): ImageViewerRect {
  const containerWidth = Number(input.containerWidth || 0);
  const containerHeight = Number(input.containerHeight || 0);
  if (!isPositiveFinite(containerWidth) || !isPositiveFinite(containerHeight)) {
    return { height: 0, left: 0, top: 0, width: 0 };
  }

  const imageNaturalWidth = Number(input.imageNaturalWidth || 0);
  const imageNaturalHeight = Number(input.imageNaturalHeight || 0);
  if (!isPositiveFinite(imageNaturalWidth) || !isPositiveFinite(imageNaturalHeight)) {
    return { height: containerHeight, left: 0, top: 0, width: containerWidth };
  }

  const scale = Math.min(containerWidth / imageNaturalWidth, containerHeight / imageNaturalHeight);
  const width = imageNaturalWidth * scale;
  const height = imageNaturalHeight * scale;
  return {
    height,
    left: (containerWidth - width) / 2,
    top: (containerHeight - height) / 2,
    width,
  };
}

export function getComparisonSplitPercentFromClientX(clientX: number, rect: Pick<ImageViewerRect, 'left' | 'width'>) {
  if (!isPositiveFinite(rect.width)) return 50;
  const percent = ((clientX - rect.left) / rect.width) * 100;
  return Math.min(100, Math.max(0, percent));
}

export function formatImageViewerDateTime(timestamp?: number | null) {
  const date = timestamp === undefined || timestamp === null ? new Date() : new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function readImageViewerComparisonSource(value: unknown): FlowImageReferenceComparisonSource | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  const key = readCleanString(input.key);
  const source = readCleanString(input.source);
  if (!key || (source !== 'asset' && source !== 'upstream')) return null;

  const assetId = readCleanString(input.assetId);
  const nodeId = readCleanString(input.nodeId);
  const label = readCleanString(input.label);
  return {
    key,
    source,
    ...(assetId ? { assetId } : {}),
    ...(nodeId ? { nodeId } : {}),
    ...(label ? { label } : {}),
  };
}

export function buildImageViewerComparisonSource(
  references: readonly ImageViewerReferenceInput[] | undefined,
): FlowImageReferenceComparisonSource | null {
  const first = references?.find((item) => readCleanString(item.key));
  if (!first) return null;

  const key = readCleanString(first.key);
  const inputSource = readCleanString(first.source);
  const label = readCleanString(first.mentionLabel) || readCleanString(first.label) || readCleanString(first.title);

  if (inputSource === 'asset' || key.startsWith('asset:')) {
    const assetId = readCleanString(first.assetId) || parseKeyValue(key, 'asset:') || readCleanString(first.id);
    if (!assetId) return null;
    return {
      assetId,
      key,
      ...(label ? { label } : {}),
      source: 'asset',
    };
  }

  if (inputSource === 'upstream' || key.startsWith('upstream:')) {
    const nodeId = readCleanString(first.nodeId) || parseKeyValue(key, 'upstream:') || readCleanString(first.id);
    if (!nodeId) return null;
    const assetId = readCleanString(first.assetId);
    return {
      ...(assetId ? { assetId } : {}),
      key,
      ...(label ? { label } : {}),
      nodeId,
      source: 'upstream',
    };
  }

  return null;
}

export function buildImageViewerComparisonSourceFromReferenceKeys(input: {
  referenceAssetItemIds?: unknown;
  referenceOrder?: unknown;
}): FlowImageReferenceComparisonSource | null {
  const referenceOrder = Array.isArray(input.referenceOrder)
    ? input.referenceOrder.map((item) => readCleanString(item)).filter(Boolean)
    : [];
  const referenceAssetItemIds = Array.isArray(input.referenceAssetItemIds)
    ? input.referenceAssetItemIds.map((item) => readCleanString(item)).filter(Boolean)
    : [];

  const firstKey = referenceOrder[0] || (referenceAssetItemIds[0] ? `asset:${referenceAssetItemIds[0]}` : '');
  if (!firstKey) return null;
  const fallbackAssetId = firstKey.startsWith('asset:') ? parseKeyValue(firstKey, 'asset:') : referenceAssetItemIds[0];
  return buildImageViewerComparisonSource([
    {
      assetId: fallbackAssetId,
      id: firstKey.startsWith('upstream:') ? parseKeyValue(firstKey, 'upstream:') : fallbackAssetId,
      key: firstKey,
      label: 'Image 1',
      source: firstKey.startsWith('upstream:') ? 'upstream' : 'asset',
    },
  ]);
}
