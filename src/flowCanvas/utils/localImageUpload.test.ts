import { beforeEach, describe, expect, it, vi } from 'vitest';

const uploadAssetFileMock = vi.fn();
const getAssetVariantUrlMock = vi.fn();
const getAssetDownloadUrlMock = vi.fn();
const getImageNaturalSizeMock = vi.fn();

vi.mock('../../assets/assetApi', () => ({
  getAssetDownloadUrl: (...args: unknown[]) => getAssetDownloadUrlMock(...args),
  getAssetVariantUrl: (...args: unknown[]) => getAssetVariantUrlMock(...args),
  uploadAssetFile: (...args: unknown[]) => uploadAssetFileMock(...args),
}));

vi.mock('./imageUtils', () => ({
  getImageNaturalSize: (...args: unknown[]) => getImageNaturalSizeMock(...args),
}));

describe('createImmediateLocalImageNodeData', () => {
  beforeEach(() => {
    uploadAssetFileMock.mockReset();
    getAssetVariantUrlMock.mockReset();
    getAssetDownloadUrlMock.mockReset();
    getImageNaturalSizeMock.mockReset();
  });

  it('returns blob-backed node data without decoding or uploading', async () => {
    const { createImmediateLocalImageNodeData } = await import('./localImageUpload');
    const file = new File(['cat'], 'cat.png', { type: 'image/png' });

    const result = createImmediateLocalImageNodeData({
      file,
      objectUrl: 'blob://local-cat',
      source: 'node-upload',
      title: 'Cat',
    });

    expect(result).toMatchObject({
      localObjectUrl: 'blob://local-cat',
      nodeData: {
        generationStatus: 'done',
        mimeType: 'image/png',
        originalImageUrl: 'blob://local-cat',
        source: 'node-upload',
        status: 'success',
        thumbnailUrl: 'blob://local-cat',
        title: 'Cat',
        uploadStatus: 'uploading',
      },
    });
    expect(result.nodeData.width).toBeGreaterThan(0);
    expect(result.nodeData.height).toBeGreaterThan(0);
    expect(getImageNaturalSizeMock).not.toHaveBeenCalled();
    expect(uploadAssetFileMock).not.toHaveBeenCalled();
  });

  it('keeps upload failures separate from generation errors', async () => {
    const { buildLocalUploadFailureNodeData } = await import('./localImageUpload');

    expect(buildLocalUploadFailureNodeData(new TypeError('Failed to fetch'))).toMatchObject({
      errorMessage: undefined,
      generationStatus: 'done',
      status: 'success',
      uploadErrorMessage: 'Failed to fetch',
      uploadStatus: 'failed',
    });
  });
});

describe('uploadLocalImageAndBuildAssetNodeData', () => {
  beforeEach(() => {
    uploadAssetFileMock.mockReset();
    getAssetVariantUrlMock.mockReset();
    getAssetDownloadUrlMock.mockReset();
    getImageNaturalSizeMock.mockReset();
  });

  it('hydrates uploaded local images with a usable preview url', async () => {
    uploadAssetFileMock.mockResolvedValue({
      durationMs: null,
      height: 768,
      id: 'asset-1',
      mimeType: 'image/png',
      originalFilename: 'cat.png',
      previewUrl: undefined,
      source: 'upload',
      title: 'cat',
      width: 1024,
    });
    getAssetVariantUrlMock.mockResolvedValue({
      expiresAt: '2026-06-11T12:00:00.000Z',
      method: 'GET',
      url: 'https://cdn.test/asset-1-preview.png',
      variantKey: 'preview',
    });

    const { uploadLocalImageAndBuildAssetNodeData } = await import('./localImageUpload');
    const file = new File(['cat'], 'cat.png', { type: 'image/png' });

    const result = await uploadLocalImageAndBuildAssetNodeData({
      file,
      natural: { h: 768, w: 1024 },
      projectId: '11111111-1111-1111-1111-111111111111',
      source: 'node-upload',
      title: 'Cat',
    });

    expect(uploadAssetFileMock).toHaveBeenCalledWith({
      file,
      kind: 'image',
      projectId: '11111111-1111-1111-1111-111111111111',
    });
    expect(result.nodeData).toMatchObject({
      assetId: 'asset-1',
      originalImageUrl: 'https://cdn.test/asset-1-preview.png',
      thumbnailUrl: 'https://cdn.test/asset-1-preview.png',
      title: 'Cat',
    });
    expect(getImageNaturalSizeMock).not.toHaveBeenCalled();
  });

  it('falls back to the original download url when preview is unavailable', async () => {
    uploadAssetFileMock.mockResolvedValue({
      durationMs: null,
      height: 512,
      id: 'asset-2',
      mimeType: 'image/png',
      originalFilename: 'dog.png',
      previewUrl: undefined,
      source: 'upload',
      title: 'dog',
      width: 512,
    });
    getAssetVariantUrlMock.mockRejectedValue(new Error('missing preview variant'));
    getAssetDownloadUrlMock.mockResolvedValue({
      expiresAt: '2026-06-11T12:00:00.000Z',
      method: 'GET',
      url: 'https://cdn.test/asset-2-original.png',
    });

    const { uploadLocalImageAndBuildAssetNodeData } = await import('./localImageUpload');
    const file = new File(['dog'], 'dog.png', { type: 'image/png' });

    const result = await uploadLocalImageAndBuildAssetNodeData({
      file,
      natural: { h: 512, w: 512 },
      projectId: null,
      source: 'canvas-upload',
      title: 'Dog',
    });

    expect(result.nodeData).toMatchObject({
      assetId: 'asset-2',
      originalImageUrl: 'https://cdn.test/asset-2-original.png',
      thumbnailUrl: 'https://cdn.test/asset-2-original.png',
    });
  });
});
