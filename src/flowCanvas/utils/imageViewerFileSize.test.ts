import { describe, expect, test, vi } from 'vitest';

import { resolveImageViewerFileSizeBytes } from './imageViewerFileSize';

describe('resolveImageViewerFileSizeBytes', () => {
  test('prefers original asset size over displayed preview blob size', async () => {
    const loadAssetSize = vi.fn().mockResolvedValue({ sizeBytes: 2_400_000 });
    const loadImageBlob = vi.fn().mockResolvedValue({ size: 62_000 });

    await expect(resolveImageViewerFileSizeBytes({
      assetId: 'asset-original',
      imageUrl: 'https://cdn.test/asset-preview.webp',
      loadAssetSize,
      loadImageBlob,
    })).resolves.toBe(2_400_000);

    expect(loadAssetSize).toHaveBeenCalledWith('asset-original');
    expect(loadImageBlob).not.toHaveBeenCalled();
  });

  test('falls back to displayed URL size when original asset metadata is unavailable', async () => {
    const loadAssetSize = vi.fn().mockRejectedValue(new Error('metadata unavailable'));
    const loadImageBlob = vi.fn().mockResolvedValue({ size: 62_000 });

    await expect(resolveImageViewerFileSizeBytes({
      assetId: 'asset-original',
      imageUrl: 'https://cdn.test/asset-preview.webp',
      loadAssetSize,
      loadImageBlob,
    })).resolves.toBe(62_000);
  });
});
