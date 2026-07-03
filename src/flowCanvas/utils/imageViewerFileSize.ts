export type ImageViewerAssetSizeLoader = (assetId: string) => Promise<{ sizeBytes?: number | null }>;
export type ImageViewerBlobLoader = (imageUrl: string) => Promise<{ size: number }>;

const isPositiveFinite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

export async function resolveImageViewerFileSizeBytes(input: {
  assetId?: string | null;
  imageUrl: string;
  loadAssetSize: ImageViewerAssetSizeLoader;
  loadImageBlob: ImageViewerBlobLoader;
}): Promise<number | null> {
  const assetId = String(input.assetId || '').trim();
  if (assetId) {
    try {
      const asset = await input.loadAssetSize(assetId);
      if (isPositiveFinite(asset.sizeBytes)) return asset.sizeBytes;
    } catch {
      // Fall back to the displayed URL size.
    }
  }

  try {
    const blob = await input.loadImageBlob(input.imageUrl);
    return isPositiveFinite(blob.size) ? blob.size : null;
  } catch {
    return null;
  }
}
