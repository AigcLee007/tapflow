import { describe, expect, it } from 'vitest';

import { resolveEditableImageSource } from './editableImageSource';

describe('resolveEditableImageSource', () => {
  it('prefers same-origin asset bytes over a transient thumbnail url', () => {
    const result = resolveEditableImageSource({
      assetId: 'asset-1',
      fallbackUrl: 'https://storage.example/preview.webp?X-Amz-Signature=temporary',
    });

    expect(result).toEqual({
      assetId: 'asset-1',
      url: '/api/v2/assets/asset-1/bytes?variantKey=preview',
    });
  });

  it('falls back to the provided image url for local or legacy nodes', () => {
    const result = resolveEditableImageSource({
      fallbackUrl: 'blob:http://localhost/image-1',
    });

    expect(result).toEqual({
      assetId: undefined,
      url: 'blob:http://localhost/image-1',
    });
  });
});
