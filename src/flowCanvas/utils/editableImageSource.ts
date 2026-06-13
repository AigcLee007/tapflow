export type EditableImageSourceInput = {
  assetId?: string | null;
  fallbackUrl?: string | null;
  variantKey?: string | null;
};

export type EditableImageSource = {
  assetId?: string;
  url: string;
};

export function getAssetBytesUrl(assetId: string, variantKey = 'preview') {
  const query = variantKey ? `?variantKey=${encodeURIComponent(variantKey)}` : '';
  return `/api/v2/assets/${encodeURIComponent(assetId)}/bytes${query}`;
}

export function resolveEditableImageSource(input: EditableImageSourceInput): EditableImageSource {
  const assetId = String(input.assetId || '').trim();
  if (assetId) {
    return {
      assetId,
      url: getAssetBytesUrl(assetId, String(input.variantKey || 'preview')),
    };
  }

  return {
    assetId: undefined,
    url: String(input.fallbackUrl || '').trim(),
  };
}
