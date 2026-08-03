type ImageResultIdentity = {
  assetId?: unknown;
  id?: unknown;
};

export function getImageResultAssetId(
  result: ImageResultIdentity | null | undefined,
  index: number,
  assetIds: unknown[] = [],
): string {
  const explicitAssetId = typeof result?.assetId === 'string' ? result.assetId.trim() : '';
  if (explicitAssetId) return explicitAssetId;

  const resultId = typeof result?.id === 'string' ? result.id.trim() : '';
  if (resultId.startsWith('asset:')) return resultId.slice('asset:'.length).trim();

  const indexedAssetId = typeof assetIds[index] === 'string' ? String(assetIds[index]).trim() : '';
  return indexedAssetId;
}

export function selectImageResultPreviewUrl(input: {
  assetId?: string;
  fallbackUrl?: string;
  persistedUrl?: string;
  resolvedUrl?: string;
}): string {
  return [input.resolvedUrl, input.persistedUrl, input.fallbackUrl]
    .map((value) => String(value || '').trim())
    .find(Boolean) || '';
}
