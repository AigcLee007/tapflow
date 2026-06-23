import { beforeEach, describe, expect, it, vi } from 'vitest';

const uploadAssetFileMock = vi.fn();
const getAssetVariantUrlMock = vi.fn();
const getAssetDownloadUrlMock = vi.fn();
const getImageNaturalSizeMock = vi.fn();
const uploadReferenceImageFileMock = vi.fn();

vi.mock('../../assets/assetApi', () => ({
  getAssetDownloadUrl: (...args: unknown[]) => getAssetDownloadUrlMock(...args),
  getAssetVariantUrl: (...args: unknown[]) => getAssetVariantUrlMock(...args),
  uploadAssetFile: (...args: unknown[]) => uploadAssetFileMock(...args),
}));

vi.mock('../../services/referenceUploadsApi', () => ({
  uploadReferenceImageFile: (...args: unknown[]) => uploadReferenceImageFileMock(...args),
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
    uploadReferenceImageFileMock.mockReset();
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

  it('does not revoke a preview url that is still being persisted on the node', async () => {
    const revokeObjectURL = vi.fn();
    const previousUrl = globalThis.URL.revokeObjectURL;
    Object.defineProperty(globalThis.URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL,
    });

    const { revokeUnusedLocalPreviewUrls } = await import('./localImageUpload');

    revokeUnusedLocalPreviewUrls({
      activePreviewUrl: 'blob://preview',
      persistedPreviewUrl: 'blob://preview',
      sourceUrl: 'blob://source',
    });

    expect(revokeObjectURL).toHaveBeenCalledWith('blob://source');
    expect(revokeObjectURL).not.toHaveBeenCalledWith('blob://preview');

    Object.defineProperty(globalThis.URL, 'revokeObjectURL', {
      configurable: true,
      value: previousUrl,
    });
  });
});

describe('uploadLocalImageAndBuildReferenceNodeData', () => {
  beforeEach(() => {
    uploadAssetFileMock.mockReset();
    getAssetVariantUrlMock.mockReset();
    getAssetDownloadUrlMock.mockReset();
    getImageNaturalSizeMock.mockReset();
    uploadReferenceImageFileMock.mockReset();
  });

  it('stores uploaded local images as temporary references instead of assets', async () => {
    uploadReferenceImageFileMock.mockResolvedValue({
      createdAt: '2026-06-21T00:00:00.000Z',
      expiresAt: '2026-06-28T00:00:00.000Z',
      height: 768,
      id: 'reference-upload-1',
      mimeType: 'image/png',
      originalFilename: 'cat.png',
      previewUrl: null,
      sizeBytes: 3,
      width: 1024,
    });

    const { uploadLocalImageAndBuildReferenceNodeData } = await import('./localImageUpload');
    const file = new File(['cat'], 'cat.png', { type: 'image/png' });

    const result = await uploadLocalImageAndBuildReferenceNodeData({
      file,
      localPreviewUrl: 'blob://cat-preview',
      natural: { h: 768, w: 1024 },
      source: 'node-upload',
      title: 'Cat',
    });

    expect(uploadReferenceImageFileMock).toHaveBeenCalledWith({
      file,
      height: 768,
      localPreviewUrl: 'blob://cat-preview',
      width: 1024,
    });
    expect(uploadAssetFileMock).not.toHaveBeenCalled();
    expect(result.nodeData).toMatchObject({
      assetId: undefined,
      assetIds: undefined,
      originalImageUrl: 'blob://cat-preview',
      referenceUploadId: 'reference-upload-1',
      source: 'node-upload',
      thumbnailUrl: 'blob://cat-preview',
      title: 'Cat',
      uploadStatus: 'done',
    });
    expect(getImageNaturalSizeMock).not.toHaveBeenCalled();
  });

  it('falls back to the server preview url when no local preview is available', async () => {
    uploadReferenceImageFileMock.mockResolvedValue({
      createdAt: '2026-06-21T00:00:00.000Z',
      expiresAt: '2026-06-28T00:00:00.000Z',
      height: 512,
      id: 'reference-upload-2',
      mimeType: 'image/png',
      originalFilename: 'dog.png',
      previewUrl: 'https://cdn.test/temp-reference-2.png',
      sizeBytes: 3,
      width: 512,
    });

    const { uploadLocalImageAndBuildReferenceNodeData } = await import('./localImageUpload');
    const file = new File(['dog'], 'dog.png', { type: 'image/png' });

    const result = await uploadLocalImageAndBuildReferenceNodeData({
      file,
      natural: { h: 512, w: 512 },
      source: 'canvas-upload',
      title: 'Dog',
    });

    expect(result.nodeData).toMatchObject({
      originalImageUrl: 'https://cdn.test/temp-reference-2.png',
      referenceUploadId: 'reference-upload-2',
      thumbnailUrl: 'https://cdn.test/temp-reference-2.png',
    });
  });
});
