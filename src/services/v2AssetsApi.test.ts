import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { getAssetBytesUrl, getAssetDownloadUrl, getAssetVariantUrl } from './v2AssetsApi';
import { clearStoredAuth, setStoredTokens } from './v2HttpClient';

describe('v2AssetsApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setStoredTokens({
      accessToken: 'asset-token',
      refreshToken: 'refresh-token',
    });
  });

  afterEach(() => {
    clearStoredAuth();
    vi.unstubAllGlobals();
  });

  test('getAssetDownloadUrl uses v2 http client auth headers', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          expiresAt: '2026-05-19T00:00:00.000Z',
          method: 'GET',
          url: 'https://example.com/download',
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await getAssetDownloadUrl('asset-123');

    expect(response).toEqual({
      expiresAt: '2026-05-19T00:00:00.000Z',
      method: 'GET',
      url: 'https://example.com/download',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v2/assets/asset-123/download-url',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer asset-token',
        }),
        method: 'GET',
      }),
    );
  });

  test('getAssetVariantUrl appends variantKey query string', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          expiresAt: '2026-05-19T00:00:00.000Z',
          method: 'GET',
          url: 'https://example.com/download-preview',
          variantKey: 'preview',
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await getAssetVariantUrl('asset-123', 'preview');

    expect(response).toEqual({
      expiresAt: '2026-05-19T00:00:00.000Z',
      method: 'GET',
      url: 'https://example.com/download-preview',
      variantKey: 'preview',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v2/assets/asset-123/download-url?variantKey=preview',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer asset-token',
        }),
        method: 'GET',
      }),
    );
  });

  test('getAssetBytesUrl builds a same-origin authenticated asset bytes URL', () => {
    expect(getAssetBytesUrl('asset 123', 'preview')).toBe(
      '/api/v2/assets/asset%20123/bytes?variantKey=preview',
    );
  });
});
