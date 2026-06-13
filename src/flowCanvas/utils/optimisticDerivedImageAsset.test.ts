import { describe, expect, it } from 'vitest';

import {
  buildFailedDerivedImagePatch,
  buildOptimisticDerivedImageNodeData,
  buildPersistedDerivedImagePatch,
} from './optimisticDerivedImageAsset';

describe('optimisticDerivedImageAsset', () => {
  it('builds an immediately renderable local derived image node', () => {
    const nodeData = buildOptimisticDerivedImageNodeData({
      aspectRatio: 16 / 9,
      editType: 'crop',
      imageUrl: 'blob://crop-result',
      naturalHeight: 720,
      naturalWidth: 1280,
      sourceAssetId: 'source-asset',
      title: 'cropped result 1',
    });

    expect(nodeData).toMatchObject({
      generationStatus: 'generating',
      lastEditType: 'crop',
      source: 'crop',
      sourceAssetId: 'source-asset',
      status: 'running',
      thumbnailUrl: 'blob://crop-result',
      title: 'cropped result 1',
    });
    expect(nodeData).not.toHaveProperty('assetId');
    expect(nodeData).not.toHaveProperty('assetIds');
  });

  it('replaces local preview fields with persisted asset-backed node data', () => {
    const patch = buildPersistedDerivedImagePatch({
      lastEditType: 'crop',
      naturalHeight: 720,
      naturalWidth: 1280,
      nodeData: {
        assetId: 'asset-crop',
        assetIds: ['asset-crop'],
        thumbnailUrl: 'https://cdn.test/crop-preview.webp',
      },
    });

    expect(patch).toMatchObject({
      assetId: 'asset-crop',
      assetIds: ['asset-crop'],
      generationStatus: 'done',
      lastEditType: 'crop',
      status: 'success',
      thumbnailUrl: 'https://cdn.test/crop-preview.webp',
    });
  });

  it('keeps the local preview visible when background persistence fails', () => {
    expect(buildFailedDerivedImagePatch(new Error('upload timeout'))).toMatchObject({
      errorMessage: 'upload timeout',
      generationStatus: 'error',
      status: 'error',
    });
  });
});
