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
