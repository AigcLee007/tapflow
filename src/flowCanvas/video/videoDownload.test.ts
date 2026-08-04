import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAssetDownloadUrlMock = vi.hoisted(() => vi.fn());

vi.mock('../../assets/assetApi', () => ({
  getAssetDownloadUrl: (...args: unknown[]) => getAssetDownloadUrlMock(...args),
}));

import { downloadVideoAsset } from './videoDownload';

describe('downloadVideoAsset', () => {
  beforeEach(() => {
    getAssetDownloadUrlMock.mockReset();
    document.body.innerHTML = '';
  });

  it('signs the asset only when clicked and removes the temporary download anchor', async () => {
    getAssetDownloadUrlMock.mockResolvedValue({
      expiresAt: '2026-08-04T12:00:00.000Z',
      method: 'GET',
      url: 'https://cdn.test/fresh-video.mp4?X-Amz-Signature=private',
    });
    const appendChild = vi.spyOn(document.body, 'appendChild');
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    await downloadVideoAsset({ assetId: 'asset-video-1', filename: 'shot.mp4' });

    expect(getAssetDownloadUrlMock).toHaveBeenCalledWith('asset-video-1');
    const anchor = appendChild.mock.calls[0]?.[0] as HTMLAnchorElement;
    expect(anchor.href).toBe('https://cdn.test/fresh-video.mp4?X-Amz-Signature=private');
    expect(anchor.download).toBe('shot.mp4');
    expect(anchor.rel).toBe('noopener noreferrer');
    expect(click).toHaveBeenCalledTimes(1);
    expect(document.body.contains(anchor)).toBe(false);
  });

  it('returns a user-safe error when the download URL cannot be signed', async () => {
    getAssetDownloadUrlMock.mockRejectedValue(new Error('upstream signing diagnostics'));

    await expect(downloadVideoAsset({ assetId: 'asset-video-1', filename: 'shot.mp4' }))
      .rejects.toThrow('Unable to download video. Please try again.');
  });
});
